"use client";

import {
  CheckCircle2,
  Link2,
  Loader2,
  ShieldAlert,
  Wallet,
} from "lucide-react";
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

interface ConnectBaseAccountCardProps {
  initialLinked: boolean;
  initialAddress?: string;
}

type ViewState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "linked"; address: string }
  | { kind: "error"; message: string };

interface NonceResponse {
  nonce: string;
}

interface WalletConnectResponse {
  accounts: WalletAccount[];
}

interface WalletAccount {
  address: string;
  capabilities?: {
    signInWithEthereum?: {
      message: string;
      signature: string;
    };
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseNonceResponse(value: unknown): NonceResponse | null {
  if (!isObject(value) || typeof value.nonce !== "string") {
    return null;
  }
  return { nonce: value.nonce };
}

function parseSiwe(
  value: unknown,
): { message: string; signature: string } | null {
  if (
    !isObject(value) ||
    typeof value.message !== "string" ||
    typeof value.signature !== "string"
  ) {
    return null;
  }
  return { message: value.message, signature: value.signature };
}

function parseWalletAccount(value: unknown): WalletAccount | null {
  if (!isObject(value) || typeof value.address !== "string") {
    return null;
  }

  // No capabilities object at all → a bare account (valid; just not signable).
  if (!("capabilities" in value) || value.capabilities === undefined) {
    return { address: value.address };
  }
  if (!isObject(value.capabilities)) {
    return null;
  }

  // No SIWE capability → bare account.
  const rawSiwe = value.capabilities.signInWithEthereum;
  if (rawSiwe === undefined) {
    return { address: value.address, capabilities: {} };
  }

  // SIWE present but malformed → reject the whole account.
  const signInWithEthereum = parseSiwe(rawSiwe);
  if (!signInWithEthereum) {
    return null;
  }

  return {
    address: value.address,
    capabilities: { signInWithEthereum },
  };
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

function isUserRejectedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 4001
  );
}

export function ConnectBaseAccountCard({
  initialLinked,
  initialAddress,
}: ConnectBaseAccountCardProps) {
  const [view, setView] = useState<ViewState>(() =>
    initialLinked && initialAddress
      ? { kind: "linked", address: initialAddress }
      : { kind: "idle" },
  );
  const [isUnlinking, setIsUnlinking] = useState(false);

  const handleConnect = useCallback(async () => {
    setView({ kind: "connecting" });
    try {
      const { createBaseAccountSDK } = await import("@base-org/account");
      const provider = createBaseAccountSDK({
        appName: "broomva.tech",
      }).getProvider();

      const nonceRes = await fetch("/api/base/nonce", { method: "POST" });
      if (!nonceRes.ok) {
        throw new Error("Could not start linking. Try again.");
      }

      const noncePayload = parseNonceResponse(
        await nonceRes.json().catch(() => null),
      );
      if (!noncePayload) {
        throw new Error("Could not start linking. Try again.");
      }

      const walletConnectPayload = parseWalletConnectResponse(
        await provider.request({
          method: "wallet_connect",
          params: [
            {
              version: "1",
              capabilities: {
                signInWithEthereum: {
                  nonce: noncePayload.nonce,
                  chainId: "0x2105",
                },
              },
            },
          ],
        }),
      );
      if (!walletConnectPayload) {
        throw new Error("Wallet returned an invalid response.");
      }

      const account = walletConnectPayload.accounts[0];
      const siwe = account?.capabilities?.signInWithEthereum;
      if (!account || !siwe) {
        throw new Error("Wallet did not return a signature.");
      }

      const linkRes = await fetch("/api/base/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: account.address,
          message: siwe.message,
          signature: siwe.signature,
          chainId: 8453,
        }),
      });
      if (!linkRes.ok) {
        const detail = (await linkRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(detail.error ?? "Linking failed.");
      }

      setView({ kind: "linked", address: account.address });
      toast.success("Base Account linked.");
    } catch (error) {
      if (isUserRejectedError(error)) {
        setView({ kind: "idle" });
        toast.info("Connection cancelled.");
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Unknown error linking Base Account.";
      setView({ kind: "error", message });
      toast.error("Could not link Base Account", { description: message });
    }
  }, []);

  const handleUnlink = useCallback(async () => {
    setIsUnlinking(true);
    try {
      const response = await fetch("/api/base/unlink", { method: "POST" });
      if (!response.ok) {
        throw new Error("Could not unlink Base Account.");
      }

      setView({ kind: "idle" });
      toast.success("Base Account unlinked.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error unlinking Base Account.";
      toast.error("Could not unlink Base Account", { description: message });
    } finally {
      setIsUnlinking(false);
    }
  }, []);

  if (view.kind === "linked") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" aria-hidden />
            Base Account linked
          </CardTitle>
          <CardDescription>
            This Base Account is linked to your broomva.tech profile for
            identity verification. It does not replace your account sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Base Account address" value={view.address} />
        </CardContent>
        <CardFooter>
          <Button
            disabled={isUnlinking}
            onClick={handleUnlink}
            variant="outline"
          >
            {isUnlinking ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />{" "}
                Unlinking…
              </>
            ) : (
              <>
                <Link2 className="size-4" aria-hidden /> Unlink Base Account
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-5" aria-hidden />
          Link a Base Account
        </CardTitle>
        <CardDescription>
          Link an ERC-4337 Base Account backed by a passkey to your broomva.tech
          profile for identity verification. This is not a sign-in method.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {view.kind === "error" && (
          <Alert variant="destructive">
            <ShieldAlert className="size-4" aria-hidden />
            <AlertTitle>Linking failed</AlertTitle>
            <AlertDescription>{view.message}</AlertDescription>
          </Alert>
        )}
        <ul className="space-y-2 text-muted-foreground text-sm">
          <li>
            Uses Base smart-account signing instead of exporting a private key.
          </li>
          <li>
            Supports passkey-backed accounts, including undeployed accounts.
          </li>
          <li>
            Links this wallet to your profile for verification only, not login.
          </li>
        </ul>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {view.kind === "error" && (
          <Button onClick={() => setView({ kind: "idle" })} variant="outline">
            Back
          </Button>
        )}
        <Button
          disabled={view.kind === "connecting"}
          onClick={handleConnect}
          size="lg"
        >
          {view.kind === "connecting" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />{" "}
              Connecting…
            </>
          ) : (
            <>
              <Wallet className="size-4" aria-hidden /> Connect Base Account
            </>
          )}
        </Button>
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
