import { redirect } from "next/navigation";

/**
 * /d — retired. The plain document list is superseded by the Maestro console
 * (BRO-1349 / BRO-1352); `/d` now routes to `/maestro`, so both URLs reach the
 * same page. The `/d/<handle>` viewer and `/d/<handle>/v/<n>` version-pin are
 * unchanged — specs still live there. Auth is enforced by `/maestro`'s own gate,
 * so this redirects unconditionally (307 — reversible while this area evolves).
 */
export default function DocsListRedirect() {
  redirect("/maestro");
}
