"use client";

import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ConnectBaseAccountCard } from "@/components/account/connect-base-account-card";
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

interface OnchainIdentitySectionProps {
  animaDid?: string;
  animaAddress?: string;
  baseLinked: boolean;
  baseAddress?: string;
  crossLinked: boolean;
}

type CrossLinkState =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "verified" }
  | { kind: "error"; message: string };

interface WalletConnectResponse {
  accounts: WalletAccount[];
}

interface WalletAccount {
  address: string;
}

interface CrossLinkNonceResponse {
  nonce: string;
  message: string;
  animaDid: string;
  baseAddress: string;
}

interface CrossLinkVerifyResponse {
  crossLinked: true;
}

interface ErrorResponse {
  error: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUserRejectedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 4001
  );
}

function parseWalletAccount(value: unknown): WalletAccount | null {
  if (!isObject(value) || typeof value.address !== "string") {
    return null;
  }
  return { address: value.address };
}

function parseWalletConnectResponse(
  value: unknown,
): WalletConnectResponse | null {
  if (!isObject(value) || !Array.isArray(value.accounts)) {
    return null;
  }

  const accounts = value.accounts
    .map((account) => parseWalletAccount(account))
    .filter((account): account is WalletAccount => account !== null);

  if (accounts.length !== value.accounts.length) {
    return null;
  }

  return { accounts };
}

function parseAccountList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const accounts = value.filter(
    (account): account is string => typeof account === "string",
  );
  if (accounts.length !== value.length) {
    return null;
  }
  return accounts;
}

function parseCrossLinkNonceResponse(
  value: unknown,
): CrossLinkNonceResponse | null {
  if (
    !isObject(value) ||
    typeof value.nonce !== "string" ||
    typeof value.message !== "string" ||
    typeof value.animaDid !== "string" ||
    typeof value.baseAddress !== "string"
  ) {
    return null;
  }
  return {
    nonce: value.nonce,
    message: value.message,
    animaDid: value.animaDid,
    baseAddress: value.baseAddress,
  };
}

function parseCrossLinkVerifyResponse(
  value: unknown,
): CrossLinkVerifyResponse | null {
  if (!isObject(value) || value.crossLinked !== true) {
    return null;
  }
  return { crossLinked: true };
}

function parseErrorResponse(value: unknown): ErrorResponse | null {
  if (!isObject(value) || typeof value.error !== "string") {
    return null;
  }
  return { error: value.error };
}

function parseSignature(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function requestProviderAddress(provider: {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}): Promise<string> {
  try {
    const walletConnectPayload = parseWalletConnectResponse(
      await provider.request({
        method: "wallet_connect",
        params: [{ version: "1" }],
      }),
    );
    const account = walletConnectPayload?.accounts[0];
    if (account) {
      return account.address;
    }
  } catch (error) {
    if (isUserRejectedError(error)) {
      throw error;
    }
  }

  const accountList = parseAccountList(
    await provider.request({ method: "eth_requestAccounts" }),
  );
  const account = accountList?.[0];
  if (!account) {
    throw new Error("Wallet returned an invalid response.");
  }
  return account;
}

export function OnchainIdentitySection({
  animaDid,
  animaAddress,
  baseLinked,
  baseAddress,
  crossLinked,
}: OnchainIdentitySectionProps) {
  const [crossLinkState, setCrossLinkState] = useState<CrossLinkState>(() =>
    crossLinked ? { kind: "verified" } : { kind: "idle" },
  );

  const isCrossLinked = crossLinkState.kind === "verified";
  const showVerifyButton =
    Boolean(animaDid && baseLinked && baseAddress) && !isCrossLinked;

  const handleVerifySameOwner = useCallback(async () => {
    if (!animaDid || !baseAddress) {
      return;
    }

    setCrossLinkState({ kind: "verifying" });

    try {
      const { createBaseAccountSDK } = await import("@base-org/account");
      const provider = createBaseAccountSDK({
        appName: "broomva.tech",
      }).getProvider();

      const connectedAddress = await requestProviderAddress(provider);
      if (connectedAddress.toLowerCase() !== baseAddress.toLowerCase()) {
        throw new Error(
          "Connected wallet does not match your linked Base Account.",
        );
      }

      const nonceRes = await fetch("/api/base/cross-link/nonce", {
        method: "POST",
      });
      const nonceDetail = parseErrorResponse(
        await nonceRes
          .clone()
          .json()
          .catch(() => null),
      );
      if (!nonceRes.ok) {
        throw new Error(
          nonceDetail?.error ?? "Could not start cross-link verification.",
        );
      }

      const noncePayload = parseCrossLinkNonceResponse(
        await nonceRes.json().catch(() => null),
      );
      if (!noncePayload) {
        throw new Error("Could not start cross-link verification.");
      }

      const signature = parseSignature(
        await provider.request({
          method: "personal_sign",
          params: [noncePayload.message, connectedAddress],
        }),
      );
      if (!signature) {
        throw new Error("Wallet returned an invalid signature.");
      }

      const verifyRes = await fetch("/api/base/cross-link/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: noncePayload.message,
          signature,
        }),
      });
      const verifyDetail = parseErrorResponse(
        await verifyRes
          .clone()
          .json()
          .catch(() => null),
      );
      if (!verifyRes.ok) {
        throw new Error(
          verifyDetail?.error ?? "Cross-link verification failed.",
        );
      }

      const verifyPayload = parseCrossLinkVerifyResponse(
        await verifyRes.json().catch(() => null),
      );
      if (!verifyPayload) {
        throw new Error("Cross-link verification failed.");
      }

      setCrossLinkState({ kind: "verified" });
      toast.success("Base Account cross-linked to your Anima identity.");
    } catch (error) {
      if (isUserRejectedError(error)) {
        setCrossLinkState({ kind: "idle" });
        toast.info("Signature cancelled.");
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Unknown error verifying wallet ownership.";
      setCrossLinkState({ kind: "error", message });
      toast.error("Could not verify same owner", { description: message });
    }
  }, [animaDid, baseAddress]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Native Base wallet · passkey-secured</CardTitle>
          <CardDescription>
            {animaDid
              ? "Your Anima DID and embedded Base wallet are the primary onchain identity for this account."
              : "Enroll a passkey to mint your primary Anima DID and native Base wallet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {animaDid ? (
            <>
              <FieldRow label="DID" value={animaDid} mono />
              {animaAddress && (
                <FieldRow label="Wallet" value={animaAddress} mono />
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              Anima identity not yet provisioned.
            </p>
          )}

          {isCrossLinked && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-700 text-sm dark:text-emerald-300">
              <CheckCircle2 className="size-4" aria-hidden />
              <span>cross-linked to your Anima identity</span>
            </div>
          )}

          {crossLinkState.kind === "error" && (
            <Alert variant="destructive">
              <ShieldAlert className="size-4" aria-hidden />
              <AlertTitle>Verification failed</AlertTitle>
              <AlertDescription>{crossLinkState.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/account/security/passkey">
              {animaDid ? "Manage passkey" : "Enroll passkey"}
            </Link>
          </Button>
          {showVerifyButton && (
            <Button
              disabled={crossLinkState.kind === "verifying"}
              onClick={handleVerifySameOwner}
              variant="outline"
            >
              {crossLinkState.kind === "verifying" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />{" "}
                  Verifying…
                </>
              ) : (
                "Verify same owner"
              )}
            </Button>
          )}
        </CardFooter>
      </Card>

      <ConnectBaseAccountCard
        initialLinked={baseLinked}
        initialAddress={baseAddress}
      />
    </div>
  );
}

function FieldRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <div className="w-24 font-medium text-foreground text-xs uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`flex-1 break-all text-foreground/90 ${mono ? "font-mono text-xs" : "text-sm"}`}
      >
        {value}
      </div>
    </div>
  );
}
