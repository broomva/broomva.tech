import { getContentList, getContentBySlug } from "../lib/content";
import { db } from "../lib/db/client";
import { userPrompt } from "../lib/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_USER_ID = process.env.PROMPT_ADMIN_USER_ID;

async function main() {
  if (!ADMIN_USER_ID) {
    console.error("Set PROMPT_ADMIN_USER_ID env var");
    process.exit(1);
  }

  const mdxPrompts = await getContentList("prompts");
  console.log(`Found ${mdxPrompts.length} MDX prompts`);

  let created = 0;
  let skipped = 0;

  for (const summary of mdxPrompts) {
    // Check if slug already in DB
    const [existing] = await db
      .select({ id: userPrompt.id })
      .from(userPrompt)
      .where(eq(userPrompt.slug, summary.slug));

    if (existing) {
      console.log(`[skip] ${summary.slug} (already in DB)`);
      skipped++;
      continue;
    }

    const full = await getContentBySlug("prompts", summary.slug);
    if (!full) continue;

    await db.insert(userPrompt).values({
      userId: ADMIN_USER_ID,
      slug: summary.slug,
      title: summary.title,
      content: full.content,
      summary: summary.summary || null,
      category: summary.category || null,
      model: summary.model || null,
      version: summary.version || null,
      tags: summary.tags,
      variables: summary.variables || null,
      links: summary.links?.length ? summary.links : null,
      visibility: "public",
    });
    console.log(`[seed] ${summary.slug}`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped`);
  process.exit(0);
}

main().catch(console.error);
