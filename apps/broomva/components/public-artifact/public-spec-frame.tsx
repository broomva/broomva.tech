export function PublicSpecFrame({
  title,
  html,
}: {
  title: string;
  html: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-white shadow-[var(--ag-shadow-lg)]">
      <iframe
        title={title}
        srcDoc={html}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="h-[calc(100dvh-14rem)] min-h-[36rem] w-full border-0 bg-white"
      />
    </div>
  );
}
