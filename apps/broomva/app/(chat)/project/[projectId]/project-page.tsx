"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import type { ParamsOf } from "@/.next/types/routes";
import { ChatSystem } from "@/components/chat-system";
import { useChatId } from "@/providers/chat-id-provider";
import { useTRPC } from "@/trpc/react";

export function ProjectPage() {
  const { projectId } = useParams<ParamsOf<"/project/[projectId]">>();
  const { id } = useChatId();
  const trpc = useTRPC();

  const { data: project } = useSuspenseQuery(
    trpc.project.getById.queryOptions({ id: projectId })
  );

  if (!project) {
    return notFound();
  }

  return (
    <ChatSystem
      id={id}
      initialMessages={[]}
      isReadonly={false}
      projectId={project.id}
    />
  );
}
