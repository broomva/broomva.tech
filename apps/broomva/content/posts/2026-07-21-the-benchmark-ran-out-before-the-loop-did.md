---
title: "The Benchmark Ran Out Before the Loop Did"
summary: We pre-registered a self-improvement experiment, and it was over in one generation — the model aced every task and the selection gate became mathematically unsatisfiable. Two weeks later another lab hit the same wall. The instrument didn't fail. The instrument class did.
date: 2026-07-21
published: true
tags:
  - rcs
  - self-improvement
  - benchmarks
  - agent-infrastructure
  - control-theory
  - empirical-methodology
  - microRCS
links:
  - label: "microRCS — empirical state of record (THESIS_VALIDATION.md)"
    url: "https://github.com/broomva/rcs/blob/main/microrcs/THESIS_VALIDATION.md"
  - label: "Pre-registration (frozen splits + locked hypothesis, merged before any model call)"
    url: "https://github.com/broomva/rcs/blob/main/microrcs/experiments/aide2-run1/PRE_REGISTRATION.md"
  - label: "AIDE² — First Evidence of Recursive Self-Improvement (Weco AI)"
    url: "https://www.weco.ai/blog/first-evidence-of-recursive-self-improvement"
  - label: "MetaSkill-Evolve (LMU/CUHK) — the independent replication"
    url: "https://arxiv.org/abs/2607.05297"
  - label: "Part 2 of this pair: The Folklore Arrived Before the Physics"
    url: "/blog/2026-07-21-the-folklore-arrived-before-the-physics"
---

Three weeks ago I set out to reproduce the most interesting result in the
self-improvement literature on hobby compute. The experiment was over in 933
seconds, in the most instructive way an experiment can end: not because the
infrastructure broke, but because the *question* did.

This post is the negative result, published on schedule because the
pre-registration said it would be — and the structural claim it forced, which I
have not seen stated anywhere: **selection-based self-improvement is only
defined below the benchmark's ceiling, and the frontier is deleting the
below-ceiling region of every closed benchmark at its own doubling rate.**

## The setup

The recipe under test was AIDE²'s — the strongest published evidence of
recursive self-improvement to date. An outer loop mutates an inner agent's
harness; a candidate is kept *only* if it beats the incumbent on a held-out
private split it never optimizes against. The private gate is the whole design.
It is what turns an open-ended rewriting loop into something that compounds
instead of hallucinating its own progress — in my earlier framing, it is the
causally independent checker that self-improvement lives or dies on.

I rebuilt the recipe on subscription compute — `claude -p` as the inner agent,
a frontier model as the mutation proposer, curated SWE-bench-Lite tasks as the
substrate. Before any model call, the discipline: train/holdout/final splits
frozen in the repo, hypothesis locked verbatim ("CONFIRM iff the evolved
harness beats genesis on the untouched final split"), and an environment
validated the hard way — every task instance oracle-checked so that the
ground-truth patch flips its failing tests to passing through the *actual*
verifier. That last step mattered: the first curation pass found the naive
environment graded only 2 of 20 instances correctly, and worse, that source
edits weren't being exercised by the verifier at all. An environment bug of
that class doesn't make your experiment fail — it makes every episode silently
score zero while the loop appears to run. If you take one engineering note
from this post: validate your verifier with the gold patch before you spend a
single model call.

## The result

Generation 1: the inner model — a current frontier coder — solved **every
task**. All six training instances. All three held-out instances. Twelve of
twelve episodes, score 1.0.

Which means the incumbent's held-out score was 1.0, and the private gate —
*accept only strict improvement on the holdout* — became *mathematically
unsatisfiable*. No candidate harness can ever be accepted. The evolved system
is the genesis system by construction; the pre-registered margin is identically
zero. Verdict, per the locked criterion: DISCONFIRM — by ceiling, not by
measured inferiority.

There is nothing to salvage with more generations, and I didn't run them. The
selection signal a self-improvement loop feeds on is the *difference* between
candidate and incumbent, and at the ceiling that difference cannot exist.

## The replication I didn't order

Here is the part that moves this from anecdote to structure. Two weeks before
my run, a group at LMU Munich published MetaSkill-Evolve — a two-timescale
skill-evolution loop, different mechanism, different benchmark. On ALFWorld,
their own words: *"the backbone already solves most episodes (92.31%), leaving
little room to improve."* Their meta-level's contribution on that benchmark:
recovering roughly two points of headroom that barely existed.

Two independent instruments, built by teams unaware of each other, pointed at
different closed benchmarks, returning the same reading in the same month. When
that happens the instruments aren't broken. The *instrument class* is.

## The structural claim

A selection gate needs headroom the way a thermometer needs a temperature
range. Every self-improvement paper implicitly assumes a persistent capability
gap between the model and the task — the room the loop is supposed to close.
But the frontier closes that gap *for free*, from the outside, on its own
schedule. Anthropic's published numbers put the task-horizon doubling at
months, not years. Every closed benchmark — fixed ground truth, bounded score —
therefore has a **half-life as a self-improvement substrate**, set not by its
design but by the frontier's capability curve. SWE-bench-Lite, for a frontier
coder, is already past it.

Read the field's own choices through this lens and they become legible. AIDE²
ran its loop with a deliberately *weak* inner model — that's headroom
engineering, and it works, but it's a wasting asset: the headroom you buy by
using yesterday's model evaporates with every release, and results earned there
describe a regime the frontier has already left. AIDE² also scored on
leaderboard-style metrics with no ceiling — that's the durable fix.
**Open-ended objectives are not a nice-to-have for self-improvement research.
They are the only substrate on which the selection gate stays defined.**

## What this means beyond benchmarks

The uncomfortable generalization: this is not really about self-improvement
loops. It is about *measurement*. A saturated benchmark can't resolve
differences between systems at the top — ours just made the failure vivid
because a selection gate turns "can't resolve" into "can't function." As the
frontier rises, the interesting, measurable differences between agent systems
stop living in the model and start living in the **loop** — its stability
under perturbation, whether its verifier stays honest under optimization
pressure, whether its meta-level lifts the ceiling or just reaches it faster.
Those quantities don't saturate, because they aren't capability quantities.

That is where the next experiment points, and it is the subject of the next
post: the field has, in the last six months, converged on the *narrative* that
the harness — the loop around the model — is what matters. What it doesn't
have yet is a single theorem about when that loop converges, oscillates, or
collapses. The folklore arrived before the physics.

---

*Everything above is reproducible: the pre-registration, the frozen splits,
the oracle-validated environment, the twelve episode records, and the ledger
entry — including this negative result — are in the public repo, committed
before, during, and after the run. The MetaSkill-Evolve and AIDE² results
cited are preprints/blog reports and not yet peer-reviewed; so is the
environment-fidelity caveat that applies to any venv-based SWE-bench setup.*
