interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * Per-session page. v1 is a placeholder — the actual Session lens (Prosopon
 * compositor + WS streaming via lifegw) lands in Plan B / PR 4.
 */
export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = await params;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 py-20">
      <h1
        className="text-[22px] tracking-tight"
        style={{ fontFamily: "CalSans, ui-sans-serif, system-ui" }}
      >
        Session
      </h1>
      <p className="font-mono text-[12px] opacity-60">{sessionId}</p>
      <p className="max-w-[40ch] text-center text-[13px] opacity-60">
        Session lens lands in Plan B. This is the placeholder.
      </p>
    </div>
  );
}
