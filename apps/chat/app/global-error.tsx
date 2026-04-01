"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          background: "oklch(0.12 0.02 275)",
          color: "oklch(0.98 0 0)",
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "3rem",
                height: "3rem",
                borderRadius: "12px",
                background: "oklch(0.58 0.24 27 / 0.15)",
                marginBottom: "1.5rem",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="oklch(0.58 0.24 27)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginBottom: "0.5rem",
                lineHeight: 1.2,
              }}
            >
              Something went wrong
            </h1>

            <p
              style={{
                color: "oklch(0.50 0.02 275)",
                marginBottom: "2rem",
                lineHeight: 1.5,
                fontSize: "0.938rem",
              }}
            >
              An unexpected error occurred. Our team has been notified.
            </p>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  padding: "0.5rem 1.25rem",
                  borderRadius: "8px",
                  background: "oklch(0.60 0.12 260)",
                  color: "oklch(0.98 0 0)",
                  border: "1px solid oklch(0.60 0.12 260 / 0.4)",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                  transition: "background 150ms ease, box-shadow 150ms ease",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "oklch(0.65 0.14 260)";
                  e.currentTarget.style.boxShadow = "0 0 24px oklch(0.60 0.12 260 / 0.20)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "oklch(0.60 0.12 260)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                Try Again
              </button>
              <a
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.5rem 1.25rem",
                  borderRadius: "8px",
                  background: "oklch(0.22 0.03 275)",
                  color: "oklch(0.98 0 0)",
                  textDecoration: "none",
                  border: "1px solid oklch(0.40 0.02 275 / 0.50)",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                  transition: "background 150ms ease, border-color 150ms ease",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "oklch(0.26 0.03 275)";
                  e.currentTarget.style.borderColor = "oklch(0.50 0.02 275 / 0.60)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "oklch(0.22 0.03 275)";
                  e.currentTarget.style.borderColor = "oklch(0.40 0.02 275 / 0.50)";
                }}
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
