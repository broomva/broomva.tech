//! TLS dev-cert escape hatch (BRO-1186).
//!
//! Production CA verification is the default — neither `reqwest` (via
//! `rustls-tls` + `webpki-roots`) nor `tokio-tungstenite` (via
//! `rustls-tls-webpki-roots`) trust extra roots out of the box. The
//! lumen-smoke local dogfood at `https://127.0.0.1:8443` ships a
//! self-signed cert that has no production chain, so the CLI needs an
//! explicit opt-in path to append one extra root to the existing
//! `webpki` trust store.
//!
//! Two helpers below close the gap without weakening the default
//! posture:
//!
//! * [`resolve_ca_cert_path`] picks the `--cacert` flag first, then the
//!   `BROOMVA_CA_CERT` env var, then `None`. The "missing" case is the
//!   current production behaviour (production roots only).
//! * [`load_extra_root_cert`] loads a PEM file and returns a parsed
//!   `reqwest::Certificate` for the HTTP path.
//! * [`build_tungstenite_connector`] builds a tokio-tungstenite
//!   `Connector::Rustls` whose `RootCertStore` is the webpki defaults
//!   *plus* the dev cert. Without a dev cert the function returns
//!   `Ok(None)` so callers stay on the default `Connector::Plain` shape
//!   and avoid feature-gating ceremony at the call site.
//!
//! ## Why not `--insecure`?
//!
//! BRO-1186's design decision is explicit: no blanket cert-disable
//! flag. A future `BROOMVA_DEV_ALLOW_INSECURE=1` env-gated escape may
//! land if the dev workflow demands it, but that lives in its own PR.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::error::{BroomvaError, BroomvaResult};

/// Env var that pins a CA cert path when `--cacert` isn't supplied.
/// Documented alongside the flag so a stable shell-rc'd workflow stays
/// terse.
pub const BROOMVA_CA_CERT_ENV: &str = "BROOMVA_CA_CERT";

/// Resolve a dev CA cert path from the layered flag/env precedence.
///
/// Returns `None` when no override is requested. Callers MUST treat
/// this as "production CA only" — the existing default behaviour. The
/// function never inspects the filesystem; cert presence is validated
/// at load time by [`load_extra_root_cert`] /
/// [`build_tungstenite_connector`].
pub fn resolve_ca_cert_path(flag: Option<&str>) -> Option<PathBuf> {
    if let Some(p) = flag.filter(|s| !s.is_empty()) {
        return Some(PathBuf::from(p));
    }
    std::env::var(BROOMVA_CA_CERT_ENV)
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
}

/// Load a PEM file as a `reqwest::Certificate` for use with
/// `ClientBuilder::add_root_certificate`. The PEM may contain a chain
/// (multiple `BEGIN CERTIFICATE` blocks); reqwest accepts the bundle.
///
/// Errors:
/// - [`BroomvaError::User`] when the file doesn't exist, isn't
///   readable, or doesn't contain at least one valid `CERTIFICATE`
///   PEM block. We deliberately do NOT fall back silently — the user
///   pointed at a path; if the path is broken they need to know.
///
/// Note: `reqwest::Certificate::from_pem` under the `__rustls` feature
/// just stores the bytes opaquely and defers validation to connection
/// time. To fail loudly at flag-parse time we sniff the PEM with
/// `rustls-pemfile` first, then hand the original bytes to reqwest.
pub fn load_extra_root_cert(path: &Path) -> BroomvaResult<reqwest::Certificate> {
    let pem = std::fs::read(path).map_err(|e| {
        BroomvaError::User(format!("failed to read CA cert at {}: {e}", path.display()))
    })?;
    // Boundary check — make sure the file actually contains at least
    // one CERTIFICATE block before we hand it to reqwest.
    let mut cursor = pem.as_slice();
    let mut count = 0_usize;
    for cert_result in rustls_pemfile::certs(&mut cursor) {
        // Surface parse failures verbatim — they tell the user
        // exactly which PEM section was malformed.
        cert_result.map_err(|e| {
            BroomvaError::User(format!(
                "CA cert at {} is not a valid PEM: {e}",
                path.display()
            ))
        })?;
        count += 1;
    }
    if count == 0 {
        return Err(BroomvaError::User(format!(
            "CA cert at {} contained no CERTIFICATE blocks",
            path.display()
        )));
    }
    reqwest::Certificate::from_pem(&pem).map_err(|e| {
        BroomvaError::User(format!(
            "CA cert at {} could not be loaded by reqwest: {e}",
            path.display()
        ))
    })
}

/// Build a tokio-tungstenite `Connector::Rustls` whose trust store is
/// webpki-roots + the dev cert. When `dev_cert_path` is `None`, returns
/// `Ok(None)` so callers stay on the existing default path
/// (`connect_async`'s built-in connector) with no behaviour change.
///
/// This is the WS sibling of [`load_extra_root_cert`]. Returns a
/// `Connector` because tungstenite's `connect_async_tls_with_config`
/// takes a `Connector` and the rustls feature is the only one we
/// enable (matches the rustls-only posture from BRO-1168 Phase A —
/// `tokio-tungstenite` ships with `rustls-tls-webpki-roots`).
pub fn build_tungstenite_connector(
    dev_cert_path: Option<&Path>,
) -> BroomvaResult<Option<tokio_tungstenite::Connector>> {
    let Some(path) = dev_cert_path else {
        return Ok(None);
    };

    // 1. Seed the root store with the webpki defaults so production CAs
    //    keep working when only one extra root is added. `TrustAnchor`
    //    holds borrowed `Der<'static>` slices over the baked-in cert
    //    table — cloning is cheap (just a few Arc-ish bumps).
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    // 2. Read + parse the dev cert PEM. Loop over all certs in the
    //    file so chained / multi-cert PEMs (e.g. a leaf+intermediate
    //    bundle) work.
    let pem = std::fs::read(path).map_err(|e| {
        BroomvaError::User(format!("failed to read CA cert at {}: {e}", path.display()))
    })?;
    let mut cursor = pem.as_slice();
    let mut added = 0_usize;
    for cert_result in rustls_pemfile::certs(&mut cursor) {
        let cert = cert_result.map_err(|e| {
            BroomvaError::User(format!(
                "CA cert at {} is not a valid PEM: {e}",
                path.display()
            ))
        })?;
        roots.add(cert).map_err(|e| {
            BroomvaError::User(format!(
                "CA cert at {} could not be added to trust store: {e}",
                path.display()
            ))
        })?;
        added += 1;
    }
    if added == 0 {
        return Err(BroomvaError::User(format!(
            "CA cert at {} contained no CERTIFICATE blocks",
            path.display()
        )));
    }

    // 3. ClientConfig with the augmented roots and no client auth.
    //    rustls 0.23 picks safe defaults (TLS 1.3, modern ciphers).
    let config = rustls::ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    Ok(Some(tokio_tungstenite::Connector::Rustls(Arc::new(config))))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    /// Real, valid self-signed P-256 CA cert generated for these tests
    /// via:
    ///
    /// ```bash
    /// openssl req -x509 -newkey ec:<(openssl ecparam -name prime256v1) \
    ///     -keyout /tmp/test-key.pem -out /tmp/test-ca.pem \
    ///     -days 36500 -nodes -subj "/CN=broomva-cli-test-ca"
    /// ```
    ///
    /// The cert is self-signed and CA-basicConstraints true, so rustls'
    /// `RootCertStore::add` accepts it. We inline the fixture so the
    /// test doesn't depend on `openssl` being on the runner PATH.
    const TEST_PEM: &str = "-----BEGIN CERTIFICATE-----\n\
MIIBlDCCATmgAwIBAgIUYIeeHph4nAC8CSNrMQdWHPSzRFwwCgYIKoZIzj0EAwIw\n\
HjEcMBoGA1UEAwwTYnJvb212YS1jbGktdGVzdC1jYTAgFw0yNjA1MjAwMzM3NTRa\n\
GA8yMTI2MDQyNjAzMzc1NFowHjEcMBoGA1UEAwwTYnJvb212YS1jbGktdGVzdC1j\n\
YTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABNReqYJjFKq4O7Ol5OlAAoorycf6\n\
T4Wy4yAUB+94yp6ZeFHf+RrXnoEktmo2mQ6HfFYRmxIGxSlhYJew0s51dMCjUzBR\n\
MB0GA1UdDgQWBBT1y0fxFhQB6tTgU9WVFJo+DZ07IzAfBgNVHSMEGDAWgBT1y0fx\n\
FhQB6tTgU9WVFJo+DZ07IzAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0kA\n\
MEYCIQDEpMXHMlC/y6UZKaPD6N70sbTMKJSARfh7SI8jFkuteAIhAMKl/T76k9zq\n\
IYkXF2qrW+5ZHwRmxwtmBXLpBUZHj6Cg\n\
-----END CERTIFICATE-----\n";

    fn write_pem(body: &str) -> NamedTempFile {
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(body.as_bytes()).unwrap();
        f.flush().unwrap();
        f
    }

    #[test]
    fn resolve_prefers_flag_over_env() {
        // SAFETY: single-threaded test section; no other test mutates
        // BROOMVA_CA_CERT concurrently within this thread.
        unsafe { std::env::set_var(BROOMVA_CA_CERT_ENV, "/from/env") };
        let resolved = resolve_ca_cert_path(Some("/from/flag"));
        assert_eq!(resolved, Some(PathBuf::from("/from/flag")));
        unsafe { std::env::remove_var(BROOMVA_CA_CERT_ENV) };
    }

    #[test]
    fn resolve_falls_back_to_env() {
        unsafe { std::env::set_var(BROOMVA_CA_CERT_ENV, "/from/env") };
        let resolved = resolve_ca_cert_path(None);
        assert_eq!(resolved, Some(PathBuf::from("/from/env")));
        unsafe { std::env::remove_var(BROOMVA_CA_CERT_ENV) };
    }

    #[test]
    fn resolve_returns_none_when_neither_set() {
        unsafe { std::env::remove_var(BROOMVA_CA_CERT_ENV) };
        let resolved = resolve_ca_cert_path(None);
        assert!(resolved.is_none());
    }

    #[test]
    fn resolve_ignores_empty_flag_and_env() {
        unsafe { std::env::set_var(BROOMVA_CA_CERT_ENV, "") };
        assert!(resolve_ca_cert_path(Some("")).is_none());
        // Falls through to env which is also empty.
        assert!(resolve_ca_cert_path(None).is_none());
        unsafe { std::env::remove_var(BROOMVA_CA_CERT_ENV) };
    }

    #[test]
    fn load_extra_root_cert_accepts_valid_pem() {
        let f = write_pem(TEST_PEM);
        let cert = load_extra_root_cert(f.path()).expect("valid pem loads");
        // reqwest::Certificate has no public accessors, so we just
        // confirm the call site doesn't return Err. The integration is
        // exercised end-to-end by the manual lumen-smoke test
        // documented in CHANGELOG 0.6.1.
        let _ = cert;
    }

    #[test]
    fn load_extra_root_cert_rejects_missing_file() {
        let err = load_extra_root_cert(Path::new("/nonexistent/no.pem")).unwrap_err();
        match err {
            BroomvaError::User(s) => assert!(s.contains("failed to read"), "{s}"),
            other => panic!("expected User error, got {other:?}"),
        }
    }

    #[test]
    fn load_extra_root_cert_rejects_garbage_pem() {
        // Plain text — no BEGIN CERTIFICATE marker. The boundary check
        // surfaces "no CERTIFICATE blocks".
        let f = write_pem("not a real PEM file\n");
        let err = load_extra_root_cert(f.path()).unwrap_err();
        match err {
            BroomvaError::User(s) => {
                assert!(
                    s.contains("no CERTIFICATE blocks") || s.contains("not a valid PEM"),
                    "{s}"
                );
            }
            other => panic!("expected User error, got {other:?}"),
        }
    }

    #[test]
    fn load_extra_root_cert_rejects_pem_with_invalid_certificate_block() {
        // Has a BEGIN CERTIFICATE marker but the body isn't base64 of a
        // valid cert — exercises the `rustls-pemfile::certs` parse path.
        let f = write_pem("-----BEGIN CERTIFICATE-----\nnotbase64==\n-----END CERTIFICATE-----\n");
        let err = load_extra_root_cert(f.path()).unwrap_err();
        match err {
            BroomvaError::User(s) => {
                // Either rustls-pemfile rejects at base64-decode, or the
                // boundary sees zero successfully-parsed blocks. Both
                // are acceptable — they both fail loudly.
                assert!(
                    s.contains("not a valid PEM") || s.contains("no CERTIFICATE blocks"),
                    "{s}"
                );
            }
            other => panic!("expected User error, got {other:?}"),
        }
    }

    #[test]
    fn build_tungstenite_connector_returns_none_without_path() {
        let conn = build_tungstenite_connector(None).expect("no path is a no-op");
        assert!(conn.is_none(), "no cert path ⇒ no custom connector");
    }

    #[test]
    fn build_tungstenite_connector_loads_valid_pem() {
        let f = write_pem(TEST_PEM);
        let conn = build_tungstenite_connector(Some(f.path())).expect("valid pem yields connector");
        match conn {
            Some(tokio_tungstenite::Connector::Rustls(_)) => {}
            Some(_) => panic!("expected Connector::Rustls"),
            None => panic!("expected Some(Connector) when a path was provided"),
        }
    }

    #[test]
    fn build_tungstenite_connector_rejects_empty_pem() {
        // A file that exists but has no CERTIFICATE block.
        let f = write_pem("# just a comment\n");
        // `tokio_tungstenite::Connector` does NOT implement `Debug`, so
        // we can't call `.unwrap_err()` directly on
        // `Result<Option<Connector>, _>`. Match the `Result` manually.
        match build_tungstenite_connector(Some(f.path())) {
            Err(BroomvaError::User(s)) => {
                assert!(
                    s.contains("no CERTIFICATE blocks") || s.contains("not a valid PEM"),
                    "{s}"
                );
            }
            Err(other) => panic!("expected User error, got {other:?}"),
            Ok(_) => panic!("expected error for empty PEM"),
        }
    }

    #[test]
    fn build_tungstenite_connector_rejects_missing_file() {
        match build_tungstenite_connector(Some(Path::new("/nope.pem"))) {
            Err(BroomvaError::User(s)) => assert!(s.contains("failed to read"), "{s}"),
            Err(other) => panic!("expected User error, got {other:?}"),
            Ok(_) => panic!("expected error for missing file"),
        }
    }
}
