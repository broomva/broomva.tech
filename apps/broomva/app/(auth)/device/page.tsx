import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { DeviceAuthForm } from "@/components/device-auth-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Authorize Device",
  description: "Approve a device login request for the broomva CLI or agent.",
};

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    agent_name?: string;
    capabilities?: string;
  }>;
}) {
  const params = await searchParams;
  const prefillCode = params.code ?? "";
  const agentName = params.agent_name ?? "";
  // capabilities are passed as a comma-separated string in the query param
  const capabilities = params.capabilities
    ? params.capabilities.split(",").filter(Boolean)
    : [];

  return (
    <div className="container mx-auto flex h-dvh w-screen flex-col items-center justify-center">
      <Link
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "absolute top-4 left-4 md:top-8 md:left-8"
        )}
        href="/"
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        Back
      </Link>
      <div className="mx-auto flex w-full flex-col items-center justify-center sm:w-[420px]">
        <DeviceAuthForm
          prefillCode={prefillCode}
          agentName={agentName}
          capabilities={capabilities}
        />
      </div>
    </div>
  );
}
