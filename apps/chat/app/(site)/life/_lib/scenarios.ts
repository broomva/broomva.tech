// Replay scenarios — typed port of the prototype's data.js LifeScenarios.
// Each scenario is an ordered list of ReplayEvents stamped with `t` (ms from
// scenario start). The replay clock dispatches them via applyEvent in
// use-replay.ts.

import type { ReplayEvent, ScenarioId } from "./types";

const refactorScript: ReplayEvent[] = [
  {
    t: 0,
    kind: "user",
    text:
      "Refactor `crates/arcan/src/stream.rs` to batch SSE chunks. The inner loop is allocating on every token — profile Vigil and fix it.",
  },
  { t: 800, kind: "agent-thinking-start", id: "m1" },
  {
    t: 900,
    kind: "thinking",
    id: "m1",
    text:
      "User wants a perf fix on Arcan's stream handler. I should:\n1. Pull vigil traces for the last 10 chat turns to confirm the allocation hotspot\n2. Read stream.rs\n3. Read the callers before editing\n4. Benchmark after\nStart with a tight span query.",
  },
  { t: 2400, kind: "agent-thinking-end", id: "m1" },
  {
    t: 2500,
    kind: "agent-text-start",
    id: "m1",
    text:
      "Starting with a Vigil span query to confirm the hotspot before touching the file.",
  },
  {
    t: 3800,
    kind: "tool-call",
    id: "t1",
    name: "vigil.query_spans",
    target: "arcan::stream::forward",
    args: '{ "name": "arcan::stream::forward", "window": "10m", "limit": 20 }',
    journalKind: "tool",
  },
  {
    t: 4600,
    kind: "tool-result",
    id: "t1",
    result:
      "20 spans · p50 42ms · p95 118ms · genai.usage.completion_tokens=mean(384)\nallocator.alloc_count: mean(4,112)  ← 10.7 allocs per token\ntop frame: String::push_str (chain_completion.rs:148)",
  },
  {
    t: 5200,
    kind: "agent-text-append",
    id: "m1",
    text: " Confirmed — ~10 allocations per streamed token. Reading the file.",
  },
  {
    t: 6000,
    kind: "tool-call",
    id: "t2",
    name: "praxis.read_file",
    target: "crates/arcan/src/stream.rs",
    args: '{ "path": "crates/arcan/src/stream.rs" }',
    journalKind: "tool",
  },
  { t: 6200, kind: "fs-op", path: "crates/arcan/src/stream.rs", op: "read" },
  {
    t: 6900,
    kind: "tool-result",
    id: "t2",
    result:
      "pub async fn forward(\n    mut rx: Receiver<Chunk>,\n    tx: mpsc::Sender<SseEvent>,\n) -> Result<()> {\n    while let Some(chunk) = rx.recv().await {\n        let mut s = String::new();\n        s.push_str(&chunk.delta);\n        tx.send(SseEvent::data(s)).await?;\n    }\n    Ok(())\n}",
  },
  {
    t: 7400,
    kind: "tool-call",
    id: "t3",
    name: "praxis.read_file",
    target: "crates/arcan/src/chain_completion.rs",
    args: '{ "path": "crates/arcan/src/chain_completion.rs", "range": [140, 180] }',
    journalKind: "tool",
  },
  {
    t: 7500,
    kind: "fs-op",
    path: "crates/arcan/src/chain_completion.rs",
    op: "read",
  },
  {
    t: 8100,
    kind: "tool-result",
    id: "t3",
    result:
      "148: let mut accumulated = String::new();\n149: for delta in deltas {\n150:     accumulated.push_str(&delta);   // allocates on every token\n151:     emit(accumulated.clone()).await?;",
  },
  { t: 8600, kind: "agent-thinking-start", id: "m2" },
  {
    t: 8700,
    kind: "thinking",
    id: "m2",
    text:
      "Two problems:\n- chain_completion.rs:150 clones the growing buffer every token\n- stream.rs creates a fresh String then moves it through the SSE frame\n\nFix: use a pooled BytesMut (arcan-core already imports it), batch with a 4ms flush timer, and emit borrowed slices. Keep the public signature.",
  },
  { t: 10100, kind: "agent-thinking-end", id: "m2" },
  {
    t: 10200,
    kind: "agent-text-start",
    id: "m2",
    text:
      "Found it — two hot spots. Moving to BytesMut + a 4ms flush window, keeping the public API stable.",
  },
  {
    t: 11200,
    kind: "tool-call",
    id: "t4",
    name: "praxis.edit_file",
    target: "crates/arcan/src/stream.rs",
    args: '{ "path": "crates/arcan/src/stream.rs", "hashline": "…" }',
    journalKind: "tool",
  },
  { t: 11400, kind: "fs-op", path: "crates/arcan/src/stream.rs", op: "write" },
  {
    t: 12400,
    kind: "tool-result",
    id: "t4",
    result:
      "✓ wrote 46 lines (−18, +28)\ndiff: stream.rs\n- let mut s = String::new();\n- s.push_str(&chunk.delta);\n+ buf.extend_from_slice(chunk.delta.as_bytes());\n+ if buf.len() > 512 || flush_at.elapsed() > Duration::from_millis(4) {\n+     tx.send(SseEvent::data_bytes(buf.split())).await?;\n+ }",
  },
  {
    t: 12800,
    kind: "fs-op",
    path: "crates/arcan/src/chain_completion.rs",
    op: "write",
  },
  {
    t: 13100,
    kind: "tool-call",
    id: "t5",
    name: "praxis.edit_file",
    target: "crates/arcan/src/chain_completion.rs",
    args: '{ "path": "…", "hashline": "…" }',
    journalKind: "tool",
  },
  { t: 13900, kind: "tool-result", id: "t5", result: "✓ wrote 8 lines (−3, +8)" },
  {
    t: 14400,
    kind: "fs-op",
    path: "crates/arcan/tests/stream_bench.rs",
    op: "create",
  },
  {
    t: 14600,
    kind: "tool-call",
    id: "t6",
    name: "praxis.shell",
    target: "cargo test -p arcan stream",
    args: '{ "cmd": "cargo test -p arcan stream --release" }',
    journalKind: "tool",
  },
  {
    t: 16200,
    kind: "tool-result",
    id: "t6",
    result:
      "running 14 tests\n test stream::tests::forward_batches_deltas ... ok\n test stream::tests::forward_flushes_on_timer ... ok\n test stream::tests::forward_preserves_order  ... ok\n\ntest result: ok. 14 passed; 0 failed\n\nfinished in 0.82s",
  },
  {
    t: 16800,
    kind: "nous-score",
    score: 0.92,
    band: "good",
    note:
      "diff compiles, tests green, scoped to the reported hotspot, no new public surface.",
  },
  {
    t: 17100,
    kind: "agent-text-start",
    id: "m3",
    text:
      "Done. Re-ran the bench:\n\n```\nbefore:  42ms p50 / 118ms p95  /  4,112 allocs\nafter:   11ms p50 /  28ms p95  /    312 allocs\n```\n\nNous scored the change 0.92 — scoped, tested, public API unchanged. I flushed the buffer on either 512B or 4ms, whichever comes first. Want me to open the PR?",
  },
];

const ingestScript: ReplayEvent[] = [
  {
    t: 0,
    kind: "user",
    text:
      "Ingest the paper at /workspace/drafts/constitutional-ai.pdf into Lago. Link it to existing nodes for RLHF, reward hacking, and agent safety.",
  },
  { t: 800, kind: "agent-thinking-start", id: "m1" },
  {
    t: 900,
    kind: "thinking",
    id: "m1",
    text:
      "Lago ingest flow:\n1. blob store put → cid\n2. extract → chunks\n3. embed each chunk\n4. emit lago.node.upsert events\n5. resolve links to the three target concept nodes\n\nUse praxis.lago.ingest — it handles the pipeline.",
  },
  { t: 2200, kind: "agent-thinking-end", id: "m1" },
  {
    t: 2300,
    kind: "agent-text-start",
    id: "m1",
    text: "Opening the paper and running the ingest pipeline.",
  },
  {
    t: 3100,
    kind: "fs-op",
    path: "/workspace/drafts/constitutional-ai.pdf",
    op: "read",
  },
  {
    t: 3400,
    kind: "tool-call",
    id: "t1",
    name: "lago.blob.put",
    target: "constitutional-ai.pdf",
    args: '{ "mime": "application/pdf", "size": 842112 }',
    journalKind: "tool",
  },
  {
    t: 4100,
    kind: "tool-result",
    id: "t1",
    result: "cid: bafybeig... (822KB, 43 pages)",
  },
  {
    t: 4600,
    kind: "tool-call",
    id: "t2",
    name: "lago.extract",
    target: "cid:bafybeig…",
    args: "{}",
    journalKind: "tool",
  },
  {
    t: 6200,
    kind: "tool-result",
    id: "t2",
    result: "87 chunks extracted · 12.4k tokens · 16 figures",
  },
  {
    t: 6800,
    kind: "tool-call",
    id: "t3",
    name: "lago.embed",
    target: "87 chunks",
    args: '{ "model": "text-embedding-3-large" }',
    journalKind: "tool",
  },
  {
    t: 9400,
    kind: "tool-result",
    id: "t3",
    result: "87 vectors · dim=3072 · total cost $0.0112",
  },
  {
    t: 9800,
    kind: "fs-op",
    path: "/workspace/lago/nodes/paper-constitutional-ai.json",
    op: "create",
  },
  {
    t: 10100,
    kind: "fs-op",
    path: "/workspace/lago/edges/rlhf→constitutional-ai.json",
    op: "create",
  },
  {
    t: 10400,
    kind: "fs-op",
    path: "/workspace/lago/edges/reward-hacking→constitutional-ai.json",
    op: "create",
  },
  {
    t: 10700,
    kind: "fs-op",
    path: "/workspace/lago/edges/agent-safety→constitutional-ai.json",
    op: "create",
  },
  {
    t: 11100,
    kind: "nous-score",
    score: 0.86,
    band: "good",
    note:
      "3/3 target nodes resolved; 4 secondary links inferred (harmlessness, red-teaming, supervised FT, RLAIF).",
  },
  {
    t: 11400,
    kind: "agent-text-start",
    id: "m2",
    text:
      "Ingested. One new node + 7 edges (3 you asked for + 4 inferred). Graph view should have updated.",
  },
];

const researchScript: ReplayEvent[] = [
  {
    t: 0,
    kind: "user",
    text:
      "Research: what's the strongest open-source alternative to Claude for agentic tool use, as of this week? Spec: budget $0.80, 15min, deliver a ranked shortlist.",
  },
  {
    t: 600,
    kind: "autonomic-event",
    pillar: "economic",
    text: "Budget accepted: $0.80 / 15min. Mode → Explore.",
  },
  { t: 1200, kind: "agent-thinking-start", id: "m1" },
  {
    t: 1300,
    kind: "thinking",
    id: "m1",
    text:
      "Plan:\n1. Pull leaderboards (BFCL, τ-bench, SWE-bench verified)\n2. Filter for Apache/MIT license\n3. Score on tool-use + long-context + cost\n4. Autonomic will throttle if I run hot",
  },
  { t: 2800, kind: "agent-thinking-end", id: "m1" },
  {
    t: 3200,
    kind: "tool-call",
    id: "t1",
    name: "spaces.peer.dispatch",
    target: "leaderboard-scout",
    args: '{ "peer": "leaderboard-scout", "task": "pull top-10 open OSS agents" }',
    journalKind: "tool",
  },
  { t: 4200, kind: "tool-result", id: "t1", result: "dispatched · eta 45s" },
  {
    t: 5800,
    kind: "autonomic-event",
    pillar: "cognitive",
    text: "Context pressure 68% — compacting oldest 4 turns.",
  },
  {
    t: 7200,
    kind: "tool-call",
    id: "t2",
    name: "haima.pay",
    target: "0x9f4…b21",
    args: '{ "amount": "0.02 USDC", "reason": "leaderboard-scout query" }',
    journalKind: "tool",
  },
  {
    t: 7800,
    kind: "tool-result",
    id: "t2",
    result: "paid via x402 · tx: 0xaa1…",
  },
  {
    t: 9100,
    kind: "nous-score",
    score: 0.72,
    band: "warn",
    note: "coverage good; two candidates missing license check.",
  },
  {
    t: 9600,
    kind: "agent-text-start",
    id: "m2",
    text:
      "Shortlist forming — waiting on a second-pass license audit before I commit a ranking.",
  },
];

// ---------------------------------------------------------------------------
// Materiales — live unit-price research for a CO constructora director.
// Real prices captured from Homecenter / Easy / Sodimac.co on 2026-04-23
// (Homecenter varilla G60 1/2" × 6m = $26,550; Cemex 50kg = $32,900; Corona
// porcelanato West/Aura 60×60 dynamic per location). Tenant: _pending-constructora.
// ---------------------------------------------------------------------------
const materialesScript: ReplayEvent[] = [
  {
    t: 0,
    kind: "user",
    text:
      "Necesito precio unitario de varilla corrugada #4 (1/2 pulg) x 6m, 3 toneladas para losa. Obra en Bogotá. Proveedores preferidos: Homecenter, Sodimac, Easy.",
  },
  {
    t: 600,
    kind: "autonomic-event",
    pillar: "economic",
    text: "Modo rápido admitido · presupuesto 1 crédito · COP 2.000.",
  },
  { t: 1100, kind: "agent-thinking-start", id: "m1" },
  {
    t: 1200,
    kind: "thinking",
    id: "m1",
    text:
      "Plan:\n1. Verificar caché Lago — tenant _pending-constructora, material=hierro-1/2-#4\n2. Si no hay hit fresco (<24h), lanzar web_search paralelo sobre supplier whitelist: Homecenter, Sodimac, Easy\n3. Normalizar cada resultado a PriceObservation (precio, unidad, fuente, confianza)\n4. Quality gate Nous: ≥2 fuentes corroborando + banda de cordura tenant\n5. Persistir al índice bi-temporal + responder estructurado",
  },
  { t: 3200, kind: "agent-thinking-end", id: "m1" },
  {
    t: 3400,
    kind: "agent-text-start",
    id: "m1",
    text:
      "Entendido. Revisando caché primero, luego búsqueda en vivo sobre tus proveedores preferidos.",
  },
  {
    t: 4200,
    kind: "tool-call",
    id: "t1",
    name: "cache.lago",
    target: "hierro-corrugada-1/2-6m · tenant=_pending-constructora",
    args:
      '{ "material_key": "hierro-corrugada-1/2-6m", "ttl_hours": 24, "tenant": "_pending-constructora" }',
    journalKind: "tool",
  },
  {
    t: 5000,
    kind: "tool-result",
    id: "t1",
    result:
      "MISS · tenant cache tiene 0 observaciones para este material (tenant nuevo). Ejecutando búsqueda en vivo.",
  },
  {
    t: 5200,
    kind: "agent-text-append",
    id: "m1",
    text: " Caché vacío — tenant nuevo. Lanzando 3 búsquedas en paralelo.",
  },
  {
    t: 5800,
    kind: "tool-call",
    id: "t2",
    name: "web-search.anthropic",
    target: "homecenter.com.co · varilla corrugada 1/2 #4 6m",
    args:
      '{ "query": "varilla corrugada G60 1/2 pulg 6m precio", "domains": ["homecenter.com.co"] }',
    journalKind: "tool",
  },
  {
    t: 5900,
    kind: "tool-call",
    id: "t3",
    name: "web-search.anthropic",
    target: "sodimac.com.co · varilla hierro 1/2 6m",
    args:
      '{ "query": "varilla hierro 1/2 pulgada 6 metros precio Bogota", "domains": ["sodimac.com.co"] }',
    journalKind: "tool",
  },
  {
    t: 6000,
    kind: "tool-call",
    id: "t4",
    name: "web-search.anthropic",
    target: "easy.com.co · hierros varilla 1/2",
    args:
      '{ "query": "varilla corrugada 1/2 pulg 6m precio", "domains": ["easy.com.co"] }',
    journalKind: "tool",
  },
  {
    t: 7800,
    kind: "autonomic-event",
    pillar: "cognitive",
    text: "3 búsquedas en vuelo · monitor de costo activo · escudo deep USD $2.50 vigente.",
  },
  {
    t: 8900,
    kind: "tool-result",
    id: "t2",
    result:
      'Homecenter — Varilla Corrugada G60 W #4 (1/2 Pulg) X 6M · $26.550 COP/UND · precio original $30.780 · fabricantes: Sidoc, Paz del Rio, Gerdau Diaco, Ternium · URL producto/73637 · NTC 2289 / Decreto 1513',
  },
  {
    t: 9400,
    kind: "tool-result",
    id: "t3",
    result:
      "Sodimac — Varilla 1/2 pulg x 6m G60 · precio dinámico por ubicación · resultado estimado COP $27.200 ± $500 (rango histórico Sodimac Bogotá) · requiere carrito para precio exacto",
  },
  {
    t: 9800,
    kind: "tool-result",
    id: "t4",
    result:
      "Easy Colombia — Varilla 1/2 pulg 6m · catálogo activo (/ferreteria/fijaciones/varillas) · precio carrito Bogotá COP $26.900 · stock disponible",
  },
  {
    t: 10400,
    kind: "tool-call",
    id: "t5",
    name: "nous.score",
    target: "PriceObservation[] · 3 fuentes",
    args:
      '{ "criterion": "supplier_corroboration", "sanity_band": {"family": "hierro", "multiplier": 1.5} }',
    journalKind: "nous",
  },
  {
    t: 11600,
    kind: "nous-score",
    score: 0.91,
    band: "good",
    note:
      "3 fuentes independientes · todas dentro de banda (mediana $26.900, spread ±2.4%) · citaciones directas con URL de producto · confianza ALTA.",
  },
  {
    t: 12200,
    kind: "tool-call",
    id: "t6",
    name: "haima.debit_stage",
    target: "stage=S4-S5 · run=mat-q1 · fast mode",
    args: '{ "stage": "retrieve+evaluate", "cost_usd": 0.0032, "credits": 1 }',
    journalKind: "haima",
  },
  {
    t: 12700,
    kind: "tool-result",
    id: "t6",
    result:
      "Debitado · 1 crédito · COP 2.000 · balance 4.998 créditos restantes este ciclo · factura DIAN cierre mensual.",
  },
  {
    t: 13100,
    kind: "fs-op",
    path: "/lago/tenants/_pending-constructora/price-index/hierro-1-2-6m/2026-04-23.json",
    op: "create",
  },
  {
    t: 13400,
    kind: "autonomic-event",
    pillar: "operational",
    text: "3 PriceObservations persistidos al índice bi-temporal del tenant · valid_time=hoy.",
  },
  {
    t: 13900,
    kind: "agent-text-append",
    id: "m1",
    text:
      "\n\n**Varilla corrugada G60 #4 (1/2\") × 6m — Bogotá, 2026-04-23**\n\n| Proveedor | Precio/und | Para 210 und (~3 ton) | Notas |\n|---|---|---|---|\n| **Homecenter** | **$26.550** | $5.575.500 | mejor precio · descuento internet (~14%) · stock · NTC 2289 |\n| Easy | $26.900 | $5.649.000 | stock Bogotá confirmado |\n| Sodimac | ~$27.200 | $5.712.000 | precio requiere carrito · rango histórico |\n\n**Recomendación:** Homecenter. Ahorro vs. Sodimac ≈ **$136.500** en 210 unidades. Para 3 ton exactas, cotizar con el proveedor por volumen (descuento paq×50).\n\nBotón activo → [Cotizar con Homecenter](https://www.homecenter.com.co/homecenter-co/product/73637/).",
  },
  {
    t: 15800,
    kind: "nous-score",
    score: 0.91,
    band: "good",
    note: "Respuesta entregada · 3/3 proveedores · citas directas · tenant histórico inicializado.",
  },
];

export const SCENARIOS: Record<ScenarioId, ReplayEvent[]> = {
  refactor: refactorScript,
  ingest: ingestScript,
  research: researchScript,
  materiales: materialesScript,
};

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  refactor: "Refactor · arcan/stream",
  ingest: "Ingest · constitutional-ai.pdf",
  research: "Research · OSS agent shortlist",
  materiales: "Materiales · precio unitario Bogotá",
};
