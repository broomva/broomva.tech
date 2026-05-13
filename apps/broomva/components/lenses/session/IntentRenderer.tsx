import type { SceneNode } from "@broomva/prosopon";
import type { ComponentType } from "react";
import { ApprovalRequiredIntent } from "./intents/ApprovalRequiredIntent";
import { AudioIntent } from "./intents/AudioIntent";
import { ChoiceIntent } from "./intents/ChoiceIntent";
import { CitationIntent } from "./intents/CitationIntent";
import { CodeIntent } from "./intents/CodeIntent";
import { ConfirmIntent } from "./intents/ConfirmIntent";
import { CustomIntent } from "./intents/CustomIntent";
import { DividerIntent } from "./intents/DividerIntent";
import { EntityRefIntent } from "./intents/EntityRefIntent";
import { FieldIntent } from "./intents/FieldIntent";
import { FormationIntent } from "./intents/FormationIntent";
import { GroupIntent } from "./intents/GroupIntent";
import { ImageIntent } from "./intents/ImageIntent";
import { InputIntent } from "./intents/InputIntent";
import { LinkIntent } from "./intents/LinkIntent";
import { LocusIntent } from "./intents/LocusIntent";
import { MathIntent } from "./intents/MathIntent";
import { ProgressIntent } from "./intents/ProgressIntent";
import { ProseIntent } from "./intents/ProseIntent";
import { SectionIntent } from "./intents/SectionIntent";
import { SignalIntent } from "./intents/SignalIntent";
import { StreamIntent } from "./intents/StreamIntent";
import { ToolCallIntent } from "./intents/ToolCallIntent";
import { ToolResultIntent } from "./intents/ToolResultIntent";
import { UnknownIntent } from "./intents/UnknownIntent";
import { VideoIntent } from "./intents/VideoIntent";

interface Props {
  node: SceneNode;
  sid: string;
}

/**
 * Dispatch by intent discriminator. B-4a registers 6 entries; the
 * UnknownIntent fallback covers everything else. B-4b will add the
 * remaining base intents + typed tool cards under ToolCallIntent's
 * sub-dispatcher.
 *
 * Reads `intent.type` (canonical Prosopon discriminator from
 * `Intent::Prose`, `Intent::ToolCall`, ...) with a fallback to
 * `intent.kind` (plan-shaped extension intents like approval_required
 * which the canonical Intent enum does not yet cover).
 *
 * All registered components MUST accept Props = { node; sid?: string }
 * (the "Prop convention" called out at the top of Phase 3). The
 * dispatcher always passes `sid`; components that don't use it ignore
 * it.
 *
 * ApprovalRequiredIntent declares `sid` as required because it POSTs
 * to the approve/cancel endpoints. The cast below isolates that
 * narrowing — the dispatcher always passes a string `sid` in practice.
 */
const INTENT_MAP: Record<string, ComponentType<Props>> = {
  prose: ProseIntent,
  stream: StreamIntent,
  tool_call: ToolCallIntent,
  tool_result: ToolResultIntent,
  approval_required: ApprovalRequiredIntent as ComponentType<Props>,
  progress: ProgressIntent,
  image: ImageIntent,
  audio: AudioIntent,
  video: VideoIntent,
  code: CodeIntent,
  math: MathIntent,
  entity_ref: EntityRefIntent,
  link: LinkIntent,
  citation: CitationIntent,
  signal: SignalIntent,
  choice: ChoiceIntent,
  confirm: ConfirmIntent,
  input: InputIntent,
  field: FieldIntent,
  section: SectionIntent,
  group: GroupIntent,
  divider: DividerIntent,
  locus: LocusIntent,
  formation: FormationIntent,
  custom: CustomIntent,
};

export function IntentRenderer({ node, sid }: Props) {
  const intent = node.intent as { type?: string; kind?: string } | undefined;
  const discriminator = intent?.type ?? intent?.kind;
  const Component: ComponentType<Props> = discriminator
    ? (INTENT_MAP[discriminator] ?? UnknownIntent)
    : UnknownIntent;
  return <Component node={node} sid={sid} />;
}
