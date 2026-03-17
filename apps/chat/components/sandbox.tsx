/* eslint-disable @next/next/no-img-element */
"use client";

import type { ToolUIPart } from "ai";
import React from "react";
import type { BundledLanguage } from "shiki";
import {
  Sandbox,
  SandboxCode,
  SandboxContent,
  SandboxHeader,
  SandboxOutput,
  SandboxTabContent,
  SandboxTabs,
  SandboxTabsList,
  SandboxTabsTrigger,
} from "@/components/ai-elements/sandbox";

type SandboxComposedProps = {
  code: string;
  output?: string;
  language?: BundledLanguage;
  title?: string;
  state: ToolUIPart["state"];
};

export function SandboxComposed({
  code,
  output,
  language = "tsx",
  title,
  state,
}: SandboxComposedProps) {
  const [activeTab, setActiveTab] = React.useState("code");

  return (
    <Sandbox>
      <SandboxHeader state={state} title={title} />
      <SandboxContent>
        <SandboxTabs onValueChange={setActiveTab} value={activeTab}>
          <div className="flex items-center border-neutral-200 border-b dark:border-neutral-800">
            <SandboxTabsList>
              <SandboxTabsTrigger value="code">Code</SandboxTabsTrigger>
              <SandboxTabsTrigger value="output">Output</SandboxTabsTrigger>
            </SandboxTabsList>
          </div>
          <SandboxTabContent value="code">
            <SandboxCode code={code} language={language} />
          </SandboxTabContent>
          <SandboxTabContent value="output">
            <SandboxOutput code={output ?? ""} />
          </SandboxTabContent>
        </SandboxTabs>
      </SandboxContent>
    </Sandbox>
  );
}
