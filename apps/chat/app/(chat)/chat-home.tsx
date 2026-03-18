"use client";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ChatSystem } from "@/components/chat-system";
import type { AppModelId } from "@/lib/ai/app-models";
import { useChatId } from "@/providers/chat-id-provider";

export function ChatHome() {
  const { id } = useChatId();
  const searchParams = useSearchParams();
  const overrideModelId = useMemo(() => {
    const value = searchParams.get("modelId");
    return (value as AppModelId) || undefined;
  }, [searchParams]);
  const initialInput = useMemo(
    () => searchParams.get("q") ?? undefined,
    [searchParams],
  );
  return (
    <ChatSystem
      id={id}
      initialMessages={[]}
      initialInput={initialInput}
      isReadonly={false}
      overrideModelId={overrideModelId}
    />
  );
}
