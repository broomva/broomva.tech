import { defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    postprocess: {
      // Runs remarkLLMs at build time — exposes page.data._markdown for
      // the per-page .md endpoint and llms-full.txt.
      includeProcessedMarkdown: true,
    },
  },
});
