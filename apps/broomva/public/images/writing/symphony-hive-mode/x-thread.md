# X Thread — Symphony Hive Mode

## 1/7 — Hook
Some problems are too hard for a single AI agent.

So I built a mode where Symphony spawns N agents that compete and cooperate across generations — each running EGRI loops, coordinating through real-time channels, with the winner's artifact evolving into the next generation.

Multi-agent collaborative evolution. All Rust.

## 2/7 — How it works
Label an issue "hive" → Symphony dispatches 3 agents in parallel → each runs bounded improvement loops → agents publish scores to a shared Spaces channel → coordinator picks the winner → injects context into the next generation

Repeat until convergence or max generations.

## 3/7 — The stack (no new dependencies)
5 crates touched, zero new deps:

- aios-protocol: 5 typed event variants
- lago-core: EventQuery metadata filtering + HiveTask aggregate
- arcan-spaces: real-time coordination (JSON over SpacetimeDB)
- autoany-core: inject_history() for cross-pollination
- symphony: HiveCoordinator + dispatch eligibility

## 4/7 — Cross-pollination is the key
After each generation, the winning agent's trial history is injected into every agent in the next generation.

The proposer in generation N+1 sees what worked and failed in generation N — across all agents. It learns from peers without explicit coordination.

3 agents × 5 generations × 10 trials = 150 evaluated approaches. Best one wins.

## 5/7 — Full auditability
Every event is immutable in the Lago journal:
HiveTaskCreated → HiveArtifactShared → HiveSelectionMade → HiveGenerationCompleted → HiveTaskCompleted

Replay any hive task from any point in time. Understand exactly why a solution won.

## 6/7 — Zero friction
```yaml
hive:
  enabled: true
  agents_per_task: 3
  max_generations: 5
  convergence_threshold: 0.01
```

That's it. Issues without the hive label use the existing single-agent path. No changes to the normal flow.

## 7/7 — CTA
Full technical deep dive with actual Rust code:
[link to post]

Symphony is open source: github.com/broomva/symphony
AutoAny (EGRI framework): github.com/broomva/autoany

Multi-agent collaborative evolution, wired into the orchestration layer. No separate platform. Just a dispatch strategy.
