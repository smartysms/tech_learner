# Deep Dive SRS

A minimal, offline-first spaced-repetition flashcard app covering multiple
study subjects (currently SQL and Kafka, more to come) — SQL from
`sql_practice`, Kafka (and future subjects) auto-generated from PDF notes by
`notes_ingest/`.

No backend, no build step, no framework. Plain HTML/CSS/JS + SM-2 scheduling,
state kept in `localStorage`, installable as a standalone PWA via GitHub Pages.

## How it works

Two card types, both scheduled by the same SM-2 algorithm (see `srs.js`):

- **recall** — reveal a prompt, recall the answer yourself, tap "Show Answer"
  to see the reference `answer` + `notes`, then self-rate your recall
  (Again / Hard / Good / Easy).
- **cloze** — a sentence with one key term blanked out (`{{blank}}` in the
  source data, shown as `_____`). Type your answer and tap "Check" (or press
  Enter) to see whether it matched `cloze_answer` (case/whitespace-insensitive)
  before self-rating the same way. Used for drilling syntax/commands/config
  keys rather than concepts.

All subjects share one `questions.json` / one `localStorage["srsState"]` blob
on purpose — due cards from every subject interleave in the same queue
(shuffled among same-due-date cards, see `buildQueue()` in `app.js`) rather
than being reviewed one subject at a time, per spaced-repetition research on
interleaved practice.

## Updating the question set

**SQL cards** come from `sql_practice/lab/question_bank.py`:
```
cd ../sql_practice
uv run python lab/export_questions_json.py
```

**Other subjects** (Kafka, and future ones) are generated from the PDF notes
library by `../notes_ingest/` — see that project's README for the
extract → embed → generate → merge pipeline. Each subject is run and reviewed
independently, then merged into this app's `questions.json` with
`uv run python -m notes_ingest.pipeline merge --subject <name>`.

Either way, commit the updated `questions.json` here and push.

## Local dev / testing

```
python -m http.server 8000
```

Open `http://localhost:8000`, then check Chrome DevTools → Application tab
(Manifest / Service Workers / Cache Storage / Local Storage) and run a
Lighthouse PWA audit before deploying.

Note: the service worker fetches `questions.json` network-first (falls back
to cache offline) so new subjects reach an already-installed phone without
needing a cache-name bump — but the app shell (`app.js`/`srs.js`/etc.) is
still cache-first, so bump `CACHE_NAME` in `service-worker.js` whenever those
files change, or a returning user won't see the update.

## Deploying

Push this repo to GitHub, enable GitHub Pages (Settings → Pages → branch
`main`, root), then open `https://<username>.github.io/sql_srs_app/` on your
phone and use Chrome's "Install app" / "Add to Home Screen".

## Regenerating icons

```
uv run --with pillow python gen_icons.py
```

## Not included (by design, kept minimal)

- No auto-grading of typed SQL/commands beyond the cloze exact-match check
  (no live database connection from the phone).
- No accounts/sync — progress lives only in this browser's localStorage.
- No browse-all-cards view — just the daily review queue.
