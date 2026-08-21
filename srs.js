// Pure SM-2 spaced-repetition logic. No DOM, no localStorage — easy to reason
// about / sanity-check in isolation (paste into a console if you want).

const RATING_TO_QUALITY = { again: 0, hard: 3, good: 4, easy: 5 };

// Date-only arithmetic done entirely in local-calendar-date space (never via
// toISOString/UTC conversion) — otherwise timezones ahead of UTC (e.g. IST)
// shift the date back by a day.
function formatISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayISO() {
  return formatISO(new Date());
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatISO(dt);
}

function newCardState() {
  return {
    ef: 2.5,
    interval: 0,
    repetitions: 0,
    dueDate: todayISO(),
    lastReviewed: null,
  };
}

// card: {ef, interval, repetitions, dueDate, lastReviewed}
// rating: "again" | "hard" | "good" | "easy"
// returns a NEW state object (does not mutate input)
function updateCard(card, rating) {
  const q = RATING_TO_QUALITY[rating];
  if (q === undefined) {
    throw new Error(`Unknown rating: ${rating}`);
  }

  let { ef, interval, repetitions } = card;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ef);
    }
    repetitions += 1;
  }

  ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  const today = todayISO();
  return {
    ef,
    interval,
    repetitions,
    dueDate: addDaysISO(today, interval),
    lastReviewed: today,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { updateCard, newCardState, todayISO, addDaysISO };
}
