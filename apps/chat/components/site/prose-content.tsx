interface ProseContentProps {
  html: string;
}

export function ProseContent({ html }: ProseContentProps) {
  return (
    <article
      className="prose prose-invert max-w-none prose-headings:font-display prose-headings:text-text-primary prose-a:text-ai-blue hover:prose-a:text-ai-blue/80 prose-strong:text-text-primary prose-table:w-full prose-table:border-collapse prose-table:text-sm prose-th:border prose-th:border-[var(--ag-border-default)] prose-th:bg-[var(--ag-bg-elevated)] prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:font-semibold prose-th:text-text-primary prose-td:border prose-td:border-[var(--ag-border-subtle)] prose-td:px-4 prose-td:py-2 prose-td:text-text-secondary prose-tr:transition-colors hover:prose-tr:bg-[var(--ag-bg-hover)] prose-code:rounded prose-code:bg-[var(--ag-bg-elevated)] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-xl prose-pre:border prose-pre:border-[var(--ag-border-subtle)] prose-pre:bg-[var(--ag-bg-dark)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
