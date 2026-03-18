interface ProseContentProps {
  html: string;
}

export function ProseContent({ html }: ProseContentProps) {
  return (
    <article
      className="prose prose-invert max-w-none prose-headings:font-display prose-headings:text-text-primary prose-a:text-ai-blue hover:prose-a:text-web3-green prose-strong:text-text-primary"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
