"use client";

import { Backlinks } from "./Backlinks";
import { Outline } from "./Outline";

interface Props {
  path: string;
}

function RailHeading({ children, hint }: { children: string; hint?: string }) {
  return (
    <h6 className="mt-5 mb-2 flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">
      <span>{children}</span>
      {hint && <span className="opacity-70">{hint}</span>}
    </h6>
  );
}

/**
 * RightRailFiles — two stacked panels surfaced when the Files lens is
 * active (i.e. when the URL carries `?file=<path>`). Mirrors
 * RightRailSession's composition shape.
 */
export function RightRailFiles({ path }: Props) {
  return (
    <div className="px-3 pb-3">
      <RailHeading>Outline</RailHeading>
      <Outline path={path} />

      <RailHeading>Backlinks</RailHeading>
      <Backlinks path={path} />
    </div>
  );
}
