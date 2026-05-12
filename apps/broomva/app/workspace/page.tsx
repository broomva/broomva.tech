/**
 * /workspace landing — placeholder until the welcome agent ships (PR 7).
 *
 * Once Plan C lands, this page redirects to the user's most recent session
 * or creates a fresh one with the welcome agent.
 */
export default function WorkspaceLandingPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 py-20">
      <div
        aria-hidden
        className="h-10 w-10 rounded-full"
        style={{
          background:
            "radial-gradient(circle, var(--ag-ai-blue) 0%, transparent 70%)",
        }}
      />
      <h1
        className="max-w-[26ch] text-center text-[28px] tracking-tight"
        style={{ fontFamily: "CalSans, ui-sans-serif, system-ui" }}
      >
        Welcome. Your workspace is ready.
      </h1>
      <p className="max-w-[40ch] text-center text-[13px] opacity-60">
        Press{" "}
        <kbd className="ag-glass-subtle rounded px-1.5 py-0.5 font-mono text-[11px]">
          ⌘K
        </kbd>{" "}
        to start a session. Lenses light up as you and your agents work.
      </p>
    </div>
  );
}
