"use client";

/**
 * Passkey enrollment card — the UI surface for /account/security/passkey.
 *
 * BRO-1213 / M9-C. Handles UX states 1 + 2 from the M9-C handoff:
 *
 * - State 1 (first-time enrollment): user has no passkey on this device.
 *   We show the "enroll on this device" CTA → calls the lazy-loaded
 *   `enrollPasskey` helper → success card renders the DID + wallet.
 * - State 2 (existing-device sync): the user already has a passkey
 *   discoverable via iCloud Keychain / Google Password Manager. The
 *   status endpoint already reports `enrolled: true`; we just surface
 *   the recovered DID + wallet without forcing another ceremony.
 * - State 3 (rotation / new-device-no-sync) is intentionally a placeholder
 *   per the M9-C handoff — full rotation lands in M9-D / BRO-1214.
 *
 * # Bundle-size discipline (D4)
 *
 * The `enrollPasskey` helper is lazy-loaded inside the click handler so
 * the WebAuthn ceremony code never ships in the shared client shell.
 * This file itself is small (~6 KB minified, well under the 5 KB shell
 * tolerance once tree-shaken) and is safe to import from the page.
 */

import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PasskeyStatus } from "@/lib/anima";

interface PasskeyEnrollmentCardProps {
  userId: string;
  userEmail: string;
  initialStatus: PasskeyStatus;
}

type ViewState =
  | { kind: "idle" }
  | { kind: "enrolling" }
  | { kind: "enrolled"; did: string; address?: string; enrolledAt?: number }
  | { kind: "error"; message: string };

export function PasskeyEnrollmentCard({
  userId,
  userEmail,
  initialStatus,
}: PasskeyEnrollmentCardProps) {
  const [view, setView] = useState<ViewState>(() =>
    initialStatus.enrolled
      ? {
          kind: "enrolled",
          did: initialStatus.did,
          address: initialStatus.address,
          enrolledAt: initialStatus.enrolledAt,
        }
      : { kind: "idle" },
  );

  const handleEnroll = useCallback(async () => {
    setView({ kind: "enrolling" });
    const mod = await import("@/lib/anima/passkey-enrollment");
    const { enrollPasskey, PasskeyCeremonyAbortedError, PasskeyUnsupportedError } =
      mod;
    try {
      const result = await enrollPasskey({
        userId,
        userEmail,
      });
      setView({
        kind: "enrolled",
        did: result.did,
        address: result.address,
        enrolledAt: result.enrolledAt,
      });
      toast.success("Passkey enrolled. You can now sign Life transactions.");
    } catch (err) {
      if (err instanceof PasskeyCeremonyAbortedError) {
        setView({ kind: "idle" });
        toast.info("Enrollment cancelled.");
        return;
      }
      if (err instanceof PasskeyUnsupportedError) {
        setView({
          kind: "error",
          message:
            "This browser does not support passkeys. Try Safari ≥ 16, Chrome ≥ 108, or Firefox ≥ 122.",
        });
        return;
      }
      const message =
        err instanceof Error ? err.message : "Unknown enrollment error";
      setView({ kind: "error", message });
      toast.error("Enrollment failed", { description: message });
    }
  }, [userId, userEmail]);

  if (view.kind === "enrolled") {
    return <EnrolledView view={view} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5" aria-hidden />
          Enroll a passkey
        </CardTitle>
        <CardDescription>
          A passkey replaces passwords with a P-256 keypair stored on your
          device's secure element. broomva.tech uses it to mint your Anima
          identity (DID) and sign Life transactions without your private key
          ever leaving the device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {view.kind === "error" && (
          <Alert variant="destructive">
            <ShieldAlert className="size-4" aria-hidden />
            <AlertTitle>Enrollment failed</AlertTitle>
            <AlertDescription>{view.message}</AlertDescription>
          </Alert>
        )}
        <ul className="space-y-2 text-muted-foreground text-sm">
          <li>
            Uses your existing Touch ID, Face ID, Windows Hello, or device PIN.
          </li>
          <li>
            Syncs across your devices via iCloud Keychain or Google Password
            Manager.
          </li>
          <li>
            broomva.tech only ever sees the public key. The private key stays
            on your device.
          </li>
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          aria-label="Enroll a passkey on this device"
          disabled={view.kind === "enrolling"}
          onClick={handleEnroll}
          size="lg"
        >
          {view.kind === "enrolling" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Waiting
              for device…
            </>
          ) : (
            <>
              <KeyRound className="size-4" aria-hidden /> Enroll passkey
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

function EnrolledView({
  view,
}: {
  view: Extract<ViewState, { kind: "enrolled" }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2
            className="size-5 text-emerald-500"
            aria-hidden
          />
          Passkey active
        </CardTitle>
        <CardDescription>
          This device can sign Life transactions on your behalf. Your private
          key stays in the device secure element.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Decentralized identifier (DID)" value={view.did} />
        {view.address && (
          <Field label="Wallet address" value={view.address} />
        )}
        {view.enrolledAt && (
          <Field
            label="Enrolled"
            value={new Date(view.enrolledAt * 1000).toLocaleString()}
          />
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2">
        <p className="text-muted-foreground text-xs">
          Need to enroll a new device that doesn't share iCloud Keychain or
          Google Password Manager with this one? That flow lands with
          rotation in M9-D. For now, open broomva.tech on your existing
          device first — the passkey will sync automatically.
        </p>
      </CardFooter>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-medium text-foreground text-xs uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-1 break-all font-mono text-foreground/90 text-sm">
        {value}
      </div>
    </div>
  );
}
