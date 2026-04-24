"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { LifeJournalEntry } from "../_lib/types";

interface Props {
  events: LifeJournalEntry[];
  highlight: string | null;
  setHighlight: (id: string | null) => void;
}

export function Journal({ events, highlight, setHighlight }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events.length]);
  return (
    <div className="journal journal--rich" ref={scrollRef}>
      {events.length === 0 && (
        <div className="pane-empty pane-empty--inline">
          <div className="pane-empty__title">Journal is empty</div>
          <div className="pane-empty__body">
            Every tool call, filesystem op, and judgement from this session
            will stream here in order.
          </div>
          <div className="pane-empty__meta">source · Lago event journal</div>
        </div>
      )}
      {events.map((e) => {
        const isOpen = !!open[e.id];
        const hl = !!highlight && e.linkToolId === highlight;
        return (
          <Fragment key={e.id}>
            <div
              className={`journal__row ${isOpen ? "is-open" : ""} ${
                hl ? "is-highlighted" : ""
              }`}
              onClick={() => {
                setOpen((o) => ({ ...o, [e.id]: !o[e.id] }));
                if (e.linkToolId) setHighlight(e.linkToolId);
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  setOpen((o) => ({ ...o, [e.id]: !o[e.id] }));
                  if (e.linkToolId) setHighlight(e.linkToolId);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span className="journal__ts">{e.ts}</span>
              <span className={`journal__kind journal__kind--${e.kind}`}>
                {e.label}
              </span>
              <span className="journal__msg">
                <span className="journal__actor">{e.actor}</span> · {e.msg}
              </span>
              <span style={{ color: "var(--ag-text-muted)", fontSize: 10 }}>
                ▾
              </span>
            </div>
            {isOpen && <div className="journal__payload">{e.payload}</div>}
          </Fragment>
        );
      })}
    </div>
  );
}
