"use client";

import {
  BrainIcon,
  ChevronRight,
  CpuIcon,
  GaugeIcon,
  ImageIcon,
  PanelRightClose,
  PanelRightOpen,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { useMemo } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useContextSidebar } from "@/hooks/use-context-sidebar";
import { useChatModels } from "@/providers/chat-models-provider";
import { useDefaultModel } from "@/providers/default-model-provider";
import { toolsDefinitions } from "@/lib/ai/tools/tools-definitions";
import { cn } from "@/lib/utils";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function CapabilityBadge({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <Badge
      variant={enabled ? "default" : "outline"}
      className={cn(
        "text-[10px] px-1.5 py-0",
        !enabled && "opacity-40"
      )}
    >
      {label}
    </Badge>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/section">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronRight className="size-3 transition-transform group-data-[state=open]/section:rotate-90" />
        <Icon className="size-3.5" />
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ModelSection() {
  const defaultModel = useDefaultModel();
  const { getModelById } = useChatModels();
  const model = getModelById(defaultModel);

  if (!model) return null;

  return (
    <SectionHeader icon={CpuIcon} title="Model">
      <div className="space-y-2.5">
        <div>
          <div className="text-sm font-medium truncate">{model.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {model.owned_by}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <div className="text-muted-foreground">Context</div>
          <div className="text-right font-mono">
            {formatNumber(model.context_window)}
          </div>
          <div className="text-muted-foreground">Max output</div>
          <div className="text-right font-mono">
            {formatNumber(model.max_tokens)}
          </div>
          {model.pricing?.input && (
            <>
              <div className="text-muted-foreground">Input</div>
              <div className="text-right font-mono">
                ${model.pricing.input}/M
              </div>
            </>
          )}
          {model.pricing?.output && (
            <>
              <div className="text-muted-foreground">Output</div>
              <div className="text-right font-mono">
                ${model.pricing.output}/M
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          <CapabilityBadge label="Reasoning" enabled={model.reasoning} />
          <CapabilityBadge label="Tools" enabled={model.toolCall} />
          <CapabilityBadge label="Vision" enabled={model.input.image} />
          <CapabilityBadge label="PDF" enabled={model.input.pdf} />
          <CapabilityBadge label="Audio" enabled={model.input.audio} />
          <CapabilityBadge label="Video" enabled={model.input.video} />
        </div>
      </div>
    </SectionHeader>
  );
}

function ToolsSection() {
  const tools = useMemo(() => {
    return Object.values(toolsDefinitions).map((tool) => ({
      name: tool.name,
      description: tool.description,
      cost: tool.cost,
    }));
  }, []);

  return (
    <SectionHeader icon={WrenchIcon} title={`Tools (${tools.length})`}>
      <div className="space-y-1">
        {tools.map((tool) => (
          <div
            key={tool.name}
            className="flex items-center justify-between gap-2 py-0.5"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-mono truncate">{tool.name}</div>
            </div>
            {tool.cost > 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                ~{tool.cost}¢
              </span>
            )}
          </div>
        ))}
      </div>
    </SectionHeader>
  );
}

function CapabilitiesSection() {
  const defaultModel = useDefaultModel();
  const { getModelById } = useChatModels();
  const model = getModelById(defaultModel);

  if (!model) return null;

  const outputCaps = [];
  if (model.output.text) outputCaps.push("Text");
  if (model.output.image) outputCaps.push("Image");
  if (model.output.audio) outputCaps.push("Audio");

  return (
    <SectionHeader icon={SparklesIcon} title="Capabilities" defaultOpen={false}>
      <div className="space-y-2">
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">
            Input formats
          </div>
          <div className="flex flex-wrap gap-1">
            {model.input.text && <CapabilityBadge label="Text" enabled />}
            {model.input.image && <CapabilityBadge label="Image" enabled />}
            {model.input.pdf && <CapabilityBadge label="PDF" enabled />}
            {model.input.audio && <CapabilityBadge label="Audio" enabled />}
            {model.input.video && <CapabilityBadge label="Video" enabled />}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-muted-foreground mb-1">
            Output formats
          </div>
          <div className="flex flex-wrap gap-1">
            {outputCaps.map((cap) => (
              <CapabilityBadge key={cap} label={cap} enabled />
            ))}
          </div>
        </div>

        {model.tags && model.tags.length > 0 && (
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Tags</div>
            <div className="flex flex-wrap gap-1">
              {model.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionHeader>
  );
}

function ContextSection() {
  const defaultModel = useDefaultModel();
  const { getModelById } = useChatModels();
  const model = getModelById(defaultModel);

  if (!model) return null;

  const contextWindow = model.context_window;
  const circumference = 2 * Math.PI * 18;

  return (
    <SectionHeader icon={GaugeIcon} title="Context Window">
      <div className="flex items-center gap-3">
        <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0">
          <circle
            cx="24"
            cy="24"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted-foreground/20"
          />
          <circle
            cx="24"
            cy="24"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * 0.95}
            strokeLinecap="round"
            className="text-primary"
            style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
          />
        </svg>
        <div>
          <div className="text-sm font-mono font-medium">
            {formatNumber(contextWindow)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            tokens available
          </div>
        </div>
      </div>
    </SectionHeader>
  );
}

export function ContextSidebarTrigger({ className }: { className?: string }) {
  const { open, toggle } = useContextSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", className)}
          onClick={toggle}
        >
          {open ? (
            <PanelRightClose className="size-4" />
          ) : (
            <PanelRightOpen className="size-4" />
          )}
          <span className="sr-only">Toggle context sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {open ? "Close context" : "Open context"}
      </TooltipContent>
    </Tooltip>
  );
}

export function ContextSidebar() {
  const { open } = useContextSidebar();

  return (
    <div
      data-state={open ? "open" : "closed"}
      className={cn(
        "hidden md:flex flex-col h-dvh border-l bg-sidebar text-sidebar-foreground overflow-hidden transition-[width] duration-200 ease-linear",
        open ? "w-[280px]" : "w-0"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0">
        <BrainIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Agent Context</span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <ModelSection />
        <Separator className="mx-3" />
        <ContextSection />
        <Separator className="mx-3" />
        <ToolsSection />
        <Separator className="mx-3" />
        <CapabilitiesSection />
      </div>
    </div>
  );
}
