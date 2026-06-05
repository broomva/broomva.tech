"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EVENT_META,
  mergeTimeline,
  type QueueTone,
  relativeTime,
  type TimelineEvent,
} from "./lib";

/** Tone → Arcan Glass token classes for the timeline nodes. */
const TONE_DOT: Record<QueueTone, string> = {
  queued: "bg-[color:var(--ag-accent-blue)]",
  active: "bg-[color:var(--ag-ai-blue)]",
  done: "bg-[color:var(--ag-success)]",
  muted: "bg-muted-foreground/50",
  history: "bg-[color:var(--ag-error)]/70",
};
const TONE_TEXT: Record<QueueTone, string> = {
  queued: "text-[color:var(--ag-accent-blue)]",
  active: "text-[color:var(--ag-ai-blue)]",
  done: "text-[color:var(--ag-success)]",
  muted: "text-muted-foreground",
  history: "text-[color:var(--ag-error)]",
};

type ConnState = "connecting" | "live" | "reconnecting";

/**
 * The realtime stream card (BRO-1415). Server-renders with the current
 * timeline, then opens an EventSource to /api/handoffs/events and tails new
 * events live. The horizontal rail reads newest-first (left→right); a pulsing
 * status pill shows the connection. New status/push events trigger a throttled
 * `router.refresh()` so the queue board below stays in sync without a reload.
 */
export function QueueStream({ initial }: { initial: TimelineEvent[] }) {
  const router = useRouter();
  const [events, setEvents] = useState<TimelineEvent[]>(initial);
  const [conn, setConn] = useState<ConnState>("connecting");

  // Newest createdAt we've seen — the SSE reconnect cursor.
  const cursorRef = useRef<string>(
    initial[0]?.createdAt
      ? new Date(initial[0].createdAt).toISOString()
      : new Date().toISOString(),
  );
  const lastRefresh = useRef<number>(0);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefresh.current > 1500) {
      lastRefresh.current = now;
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const es = new EventSource(
        `/api/handoffs/events?since=${encodeURIComponent(cursorRef.current)}`,
      );
      esRef.current = es;

      es.addEventListener("ready", () => {
        if (!disposed) setConn("live");
      });

      es.addEventListener("handoff", (e) => {
        if (disposed) return;
        try {
          const ev = JSON.parse((e as MessageEvent).data) as TimelineEvent;
          cursorRef.current = new Date(ev.createdAt).toISOString();
          setEvents((cur) => mergeTimeline(cur, [ev]));
          scheduleRefresh();
        } catch {
          // ignore malformed frame
        }
      });

      es.addEventListener("bye", () => {
        es.close();
        if (disposed) return;
        setConn("reconnecting");
        retryRef.current = setTimeout(connect, 300);
      });

      es.onerror = () => {
        es.close();
        if (disposed) return;
        setConn("reconnecting");
        retryRef.current = setTimeout(connect, 2500);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      esRef.current?.close();
    };
  }, [scheduleRefresh]);

  return (
    <section className="rounded-xl border border-border/60 bg-bg-surface/40 px-4 py-3.5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-medium text-sm">Activity</h2>
          <span className="text-muted-foreground/70 text-xs">
            {events.length > 0
              ? `${events.length} event${events.length === 1 ? "" : "s"}`
              : "no activity yet"}
          </span>
        </div>
        <LiveBadge state={conn} />
      </div>

      {events.length === 0 ? (
        <p className="py-3 text-muted-foreground text-xs">
          Push a handoff to start the stream —{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            broomva handoff push file.md
          </code>
          .
        </p>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {/* connecting rail line behind the nodes */}
          {events.map((ev, i) => {
            const meta = EVENT_META[ev.type];
            return (
              <div
                key={ev.id}
                className="relative flex min-w-[8.5rem] max-w-[12rem] shrink-0 flex-col gap-1"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`size-2 shrink-0 rounded-full ${TONE_DOT[meta.tone]} ${
                      i === 0 ? "ring-2 ring-[color:var(--ag-ai-blue)]/30" : ""
                    }`}
                  />
                  {i < events.length - 1 ? (
                    <span className="h-px flex-1 bg-border/70" />
                  ) : null}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-xs ${TONE_TEXT[meta.tone]}`}>
                    {meta.glyph}
                  </span>
                  <span className="truncate font-medium text-foreground text-xs">
                    {ev.message ?? meta.verb}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="rounded bg-muted px-1 py-px uppercase tracking-wide">
                    {ev.actor}
                  </span>
                  <span>{relativeTime(ev.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LiveBadge({ state }: { state: ConnState }) {
  const cfg = {
    connecting: {
      label: "Connecting",
      dot: "bg-muted-foreground/60",
      pulse: false,
    },
    live: { label: "Live", dot: "bg-[color:var(--ag-success)]", pulse: true },
    reconnecting: {
      label: "Reconnecting",
      dot: "bg-[color:var(--ag-warning)]",
      pulse: true,
    },
  }[state];
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
      <span className="relative flex size-1.5">
        {cfg.pulse ? (
          <span
            className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${cfg.dot}`}
          />
        ) : null}
        <span
          className={`relative inline-flex size-1.5 rounded-full ${cfg.dot}`}
        />
      </span>
      {cfg.label}
    </span>
  );
}
