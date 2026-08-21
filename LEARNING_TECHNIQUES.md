# Learning technique research log

Research notes on memory/learning techniques considered for Deep Dive SRS,
beyond what's already implemented (spaced repetition via SM-2, active recall,
interleaving across subjects, cloze deletion for syntax, cram mode for
on-demand massed review). Each entry: how the technique works, whether it
was adopted, and why — so we don't re-research the same ground later or lose
the reasoning behind what got built vs. skipped.

## Method of Loci (memory palace) — researched 2026-08-21, NOT adopted

**How it works**: binds items to locations along a mental route through a
familiar space, using vivid imagery + spatial memory. Genuinely engages
spatial-navigation brain circuitry (hippocampus/parahippocampal/retrosplenial),
not just a metaphor. Strong effect size vs. plain rehearsal (d≈0.88 on serial
recall).

**Why not built** — two real mismatches with this app, not just "too much
work":
1. **Self-generated imagery beats externally-assigned imagery** in the
   literature. An LLM auto-generating "your" memory-palace association at
   card-generation time works against the actual mechanism — image generation
   is itself the skill that makes the technique work, and outsourcing it
   weakens the effect.
2. **Scale mismatch.** Loci is validated for tens of *ordered* items (a
   speech, a number sequence). Effective capacity caps around ~2 items per
   location in the literature. This app is headed toward 4,000+ *unordered*
   technical facts across 13 subjects — there's no research support for the
   technique at that scale. Even VR-based digital loci implementations (the
   only digital adaptation with real evidence behind them — flat non-immersive
   apps have no comparable evidence) don't address this.

**What might still be worth building someday**: an optional, self-authored
"memory hook" text field on individual cards — not LLM-generated, not applied
to the whole deck, just something the user types in themselves for the small
number of cards they personally keep forgetting. This matches what the
research actually supports (self-generated + selectively applied) without
promising a memory-palace experience the technique doesn't scale to here.
Not built yet — deferred pending decision.

## Peg system (peg-word mnemonic) — researched 2026-08-21, NOT adopted

**How it works**: pre-memorize a small *fixed* set of number→image pegs
(rhyme system: "one-bun, two-shoe...", or the phonetic Major System), then
attach new items to those pegs via imagery — same elaborative-encoding
mechanism as loci, but reusing a fixed small set (10-100 pegs) instead of an
expandable spatial route. Gives direct positional recall ("what's item #3")
and is faster to learn initially than building a route. Real evidence base:
raises serial/paired-associate recall "at least an order of magnitude" over
rote learning in controlled studies.

**Why not built** — same two problems as Method of Loci (self-generated
imagery matters; not evidence-based at deck-wide scale), **plus a
peg-specific aggravating factor**: a controlled study reusing the same 20
pegs across 5 successive 20-item lists found a strict retroactive-interference
curve — later lists degraded recall of earlier ones — unless a
"progressive elaboration" strategy was used, and even that was only
validated at 5×20=100 items total. This app would need to reuse each of
~10-100 pegs *hundreds* of times across thousands of unrelated technical
facts — an order of magnitude beyond anything studied, with no coherent way
to progressively elaborate one story per peg across unrelated Kafka/Docker/
SQL facts. Loci doesn't have this specific failure mode (it just adds new
locations rather than being forced to reuse a fixed set), making peg systems
if anything a slightly worse fit than loci was, not a workaround for it.

**One narrow, honest opportunity — not actually "the peg system"**: the
notes already contain naturally ordered/numbered lists (e.g. "Five Ways To
Prevent Partition Skew"). What peg systems are good at — positional recall
("what's step 3 of 5") — doesn't actually require pegs or imagery to capture:
just generate an explicit "what is step N of M" card variant alongside the
normal open-recall card for content that's already a numbered list in the
source. Cheap `generate.py` prompt tweak, tests a genuinely different
retrieval skill (sequence/position vs. open recall). Worth doing as its own
small backlog item if wanted, but should be scoped and described as
ordered-list-aware card generation — not as "the peg system." Not built yet
— deferred pending decision.
