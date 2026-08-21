const STATE_KEY = "srsState";

let questions = [];
let flows = [];
let srsState = {};
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
  reviewedCount += 1;
  renderCurrentCard();
}

function init() {
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
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

init();
