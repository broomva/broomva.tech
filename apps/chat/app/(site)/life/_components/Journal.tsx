"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { LifeJournalEntry } from "../_lib/types";

interface Props {
  events: LifeJournalEntry[];
  rich: boolean;
  highlight: string | null;
  setHighlight: (id: string | null) => void;
}

export function Journal({ events, rich, highlight, setHighlight }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events.length]);
  return (
    <div
      className={`journal ${rich ? "journal--rich" : ""}`}
      ref={scrollRef}
    >
      {events.length === 0 && (
        <div
          style={{
            padding: 24,
            color: "var(--ag-text-muted)",
            fontSize: 11.5,
            textAlign: "center",
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Lago · journal
          </div>
          Events from the current tick will stream here.
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
