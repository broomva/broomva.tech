"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { ChatSystem } from "@/components/chat-system";
import type { AppModelId } from "@/lib/ai/app-models";
import { useChatId } from "@/providers/chat-id-provider";

export function ChatHome() {
  const { id } = useChatId();
  const router = useRouter();
  const searchParams = useSearchParams();

  const overrideModelId = useMemo(() => {
    const value = searchParams.get("modelId");
    return (value as AppModelId) || undefined;
  }, [searchParams]);

  const capturedRef = useRef<{ input: string; autoSubmit: boolean } | null>(
    null
  );
  const rawQ = searchParams.get("q");

  if (rawQ && !capturedRef.current) {
    capturedRef.current = { input: rawQ, autoSubmit: true };
  }

  const initialInput = capturedRef.current?.input ?? undefined;
  const autoSubmit = capturedRef.current?.autoSubmit ?? false;

  useEffect(() => {
    if (rawQ) {
      router.replace("/chat", { scroll: false });
    }
  }, [rawQ, router]);

  return (
    <ChatSystem
      id={id}
      initialMessages={[]}
      initialInput={initialInput}
      autoSubmit={autoSubmit}
      isReadonly={false}
      overrideModelId={overrideModelId}
    />
  );
}
