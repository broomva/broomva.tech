// Static mock data driving the middle/right columns. Phase B replaces these
// with live data from the Arcan SSE / Lago gRPC backplane.

import type {
  LifeAnima,
  LifeFsNode,
  LifeGraph,
  LifeHaima,
  LifeHomeo,
  LifeJudge,
  LifePeer,
  LifeTraceSpan,
} from "./types";

export const LIFE_FS: { tree: LifeFsNode[] } = {
  tree: [
    {
      path: "crates",
      type: "dir",
      children: [
        {
          path: "crates/arcan",
          type: "dir",
          children: [
            {
              path: "crates/arcan/src",
              type: "dir",
              children: [
                { path: "crates/arcan/src/lib.rs", type: "file" },
                { path: "crates/arcan/src/stream.rs", type: "file" },
                { path: "crates/arcan/src/chain_completion.rs", type: "file" },
                {
                  path: "crates/arcan/src/providers",
                  type: "dir",
                  children: [
                    {
                      path: "crates/arcan/src/providers/anthropic.rs",
                      type: "file",
                    },
                    {
                      path: "crates/arcan/src/providers/openai.rs",
                      type: "file",
                    },
                    {
                      path: "crates/arcan/src/providers/ollama.rs",
                      type: "file",
                    },
                  ],
                },
              ],
            },
            { path: "crates/arcan/Cargo.toml", type: "file" },
          ],
        },
        {
          path: "crates/lago",
          type: "dir",
          children: [
            {
              path: "crates/lago/src",
              type: "dir",
              children: [
                { path: "crates/lago/src/journal.rs", type: "file" },
                { path: "crates/lago/src/blob.rs", type: "file" },
                { path: "crates/lago/src/graph.rs", type: "file" },
              ],
            },
          ],
        },
        {
          path: "crates/autonomic",
          type: "dir",
          children: [
            {
              path: "crates/autonomic/src",
              type: "dir",
              children: [
                { path: "crates/autonomic/src/lib.rs", type: "file" },
                { path: "crates/autonomic/src/homeo.rs", type: "file" },
              ],
            },
          ],
        },
        {
          path: "crates/anima",
          type: "dir",
          children: [{ path: "crates/anima/src/soul.rs", type: "file" }],
        },
        {
          path: "crates/nous",
          type: "dir",
          children: [{ path: "crates/nous/src/judge.rs", type: "file" }],
        },
      ],
    },
    {
      path: "schemas",
      type: "dir",
      children: [
        { path: "schemas/state.schema.json", type: "file" },
        { path: "schemas/action.schema.json", type: "file" },
        { path: "schemas/trace.schema.json", type: "file" },
      ],
    },
    { path: "Cargo.toml", type: "file" },
    { path: "README.md", type: "file" },
  ],
};

export const LIFE_TRACES: LifeTraceSpan[] = [
  { name: "arcan.tick", kind: "root", start: 0, dur: 17100, color: "llm" },
  {
    name: "arcan.context.reconstruct",
    kind: "span",
    start: 40,
    dur: 480,
    color: "tool",
  },
  { name: "anima.belief.load", kind: "span", start: 120, dur: 180, color: "tool" },
  {
    name: "provider.anthropic.messages",
    kind: "llm",
    start: 560,
    dur: 1900,
    color: "llm",
  },
  {
    name: "praxis.vigil.query_spans",
    kind: "tool",
    start: 3800,
    dur: 800,
    color: "tool",
  },
  {
    name: "praxis.read_file#stream.rs",
    kind: "tool",
    start: 6000,
    dur: 900,
    color: "tool",
  },
  {
    name: "praxis.read_file#chain_completion.rs",
    kind: "tool",
    start: 7400,
    dur: 700,
    color: "tool",
  },
  {
    name: "provider.anthropic.messages",
    kind: "llm",
    start: 8600,
    dur: 1500,
    color: "llm",
  },
  {
    name: "praxis.edit_file#stream.rs",
    kind: "tool",
    start: 11200,
    dur: 1200,
    color: "tool",
  },
  {
    name: "lago.journal.append x4",
    kind: "tool",
    start: 11400,
    dur: 120,
    color: "tool",
  },
  {
    name: "praxis.edit_file#chain_completion.rs",
    kind: "tool",
    start: 13100,
    dur: 800,
    color: "tool",
  },
  {
    name: "praxis.shell#cargo test",
    kind: "tool",
    start: 14600,
    dur: 1600,
    color: "tool",
  },
  {
    name: "nous.judge.evaluate",
    kind: "tool",
    start: 16800,
    dur: 280,
    color: "tool",
  },
];

export const LIFE_HOMEO: LifeHomeo = {
  operational: { value: 0.94, target: 1.0, sub: "gate_pass · 14/15 green" },
  cognitive: { value: 0.68, target: 0.75, sub: "ctx pressure · 68%" },
  economic: { value: 0.73, target: 1.0, sub: "budget · $0.58 / $0.80" },
};

export const LIFE_HAIMA: LifeHaima = {
  session_spend: 0.22,
  session_budget: 0.8,
  tokens_in: 48_112,
  tokens_out: 8_422,
  x402_txs: 3,
  last_pay: "0.02 USDC → leaderboard-scout",
};

export const LIFE_JUDGES: LifeJudge[] = [
  {
    axis: "Correctness",
    score: 0.94,
    band: "good",
    note: "Tests green, hashline diff lines up with spec.",
  },
  {
    axis: "Scope",
    score: 0.88,
    band: "good",
    note: "Touched only the two files named in the plan.",
  },
  {
    axis: "Regression risk",
    score: 0.9,
    band: "good",
    note: "Public API unchanged; 14 unit tests + property test added.",
  },
  {
    axis: "Style",
    score: 0.76,
    band: "warn",
    note: "One clippy::needless_borrow not auto-fixed — low priority.",
  },
];

export const LIFE_ANIMA: LifeAnima = {
  name: "Arcan",
  soul: "soul:life.arcan.broomva",
  tier: "sovereign",
  did: "did:key:z6Mkf…4Ht",
  beliefs: [
    "Emits typed directives, not raw actuations.",
    "Shields filter; plants obey.",
    "Every action produces an immutable trace in Lago.",
    "Environment-first triage before code-level fault attribution.",
  ],
  trust: { user: 0.92, workspace: 0.88, peers: 0.71 },
  session: "sess_01J8K…r9",
};

export const LIFE_PEERS: LifePeer[] = [
  {
    name: "leaderboard-scout",
    role: "Spaces · scout",
    lat: 42,
    status: "Running · returning top-10 OSS agents",
    hue: "220deg",
  },
  {
    name: "audit-shield",
    role: "Spaces · shield",
    lat: 18,
    status: "Idle · last check 3m ago",
    hue: "300deg",
  },
  {
    name: "graph-gardener",
    role: "Spaces · lago",
    lat: 74,
    status: "Compacting · 1,204/8,120 nodes",
    hue: "160deg",
  },
  {
    name: "payor-x402",
    role: "Spaces · haima",
    lat: 9,
    status: "Listening on wallet 0x9f4…b21",
    hue: "80deg",
  },
];

export const LIFE_GRAPH: LifeGraph = {
  nodes: [
    {
      id: "agent-safety",
      label: "agent safety",
      x: 0.5,
      y: 0.3,
      kind: "concept",
      r: 22,
    },
    { id: "rlhf", label: "RLHF", x: 0.22, y: 0.55, kind: "concept", r: 20 },
    {
      id: "reward-hacking",
      label: "reward hacking",
      x: 0.78,
      y: 0.52,
      kind: "concept",
      r: 18,
    },
    {
      id: "const-ai",
      label: "constitutional AI",
      x: 0.5,
      y: 0.66,
      kind: "paper",
      r: 20,
      fresh: true,
    },
    {
      id: "harmlessness",
      label: "harmlessness",
      x: 0.34,
      y: 0.82,
      kind: "concept",
      r: 15,
    },
    { id: "rlaif", label: "RLAIF", x: 0.68, y: 0.82, kind: "concept", r: 15 },
    {
      id: "red-teaming",
      label: "red-teaming",
      x: 0.86,
      y: 0.74,
      kind: "concept",
      r: 14,
    },
    {
      id: "sft",
      label: "supervised FT",
      x: 0.16,
      y: 0.78,
      kind: "concept",
      r: 14,
    },
    {
      id: "arcan-shell",
      label: "arcan shell",
      x: 0.14,
      y: 0.25,
      kind: "artifact",
      r: 14,
    },
  ],
  edges: [
    { a: "rlhf", b: "agent-safety" },
    { a: "reward-hacking", b: "agent-safety" },
    { a: "const-ai", b: "rlhf", fresh: true },
    { a: "const-ai", b: "reward-hacking", fresh: true },
    { a: "const-ai", b: "agent-safety", fresh: true },
    { a: "const-ai", b: "harmlessness" },
    { a: "const-ai", b: "rlaif" },
    { a: "const-ai", b: "red-teaming" },
    { a: "const-ai", b: "sft" },
    { a: "arcan-shell", b: "rlhf" },
  ],
};

export const DEMO_DIFFS: Record<
  string,
  { stat: string; lines: { n?: number; s: string; kind?: "add" | "del" }[] }
> = {
  "crates/arcan/src/stream.rs": {
    stat: "−18 / +28",
    lines: [
      { n: 14, s: "pub async fn forward(" },
      { n: 15, s: "    mut rx: Receiver<Chunk>," },
      { n: 16, s: "    tx: mpsc::Sender<SseEvent>," },
      { n: 17, s: ") -> Result<()> {" },
      { n: 18, kind: "add", s: "    let mut buf = BytesMut::with_capacity(1024);" },
      { n: 19, kind: "add", s: "    let mut flush_at = Instant::now();" },
      { n: 20, s: "    while let Some(chunk) = rx.recv().await {" },
      { n: 21, kind: "del", s: "        let mut s = String::new();" },
      { n: 22, kind: "del", s: "        s.push_str(&chunk.delta);" },
      { n: 23, kind: "del", s: "        tx.send(SseEvent::data(s)).await?;" },
      { n: 24, kind: "add", s: "        buf.extend_from_slice(chunk.delta.as_bytes());" },
      { n: 25, kind: "add", s: "        if buf.len() > 512" },
      { n: 26, kind: "add", s: "          || flush_at.elapsed() > Duration::from_millis(4) {" },
      { n: 27, kind: "add", s: "            tx.send(SseEvent::data_bytes(buf.split())).await?;" },
      { n: 28, kind: "add", s: "            flush_at = Instant::now();" },
      { n: 29, kind: "add", s: "        }" },
      { n: 30, s: "    }" },
      { n: 31, s: "    Ok(())" },
      { n: 32, s: "}" },
    ],
  },
  __default: {
    stat: "+1 / −0",
    lines: [
      { n: 1, s: "{" },
      { n: 2, kind: "add", s: '  "source": "lago",' },
      { n: 3, s: '  "cid": "bafybeig…"' },
      { n: 4, s: "}" },
    ],
  },
};
