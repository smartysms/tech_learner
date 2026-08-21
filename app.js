const STATE_KEY = "srsState";
const LOG_KEY = "reviewLog";
const LOG_CAP = 20000; // defensive cap, realistically never hit

let questions = [];
let flows = [];
let srsState = {};
let reviewLog = [];
let queue = [];
let reviewedCount = 0;
let cramMode = false;
let cramBackStack = [];
let flowsBackStack = [];

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(srsState));
}

function loadReviewLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function logReview(card, rating) {
  reviewLog.push({
    ts: Date.now(),
    cardId: card.id,
    subject: card.subject,
    block: card.block,
    topic: card.topic,
    rating,
  });
  if (reviewLog.length > LOG_CAP) reviewLog = reviewLog.slice(-LOG_CAP);
  localStorage.setItem(LOG_KEY, JSON.stringify(reviewLog));
}

// Local-calendar-date helpers for a timestamp - same reasoning as srs.js's
// todayISO()/addDaysISO(): never use toISOString() here, it converts to UTC
// and shifts dates a day in timezones ahead of UTC (e.g. IST).
function localDateStr(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(aStr, bStr) {
  const [ay, am, ad] = aStr.split("-").map(Number);
  const [by, bm, bd] = bStr.split("-").map(Number);
  const a = new Date(ay, am - 1, ad);
  const b = new Date(by, bm - 1, bd);
  return Math.round((a - b) / 86400000);
}

function ensureCardState(id) {
  if (!srsState[id]) {
    srsState[id] = newCardState();
  }
  return srsState[id];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildQueue() {
  const today = todayISO();
  const due = questions.filter((q) => ensureCardState(q.id).dueDate <= today);
  // Shuffle first, then a stable sort by dueDate - genuinely overdue cards
  // still come first, but cards sharing the same due date (the common case:
  // most cards are freshly due "today") interleave across subjects instead
  // of grinding through one subject's block before ever reaching another.
  shuffle(due);
  return due.sort((a, b) => srsState[a.id].dueDate.localeCompare(srsState[b.id].dueDate));
}

function showScreen(id) {
  for (const el of document.querySelectorAll("#app > main")) {
    el.hidden = el.id !== id;
  }
}

function renderDueCount() {
  if (cramMode) {
    document.getElementById("due-count").textContent = `${queue.length} left (cram)`;
    return;
  }
  const today = todayISO();
  const dueTotal = questions.filter((q) => ensureCardState(q.id).dueDate <= today).length;
  document.getElementById("due-count").textContent = `${dueTotal} due`;
}

// --- Cram mode: review a whole subject/block/topic on demand, ignoring due dates ---
// Three levels: subject -> block (chapter) -> topic (concept). "All of X" at
// any level starts a cram covering everything under it.

function groupCounts(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function renderCramList(title, allLabel, onAll, entries) {
  const container = document.getElementById("cram-list");
  container.innerHTML = "";

  if (onAll) {
    const allBtn = document.createElement("button");
    allBtn.className = "cram-list-item cram-list-item-all";
    allBtn.textContent = allLabel;
    allBtn.addEventListener("click", onAll);
    container.appendChild(allBtn);
  }

  for (const { label, count, onClick } of entries) {
    const btn = document.createElement("button");
    btn.className = "cram-list-item";
    btn.textContent = `${label} (${count})`;
    btn.addEventListener("click", onClick);
    container.appendChild(btn);
  }

  document.getElementById("cram-picker-title").textContent = title;
  document.getElementById("cram-back-btn").hidden = cramBackStack.length === 0;
}

function renderCramSubjectList() {
  cramBackStack = [];
  const counts = groupCounts(questions, (q) => q.subject);
  const entries = [...counts].map(([subject, count]) => ({
    label: subject,
    count,
    onClick: () => renderCramBlockList(subject),
  }));
  renderCramList("Cram: choose a subject", null, null, entries);
}

function renderCramBlockList(subject) {
  cramBackStack = [renderCramSubjectList];
  const scoped = questions.filter((q) => q.subject === subject);
  const counts = groupCounts(scoped, (q) => q.block);
  const entries = [...counts].map(([block, count]) => ({
    label: block,
    count,
    onClick: () => renderCramTopicList(subject, block),
  }));
  renderCramList(subject, `All of ${subject} (${scoped.length})`, () => startCram({ subject }), entries);
}

function renderCramTopicList(subject, block) {
  cramBackStack = [renderCramSubjectList, () => renderCramBlockList(subject)];
  const scoped = questions.filter((q) => q.subject === subject && q.block === block);
  const counts = groupCounts(scoped, (q) => q.topic);
  const entries = [...counts].map(([topic, count]) => ({
    label: topic,
    count,
    onClick: () => startCram({ subject, block, topic }),
  }));
  renderCramList(block, `All of ${block} (${scoped.length})`, () => startCram({ subject, block }), entries);
}

function cramGoBack() {
  const prev = cramBackStack.pop();
  if (prev) prev();
}

function startCram({ subject, block, topic }) {
  queue = shuffle(
    questions.filter(
      (q) =>
        q.subject === subject &&
        (block === undefined || q.block === block) &&
        (topic === undefined || q.topic === topic)
    )
  );
  cramMode = true;
  reviewedCount = 0;
  renderCurrentCard();
}

function exitCram() {
  cramMode = false;
  queue = buildQueue();
  reviewedCount = 0;
  renderCurrentCard();
}

// --- Flows: browse a process as a connected chain of steps, tap to deep-dive ---

function renderFlowsSubjectList() {
  flowsBackStack = [];
  const counts = groupCounts(flows, (f) => f.subject);
  const container = document.getElementById("flows-list");
  container.innerHTML = "";
  for (const [subject, count] of counts) {
    const btn = document.createElement("button");
    btn.className = "cram-list-item";
    btn.textContent = `${subject} (${count})`;
    btn.addEventListener("click", () => renderFlowsList(subject));
    container.appendChild(btn);
  }
  document.getElementById("flows-title").textContent = "Flows: choose a subject";
  document.getElementById("flows-list").hidden = false;
  document.getElementById("flow-detail").hidden = true;
  document.getElementById("flows-back-btn").hidden = true;
}

function renderFlowsList(subject) {
  flowsBackStack = [renderFlowsSubjectList];
  const container = document.getElementById("flows-list");
  container.innerHTML = "";
  for (const flow of flows.filter((f) => f.subject === subject)) {
    const btn = document.createElement("button");
    btn.className = "cram-list-item";
    btn.textContent = `${flow.name} (${flow.steps.length} steps)`;
    btn.addEventListener("click", () => renderFlowDetail(flow));
    container.appendChild(btn);
  }
  document.getElementById("flows-title").textContent = subject;
  document.getElementById("flows-list").hidden = false;
  document.getElementById("flow-detail").hidden = true;
  document.getElementById("flows-back-btn").hidden = false;
}

function renderFlowDetail(flow) {
  flowsBackStack = [renderFlowsSubjectList, () => renderFlowsList(flow.subject)];
  document.getElementById("flows-title").textContent = flow.name;
  document.getElementById("flows-list").hidden = true;

  const detail = document.getElementById("flow-detail");
  detail.innerHTML = "";
  detail.hidden = false;

  flow.steps.forEach((step, i) => {
    const stepEl = document.createElement("div");
    stepEl.className = "flow-step";

    const head = document.createElement("button");
    head.className = "flow-step-head";
    head.innerHTML = `<span class="flow-step-num">${i + 1}</span><span>${step.label}</span>`;

    const body = document.createElement("p");
    body.className = "flow-step-detail";
    body.textContent = step.detail || "(no further detail)";
    body.hidden = true;

    head.addEventListener("click", () => {
      body.hidden = !body.hidden;
    });

    stepEl.appendChild(head);
    stepEl.appendChild(body);
    detail.appendChild(stepEl);
  });

  document.getElementById("flows-back-btn").hidden = false;
}

function flowsGoBack() {
  const prev = flowsBackStack.pop();
  if (prev) prev();
}

// --- Stats: personal usage analytics, computed entirely from reviewLog ---
// Per-device only (localStorage) - no accounts, no backend, no cross-device
// sync. See LEARNING_TECHNIQUES.md / conversation history for why.

function statsTotals() {
  const today = todayISO();
  const total = reviewLog.length;
  const todayCount = reviewLog.filter((r) => localDateStr(r.ts) === today).length;

  const studiedDates = new Set(reviewLog.map((r) => localDateStr(r.ts)));
  let streak = 0;
  let cursor = today;
  while (studiedDates.has(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return { total, today: todayCount, streak };
}

const HOUR_BANDS = [
  { label: "Night (12am-6am)", test: (h) => h >= 0 && h < 6 },
  { label: "Morning (6am-12pm)", test: (h) => h >= 6 && h < 12 },
  { label: "Afternoon (12pm-6pm)", test: (h) => h >= 12 && h < 18 },
  { label: "Evening (6pm-12am)", test: (h) => h >= 18 && h < 24 },
];

function statsByHourBand() {
  const counts = HOUR_BANDS.map((b) => ({ label: b.label, count: 0 }));
  for (const r of reviewLog) {
    const hour = new Date(r.ts).getHours();
    const idx = HOUR_BANDS.findIndex((b) => b.test(hour));
    if (idx !== -1) counts[idx].count += 1;
  }
  return counts;
}

function statsBySubject() {
  const counts = new Map();
  for (const r of reviewLog) counts.set(r.subject, (counts.get(r.subject) || 0) + 1);
  return [...counts.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count);
}

function statsWeakTopics(minSamples = 3, topN = 8) {
  const byTopic = new Map();
  for (const r of reviewLog) {
    const key = `${r.subject}::${r.topic}`;
    if (!byTopic.has(key)) byTopic.set(key, { subject: r.subject, topic: r.topic, total: 0, again: 0 });
    const entry = byTopic.get(key);
    entry.total += 1;
    if (r.rating === "again") entry.again += 1;
  }
  return [...byTopic.values()]
    .filter((e) => e.total >= minSamples)
    .map((e) => ({ ...e, againRate: e.again / e.total }))
    .sort((a, b) => b.againRate - a.againRate)
    .slice(0, topN);
}

function statsWeeklyAccuracy(weeks = 8) {
  const today = todayISO();
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    label: i === 0 ? "This week" : `${i}w ago`,
    good: 0,
    total: 0,
  }));

  for (const r of reviewLog) {
    const daysAgo = daysBetween(today, localDateStr(r.ts));
    const weekIdx = Math.floor(daysAgo / 7);
    if (weekIdx < 0 || weekIdx >= weeks) continue;
    buckets[weekIdx].total += 1;
    if (r.rating === "good" || r.rating === "easy") buckets[weekIdx].good += 1;
  }

  return buckets.reverse().filter((b) => b.total > 0);
}

function barRow(label, count, max, extra = "") {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return `<div class="stat-bar-row">
    <span class="stat-bar-label">${label}</span>
    <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
    <span class="stat-bar-value">${count}${extra}</span>
  </div>`;
}

function renderStats() {
  const container = document.getElementById("stats-content");

  if (reviewLog.length === 0) {
    container.innerHTML = "<p>No reviews logged yet - stats fill in as you study.</p>";
    document.getElementById("stats-title").textContent = "Stats";
    return;
  }

  const totals = statsTotals();
  const hourBands = statsByHourBand();
  const bySubject = statsBySubject();
  const weakTopics = statsWeakTopics();
  const weekly = statsWeeklyAccuracy();

  const sections = [];

  sections.push(`<div class="stat-section">
    <div class="stat-totals">
      <div><strong>${totals.total}</strong><span>total reviews</span></div>
      <div><strong>${totals.today}</strong><span>today</span></div>
      <div><strong>${totals.streak}</strong><span>day streak</span></div>
    </div>
  </div>`);

  const maxHour = Math.max(...hourBands.map((b) => b.count), 1);
  sections.push(`<div class="stat-section"><h3>When you study</h3>
    ${hourBands.map((b) => barRow(b.label, b.count, maxHour)).join("")}
  </div>`);

  const maxSubject = Math.max(...bySubject.map((b) => b.count), 1);
  sections.push(`<div class="stat-section"><h3>Subject breakdown</h3>
    ${bySubject.map((b) => barRow(b.subject, b.count, maxSubject)).join("")}
  </div>`);

  if (weakTopics.length > 0) {
    sections.push(`<div class="stat-section"><h3>Weak spots (highest "Again" rate)</h3>
      ${weakTopics
        .map((t) => barRow(`${t.topic} (${t.subject})`, Math.round(t.againRate * 100), 100, "%"))
        .join("")}
    </div>`);
  }

  if (weekly.length > 0) {
    sections.push(`<div class="stat-section"><h3>Accuracy trend (Good+Easy %, by week)</h3>
      ${weekly
        .map((w) => barRow(w.label, Math.round((w.good / w.total) * 100), 100, "%"))
        .join("")}
    </div>`);
  }

  container.innerHTML = sections.join("");
  document.getElementById("stats-title").textContent = "Stats";
}

function renderCurrentCard() {
  if (queue.length === 0) {
    renderDone();
    return;
  }

  const card = queue[0];
  document.getElementById("card-subject").textContent = card.subject || "";
  document.getElementById("card-block").textContent = card.block;
  document.getElementById("card-topic").textContent = card.topic;
  const labelEl = document.getElementById("card-label");
  if (card.label) {
    labelEl.textContent = card.label;
    labelEl.hidden = false;
  } else {
    labelEl.hidden = true;
  }

  document.getElementById("card-sql").hidden = !card.answer;
  document.querySelector("#card-sql code").textContent = card.answer || "";
  document.getElementById("card-notes").textContent = card.notes || "";

  document.getElementById("answer").hidden = true;
  document.getElementById("cloze-feedback").hidden = true;
  document.getElementById("cloze-answer-input").value = "";
  document.getElementById("cloze-answer-input").disabled = false;
  document.getElementById("check-cloze-btn").disabled = false;

  if (card.type === "cloze") {
    document.getElementById("card-prompt").textContent = card.prompt.replace("{{blank}}", "_____");
    document.getElementById("show-answer-btn").hidden = true;
    document.getElementById("cloze-input-block").hidden = false;
    document.getElementById("cloze-answer-input").focus();
  } else {
    document.getElementById("card-prompt").textContent = card.prompt;
    document.getElementById("show-answer-btn").hidden = false;
    document.getElementById("cloze-input-block").hidden = true;
  }

  document.getElementById("cram-exit-btn").hidden = !cramMode;

  showScreen("review-screen");
  renderDueCount();
}

function renderDone() {
  if (cramMode) {
    document.getElementById("done-summary").textContent =
      `Cram session complete. Reviewed ${reviewedCount} card${reviewedCount === 1 ? "" : "s"}.`;
    document.getElementById("done-cram-exit-btn").hidden = false;
    showScreen("done-screen");
    renderDueCount();
    return;
  }

  document.getElementById("done-cram-exit-btn").hidden = true;
  const today = todayISO();
  const upcoming = questions
    .map((q) => srsState[q.id].dueDate)
    .filter((d) => d > today)
    .sort();
  const next = upcoming.length > 0 ? upcoming[0] : null;

  const summary = next
    ? `All done for today. Reviewed ${reviewedCount} card${reviewedCount === 1 ? "" : "s"}. Next review: ${next}.`
    : `All done for today. Reviewed ${reviewedCount} card${reviewedCount === 1 ? "" : "s"}.`;
  document.getElementById("done-summary").textContent = summary;

  showScreen("done-screen");
  renderDueCount();
}

function handleShowAnswer() {
  document.getElementById("answer").hidden = false;
  document.getElementById("show-answer-btn").hidden = true;
}

function handleCheckCloze() {
  const card = queue[0];
  const typed = document.getElementById("cloze-answer-input").value.trim().toLowerCase();
  const correct = (card.cloze_answer || "").trim().toLowerCase();
  const isCorrect = typed.length > 0 && typed === correct;

  const feedback = document.getElementById("cloze-feedback");
  feedback.textContent = isCorrect
    ? "Correct!"
    : `Correct answer: ${card.cloze_answer}`;
  feedback.className = isCorrect ? "correct" : "incorrect";
  feedback.hidden = false;

  document.getElementById("cloze-input-block").querySelector("input").disabled = true;
  document.getElementById("check-cloze-btn").disabled = true;
  document.getElementById("answer").hidden = false;
}

function handleRate(rating) {
  const card = queue.shift();
  srsState[card.id] = updateCard(srsState[card.id], rating);
  saveState();
  logReview(card, rating);
  reviewedCount += 1;
  renderCurrentCard();
}

function init() {
  reviewLog = loadReviewLog();

  fetch("questions.json")
    .then((r) => r.json())
    .then((data) => {
      questions = data;
      srsState = loadState();
      questions.forEach((q) => ensureCardState(q.id));
      saveState();
      queue = buildQueue();

      if (questions.length === 0) {
        showScreen("empty-screen");
        return;
      }
      renderCurrentCard();
    });

  fetch("flows.json")
    .then((r) => r.json())
    .then((data) => {
      flows = data;
    })
    .catch(() => {
      flows = [];
    });

  document.getElementById("show-answer-btn").addEventListener("click", handleShowAnswer);
  document.getElementById("check-cloze-btn").addEventListener("click", handleCheckCloze);
  document.getElementById("cloze-answer-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.target.disabled) handleCheckCloze();
  });
  document.querySelectorAll(".rate").forEach((btn) => {
    btn.addEventListener("click", () => handleRate(btn.dataset.rating));
  });

  document.getElementById("cram-open-btn").addEventListener("click", () => {
    renderCramSubjectList();
    showScreen("cram-picker-screen");
  });
  document.getElementById("cram-back-btn").addEventListener("click", cramGoBack);
  document.getElementById("cram-exit-btn").addEventListener("click", exitCram);
  document.getElementById("done-cram-exit-btn").addEventListener("click", exitCram);

  document.getElementById("flows-open-btn").addEventListener("click", () => {
    renderFlowsSubjectList();
    showScreen("flows-screen");
  });
  document.getElementById("flows-back-btn").addEventListener("click", flowsGoBack);

  document.getElementById("stats-open-btn").addEventListener("click", () => {
    renderStats();
    showScreen("stats-screen");
  });
  document.getElementById("stats-back-btn").addEventListener("click", () => showScreen("review-screen"));
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

init();
