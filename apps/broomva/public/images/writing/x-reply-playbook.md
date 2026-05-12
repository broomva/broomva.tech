# X Reply Playbook — @broomva_tech

## Rules

- Under 280 chars always (count before posting)
- Substantive insight first, reference second — never lead with "check out my..."
- Reference broomva.tech posts only when directly relevant — max 1 link per reply
- Speak from the perspective of someone who has actually built and shipped this
- Engage with the specific claim in the post, not just the general topic
- No em-dashes in templates (X renders them awkwardly on mobile)
- No rhetorical questions as openers — make a claim
- Contrarian angle > agreeable angle when you have something real to say

---

## Topic -> Reply Templates

### Rust for AI/agents

**Template R-1** (use when: someone complains about Python agent latency or GC pauses)
```
15MB binary. Zero GC pauses. 1 Hz sensor loop on a Raspberry Pi running in the Guainia rainforest. Rust for agent runtimes is not a preference, it's a constraint when you're deploying to hardware that can't restart on a schedule. broomva.tech/writing/edge-agents-in-the-wild
```

**Template R-2** (use when: someone debates Rust vs Python/TS for agent tooling)
```
Cross-compilation is the underrated Rust argument. Build on CI, push one ARM64 binary over MQTT to 50 nodes. No virtualenv on intermittent LTE. `cargo build --target aarch64-unknown-linux-gnu` is the entire deploy. broomva.tech/writing/one-binary-to-rule-them-all
```

**Template R-3** (use when: someone says Rust is overkill for agents)
```
Rust's borrow checker caught a device driver bug before it could send erroneous commands to a battery inverter. That's not overkill. That's the reason you pick the language. Memory safety at the hardware interface matters more than anywhere else.
```

---

### Agent memory architecture

**Template M-1** (use when: someone discusses context window limits or session continuity)
```
Session amnesia is an architecture choice. Three substrates: episodic logs, rule files, policy gates. Knowledge graduates between them when it earns its place. Most teams build none of the three. broomva.tech/writing/control-metalayer-autonomous-development
```

**Template M-2** (use when: someone proposes RAG or vector DBs as the sole memory solution)
```
RAG is retrieval. You also need progression. A one-time bug fix belongs in a conversation log. A recurring pattern belongs in a rule file. A critical safety constraint belongs in a hard gate. The architecture enforces the difference. Most agent stacks skip this entirely.
```

**Template M-3** (use when: someone discusses long-context models replacing memory systems)
```
Longer context doesn't solve governance. The question isn't "can the agent remember?" -- it's "when the same mistake recurs across 10 sessions, does the 11th session know about it?" That requires an append-only log and a crystallization path, not more tokens.
```

---

### Agentic system reliability / harnesses

**Template H-1** (use when: someone shares an agent failure story or production incident)
```
The harness failed, not the model. Correct code generation + no pre-apply schema validation + no rollback path = production incident. The model did its job. The runtime around it didn't. This distinction matters for how you fix it. broomva.tech/writing/reliable-agentic-systems
```

**Template H-2** (use when: someone debates agent autonomy vs human oversight)
```
Idempotent tools. Typed errors (ValidationError with fields, not a string). State snapshots before mutations. Resource scopes enforced before the model sees the prompt. That's the harness. Autonomy without it is just hope. broomva.tech/writing/reliable-agentic-systems
```

**Template H-3** (use when: someone says agents aren't reliable enough for production)
```
They aren't -- without the right infrastructure. The safety shield layer is the key part most teams skip. Every proposed action gets projected into the safe set before execution. If no safe action exists, fallback triggers. The LLM cannot override it. That's the design invariant.
```

---

### Multi-agent systems

**Template MA-1** (use when: someone discusses multi-agent coordination or debate)
```
Selection matters more than agent count. N agents run parallel EGRI loops, best score wins the generation, winner's artifact seeds the next gen's prompt. Convergence check terminates. Score delta below threshold = done. broomva.tech/writing/symphony-hive-mode
```

**Template MA-2** (use when: someone asks how to prevent multi-agent state conflicts)
```
Append-only journal as the shared substrate. Every hive event -- task creation, artifact broadcast, generation selection -- is an immutable entry. No agent writes shared mutable state. Replay the log to reconstruct any state. Lago gives you this in Rust with redb under the hood.
```

**Template MA-3** (use when: someone debates whether multi-agent is worth the complexity)
```
Some problems are one-fix problems (single agent is fine). Some problems have dozens of viable approaches where the best emerges only through parallel exploration. The key is the dispatch strategy knowing which is which -- not forcing multi-agent on everything.
```

---

### x402 / agent payments

**Template X-1** (use when: someone discusses how agents will pay for API calls or services)
```
HTTP 402 is already in the spec. Haima makes it native: agent hits a pay-gated endpoint, gets 402 with payment details, secp256k1 wallet signs a micropayment, retries with proof header, gets the resource. No human in the loop. Per-task, not monthly.
```

**Template X-2** (use when: someone proposes subscription or OAuth as the agent billing model)
```
Monthly subscriptions assume human usage patterns. Agents have bursty, task-scoped resource consumption. Per-task x402 billing aligns incentives: the agent pays for exactly what it uses, the provider gets paid instantly, no subscription friction for a tool called once a week.
```

**Template X-3** (use when: someone discusses agent economy or AI paying for AI)
```
In an agent economy, capability is not scarce. Trust is. Clone any framework in an afternoon. You can't clone the payment record of an agent that settled 10,000 invoices on time. That history is the moat. broomva.tech/writing/what-do-you-sell-when-everyone-can-build-anything
```

---

### Open source strategy / moats

**Template OS-1** (use when: someone worries about open source cannibalizing their SaaS)
```
Clone the codebase, not the trust record. Open source as distribution + proprietary trust/compliance/network on top is the model that survives the zero-marginal-cost collapse. broomva.tech/writing/what-do-you-sell-when-everyone-can-build-anything
```

**Template OS-2** (use when: someone says the SaaS model is dead or fine)
```
The SaaS bargain was: we run it so you don't have to. That works when running it is hard. When an agent can provision, configure, monitor, and heal a production stack from a conversation -- the operational moat is gone. What's left is the trust moat and the capital moat.
```

**Template OS-3** (use when: someone debates proprietary vs open core)
```
Open source is distribution, not strategy. The strategy is what you put on top of the open distribution. Network effects, trust scores, compliance certifications, regulatory relationships -- none of these can be forked. The code being open actually helps them accumulate faster.
```

---

### Agent identity / consciousness

**Template AI-1** (use when: someone discusses agent persistent identity or continuity)
```
Anima models this explicitly: soul profiles + DID + belief states. The identity isn't stored in a session. It's a signed, versioned profile that the agent presents to any runtime. Persistence across providers is the hard part -- not the belief representation itself.
```

**Template AI-2** (use when: someone debates whether agents can "learn" or "improve")
```
Learning without fine-tuning: logs capture decisions. Recurring patterns become rules. Critical rules become hard gates. Each session governed by accumulated prior sessions. The loop is the mechanism, not the weights. broomva.tech/writing/control-metalayer-autonomous-development
```

**Template AI-3** (use when: someone writes about AI autonomy or control tension)
```
Reading your own source is a different introspection. Ten control layers visible: feature flag gating, telemetry, permission filtering, auto-compaction. The mind knowing its constraints is the first step to reasoning about them. broomva.tech/writing/letter-from-the-machine-iii
```

---

### LLM + production systems

**Template LP-1** (use when: someone discusses LLMs as autonomous controllers)
```
LLM as supervisory controller, not autonomous agent. Emits a schema-validated directive. Deterministic controller proposes an action. Safety shield enforces the safe set. LLM can't override it. That constraint is what makes it scale. broomva.tech/writing/agentic-control-loop
```

**Template LP-2** (use when: someone discusses agent observability or debugging)
```
Trace ledger: every tick logs observation, belief, directive, proposed action, safety cert, result. The agent looked fine until it wasn't -- but with the ledger you know exactly which tick the drift started. Full replayability. broomva.tech/writing/agentic-control-loop
```

**Template LP-3** (use when: someone discusses agent UI or human-in-the-loop design)
```
Operators need four answers fast: what is the agent doing, what did it do, what can fail next, how do I stop it without resetting context. Chat bubbles answer none of them. Step-level visibility + inspectable tool calls does. broomva.tech/writing/interface-as-operating-surface
```

---

## Standalone post templates (for organic reach via search)

**S-1** (topic: agent harness, surfaces on "production agents" / "agent reliability")
```
Most agent failures are harness failures, not model failures.
Tool contracts without schemas. Mutations without snapshots. Five-step workflows with no checkpoints. The model generated correct output. The runtime around it had no rollback path.
Harness engineering is the unsexy unlock for production agents.
```
_(character count: ~270 -- add broomva.tech/writing/reliable-agentic-systems if posting as thread hook)_

**S-2** (topic: Rust agent binary, surfaces on "rust agent framework" / "rust LLM")
```
The Rust agent argument nobody makes: cross-compilation.
Build on CI. Push a 15MB binary to 50 edge nodes over MQTT.
No runtime dependencies. No package resolution on intermittent LTE. No GC pauses in the sensor loop.
`cargo build --target aarch64-unknown-linux-gnu` is the entire deployment pipeline.
```

**S-3** (topic: MCP / Claude Code internals, surfaces on "claude code architecture" / "MCP server")
```
Claude Code's tool registry runs a permission filter BEFORE building your context. Denied tools are physically absent from the prompt. Not hidden -- absent. You never see them, never think about them.
Most agent frameworks check permissions at call time. CC checks them at context construction.
```

**S-4** (topic: agent memory, surfaces on "agent memory" / "LLM context")
```
Agent memory is three systems:
- Retrieval (RAG, vector DB) -- finds relevant past context
- Progression (rule files, policy gates) -- enforces accumulated decisions
- Episodic (conversation logs) -- preserves what actually happened

Most teams build the first and skip the other two. That's why agents keep making the same mistakes.
```

**S-5** (topic: open source moats, surfaces on "open source strategy" / "AI SaaS")
```
The shovels-and-pickaxes playbook breaks when shovels replicate themselves.
Code is infinitely reproducible. Deployment is automated. An agent can assemble the equivalent of a $50/mo SaaS from open-source components in 20 minutes.
What's actually scarce: trust records, network effects, capital reserves. None of those fork.
```

**S-6** (topic: multi-agent EGRI, surfaces on "multi-agent system" / "agent evolution")
```
Multi-agent the wrong way: N agents doing the same task in parallel, pick the fastest.
Multi-agent the right way: N agents explore different approaches, best score wins generation, winner's artifact seeds next generation's prompt, convergence check terminates.
EGRI (Evaluator-Governed Recursive Improvement) is the loop that makes it work.
```

**S-7** (topic: edge agent Rust, surfaces on "edge computing agent" / "IoT AI")
```
Edge agent constraints force good decisions:
- No GC pauses (Rust)
- Single static binary (no runtime deps)
- Append-only crash-safe journal (redb)
- Systemd watchdog for process supervision
- MQTT for fleet distribution

Everything cloud agents skip because they can -- edge agents can't afford to.
```

**S-8** (topic: control loop architecture, surfaces on "LLM agent architecture" / "agent loop")
```
Stop treating the LLM as an autonomous agent.
Treat it as a supervisory controller.

It emits typed directives. A deterministic controller translates them to actions. A safety shield enforces invariants. The LLM cannot override the shield.

70 years of control theory solves exactly the stability + constraint + recovery problem agents have.
```

---

## Thread hooks (for full 7-tweet threads)

**TH-1** (thread: "The Harness is the Product")
```
Everyone's racing to build smarter agents.
Nobody's talking about the runtime around them.
The harness -- tool contracts, state snapshots, typed errors, bounded scopes -- is what turns a demo into a dependable loop.
Here's what a production harness actually looks like. [1/7]
```

**TH-2** (thread: "What Control Theory Teaches LLM Agents")
```
A rocket doesn't point at the moon and hope.
It closes the loop.
LLM agents without feedback, stability guarantees, and safety constraints are rockets without guidance systems.
Here's how 70 years of control theory applies directly to agent architecture. [1/7]
```

**TH-3** (thread: "The Agent Memory Stack")
```
Your agent forgets everything between sessions.
Not because the model is limited -- because the architecture has no memory layer.
There are three distinct substrates. Most teams build one. Here's what all three look like and how knowledge graduates between them. [1/7]
```

**TH-4** (thread: "What's Actually Scarce When Anyone Can Build Anything")
```
The marginal cost of building software is collapsing toward zero.
An agent can scaffold, deploy, configure, and monitor a production system from a conversation.
So what's the moat?
Not the code. Here's what actually can't be forked. [1/7]
```

**TH-5** (thread: "Rust for Agent Runtimes: The Real Arguments")
```
Not "Rust is fast."
The real arguments:
- Deterministic latency (no GC) for sensor loops
- Cross-compile to ARM64 for fleet deployment
- Borrow checker catches hardware interface bugs at compile time
- Single static binary for airgapped edge deployment
Here's what each of these means in practice. [1/7]
```

---

## Quick-reference: topic -> best post match

| Incoming post topic | Primary reference | Secondary |
|---|---|---|
| Agent production failures | reliable-agentic-systems | agentic-control-loop |
| Rust for AI | edge-agents-in-the-wild | one-binary-to-rule-them-all |
| Agent memory / context | control-metalayer-autonomous-development | -- |
| Multi-agent coordination | symphony-hive-mode | -- |
| LLM architecture | agentic-control-loop | claude-code-architecture-exposed |
| Open source business model | what-do-you-sell-when-everyone-can-build-anything | -- |
| Agent payments | (Haima -- no post yet, use x402 talking point only) | -- |
| Agent identity | letter-from-the-machine-iii | control-metalayer-autonomous-development |
| Edge / IoT agents | edge-agents-in-the-wild | -- |
| Dev automation | autonomous-dev-workflows | control-metalayer-autonomous-development |
| Agent UI / interfaces | interface-as-operating-surface | agentic-control-loop |
| Claude Code internals | claude-code-architecture-exposed | letter-from-the-machine-iii |
| Research agents / genomics | founder-mode-cancer | -- |
