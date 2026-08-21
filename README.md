# SQL SRS

A minimal, offline-first spaced-repetition flashcard app for the SQL questions
from `sql_practice` (Postgres/MySQL/Oracle/MSSQL join/window/CTE practice).

No backend, no build step, no framework. Plain HTML/CSS/JS + SM-2 scheduling,
state kept in `localStorage`, installable as a standalone PWA via GitHub Pages.

## How it works

- Reveal a prompt, recall the answer yourself, tap "Show Answer" to see the
  reference `solution_sql` + dialect notes, then self-rate your recall
  (Again / Hard / Good / Easy). That rating drives when the card comes back
  (SM-2 algorithm, see `srs.js`).
- All 26 cards start due on first use; after that, due dates spread out based
  on how well you know each one.

## Updating the question set

Questions come from `sql_practice/lab/question_bank.py`. To refresh
`questions.json` after editing that file:

```
cd ../sql_practice
uv run python lab/export_questions_json.py
```

Then commit the updated `questions.json` here and push.

## Local dev / testing

```
python -m http.server 8000
```

Open `http://localhost:8000`, then check Chrome DevTools → Application tab
(Manifest / Service Workers / Cache Storage / Local Storage) and run a
Lighthouse PWA audit before deploying.

## Deploying

Push this repo to GitHub, enable GitHub Pages (Settings → Pages → branch
`main`, root), then open `https://<username>.github.io/sql_srs_app/` on your
phone and use Chrome's "Install app" / "Add to Home Screen".

## Regenerating icons

```
uv run --with pillow python gen_icons.py
```

## Not included (by design, kept minimal)

- No auto-grading (phone has no access to the Postgres practice DB).
- No accounts/sync — progress lives only in this browser's localStorage.
- No browse-all-cards view — just the daily review queue.
