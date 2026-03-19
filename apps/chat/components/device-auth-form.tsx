"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Terminal, Loader2 } from "lucide-react";
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

export function DeviceAuthForm({
  prefillCode,
  className,
  ...props
}: { prefillCode?: string } & React.ComponentPropsWithoutRef<"div">) {
  const [code, setCode] = useState(prefillCode ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [clientId, setClientId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

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
            <CardTitle className="text-xl">Device Authorized</CardTitle>
            <CardDescription>
              {clientId
                ? `"${clientId}" has been granted access.`
                : "The device has been granted access."}
              {" "}You can close this page and return to your terminal.
            </CardDescription>
          </CardHeader>
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
              The device login was denied. You can close this page.
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
            <Terminal className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Authorize Device</CardTitle>
          <CardDescription>
            Enter the code shown in your terminal to authorize the device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="user-code">Device Code</Label>
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
