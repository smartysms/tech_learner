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

## Mind mapping — researched 2026-08-21, ADOPT NARROWLY (different verdict from the other two)

**How it works / evidence**: radial/hierarchical visual structure + explicit
connections between concepts. Evidence is genuinely mixed, not uniformly
positive: large effect sizes appear when mind mapping is compared to
*passive* learning (lectures, straight reading — SMD≈1.45 across 52 studies),
but the more relevant comparison — mind mapping vs. *another active study
technique* — showed only a modest ~10-15% improvement in 1-week factual
recall (Farrand et al. 2002). **Key distinction**: mind mapping's evidence
base is strongest for initial encoding/organizing/seeing relationships
between concepts, not for recall-under-delay, which is what SM-2 flashcards
already do. It is a complementary technique to spaced repetition ("see the
forest"), not a competing recall mechanism ("drill the trees") — unlike Loci
and Peg systems, it isn't being asked to do the same job our flashcards
already do, so the deck-scale objection that killed those two doesn't apply
here in the same way.

**Feasibility finding (bigger than expected)**: the user already has
`mind_map_project` (`personal_project\mind_map_project\`), a working React
mind-map editor — and it turns out to be far more built-out than a bare
diagramming tool:
- It has its **own independent SM-2-style SRS system** built into individual
  map nodes (`learningStore.ts`: `easeFactor`, `interval`, `repetitions`,
  `nextReview`, due-review queries, streaks) — structurally near-identical to
  our `srs.js`.
- It has its **own AI quiz generation** via Puter (an in-browser AI SDK,
  separate from our local-Ollama `notes_ingest` pipeline).
- It has a **clean, validated JSON import/export format**
  (`MindMap = {metadata, settings, nodes, edges, viewport}`) that our
  existing chunk metadata (subject → chapter_title → section_title, already
  hierarchical) maps onto almost directly, optionally with embedding-
  similarity cross-links between related sections (we already compute these
  embeddings for the generation pipeline).
- It builds and runs (`vite build`/`dev`, has a `dist/`) — not vaporware.

**Decision**: adopted narrowly, built and piloted 2026-08-21. Implemented as
`notes_ingest/mindmap_export.py` — plain **Markdown** output (not hand-built
JSON): `mind_map_project` already has a Markdown importer that turns
headings/nested bullets into a tree, so a subject/chapter/section hierarchy
maps directly onto simple bullet nesting with zero new code needed inside
`mind_map_project` itself. Two output types per subject, written to
`notes_ingest/data/mindmaps/<subject>/`:
1. **Outline maps** (one per chapter) — subject+chapter as heading, section
   titles as bullets. Pure structure from existing Chroma metadata, no LLM
   call needed.
2. **Process flow maps** — per user request, refined scope: content
   describing an actual sequential procedure (e.g. "how a producer sends a
   message") gets its own separate, focused map rather than being flattened
   into the generic outline. Detected via one new Ollama call per chunk
   (`ProcessExtraction`, deliberately kept as its own isolated script/prompt
   rather than extending `generate.py`, to avoid touching a file the
   concurrent card-generation pipeline was actively editing). A strictly-
   nested bullet chain (each step one level deeper than the last) imports as
   a straight-line flow of connected nodes — no new node/edge type needed.

Piloted on Kafka ch1 (outline) and the Producer Reference doc (process
detection correctly found the `ProduceRequest` flow, 9 steps, coherent order)
— both produced clean, correctly-structured Markdown. Not yet run across the
full library (deliberately — avoids Ollama contention with the concurrent
Docker/Decorators card-generation batch job).

## P.A.O. system (Person-Action-Object) — researched 2026-08-21, REJECTED

**How it works**: a competitive-memory technique for encoding *arbitrary
symbol sequences* (digits, playing cards) — every 2-digit number 00-99 gets a
fixed, pre-memorized Person-Action-Object image, and long sequences are
encoded by chaining these images. It is not a general conceptual-learning
technique; the entire evidence base (e.g. speed-card world records improving
from ~2min to 12.74s) is for arbitrary, meaningless symbols, not semantic
technical content.

**The specific angle investigated and ruled out**: whether PAO's three-part
structure naturally fits our new process-flow content, since a step like
"producer serializes record" already has a Person/Action/Object shape. This
turned out to be a coincidence of surface grammar, not a real technique
transfer — PAO's mechanism is binding *arbitrary, meaningless* symbols to a
*fixed, pre-rehearsed* image so they become memorable at all. "Producer
serializes record" is already meaningful; it doesn't need arbitrary imagery
grafted on, it needs testing (cloze/recall, already built) or structural
understanding (mind maps, already being built). Forcing PAO onto it solves a
problem this content doesn't have.

**Why not built**: same root problem as Loci/Peg (self-generated imagery
matters; doesn't scale to thousands of facts), plus PAO specifically requires
a fixed lookup table built for arbitrary symbols 00-99 that has no natural
mapping onto open-ended technical content — an even worse structural fit
than Loci or Peg, not a workaround for either. Nothing deferred.

**Flagged, not decided**: the workspace now has **two independent SRS
implementations** — this app's `srs.js`/`app.js`, and `mind_map_project`'s
`learningStore.ts`. This is a separate decision from the mind-mapping
question (ignore/retire/reconcile) and should be made explicitly rather than
left as accidental duplication.
