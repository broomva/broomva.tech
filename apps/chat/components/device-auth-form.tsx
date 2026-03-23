"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Terminal, Loader2, Shield, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Status = "idle" | "submitting" | "approved" | "denied" | "error";

/** Human-readable descriptions for known capability names. */
const CAPABILITY_LABELS: Record<string, string> = {
  "chat:send": "Send messages in chat conversations",
  "chat:read": "Read chat conversations and message history",
  "organization:read": "Read organization metadata and membership",
  "organization:write": "Create and manage organizations",
  "usage:read": "Read usage events and billing data",
  "deployment:read": "Read deployment status and configuration",
  "deployment:write": "Create, update, and manage deployments",
  "memory:read": "Read from your memory vault",
  "memory:write": "Write to your memory vault",
  "trust:read": "Read trust scores",
};

export function DeviceAuthForm({
  prefillCode,
  agentName,
  capabilities,
  className,
  ...props
}: {
  prefillCode?: string;
  agentName?: string;
  capabilities?: string[];
} & React.ComponentPropsWithoutRef<"div">) {
  const [code, setCode] = useState(prefillCode ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [clientId, setClientId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const isAgentFlow = Boolean(agentName);
  const resolvedCapabilities = capabilities ?? [];

  async function handleAction(action: "approve" | "deny") {
    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/device/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: code.toUpperCase().trim(), action }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong");
        return;
      }

      if (action === "approve") {
        setStatus("approved");
        setClientId(data.client_id ?? "");
      } else {
        setStatus("denied");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  if (status === "approved") {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <CardTitle className="text-xl">
              {isAgentFlow ? "Agent Authorized" : "Device Authorized"}
            </CardTitle>
            <CardDescription>
              {isAgentFlow && agentName
                ? `Agent "${agentName}" has been granted access.`
                : clientId
                  ? `"${clientId}" has been granted access.`
                  : "The device has been granted access."}
              {" "}You can close this page and return to your terminal.
            </CardDescription>
          </CardHeader>
          {isAgentFlow && resolvedCapabilities.length > 0 && (
            <CardContent>
              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-green-500" />
                  Granted capabilities
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {resolvedCapabilities.map((cap) => (
                    <li key={cap} className="flex items-start gap-2">
                      <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                      <span>
                        <span className="font-mono text-xs">{cap}</span>
                        {CAPABILITY_LABELS[cap] && (
                          <span className="ml-1 text-muted-foreground/70">
                            &mdash; {CAPABILITY_LABELS[cap]}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <XCircle className="h-6 w-6 text-red-500" />
            </div>
            <CardTitle className="text-xl">Authorization Denied</CardTitle>
            <CardDescription>
              {isAgentFlow
                ? `Agent "${agentName}" was denied access.`
                : "The device login was denied."}{" "}
              You can close this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {isAgentFlow ? (
              <Bot className="h-6 w-6 text-primary" />
            ) : (
              <Terminal className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle className="text-xl">
            {isAgentFlow ? "Authorize Agent" : "Authorize Device"}
          </CardTitle>
          <CardDescription>
            {isAgentFlow
              ? `Agent "${agentName}" is requesting access. Enter the code shown in your terminal to approve.`
              : "Enter the code shown in your terminal to authorize the device."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {/* Agent capabilities preview */}
            {isAgentFlow && resolvedCapabilities.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-amber-500" />
                  This agent is requesting the following capabilities:
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {resolvedCapabilities.map((cap) => (
                    <li key={cap} className="flex items-start gap-2">
                      <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span>
                        <span className="font-mono text-xs">{cap}</span>
                        {CAPABILITY_LABELS[cap] && (
                          <span className="ml-1 text-muted-foreground/70">
                            &mdash; {CAPABILITY_LABELS[cap]}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="user-code">
                {isAgentFlow ? "Approval Code" : "Device Code"}
              </Label>
              <Input
                autoComplete="off"
                className="text-center font-mono text-lg tracking-widest"
                id="user-code"
                maxLength={9}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-1234"
                value={code}
              />
            </div>

            {errorMsg ? (
              <p className="text-destructive text-sm text-center">{errorMsg}</p>
            ) : null}

            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!code.trim() || status === "submitting"}
                onClick={() => handleAction("approve")}
                type="button"
              >
                {status === "submitting" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Approve
              </Button>
              <Button
                className="flex-1"
                disabled={!code.trim() || status === "submitting"}
                onClick={() => handleAction("deny")}
                type="button"
                variant="outline"
              >
                Deny
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
