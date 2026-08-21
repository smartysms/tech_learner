const STATE_KEY = "srsState";

let questions = [];
let srsState = {};
let queue = [];
let reviewedCount = 0;

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

function buildQueue() {
  const today = todayISO();
  return questions
    .filter((q) => ensureCardState(q.id).dueDate <= today)
    .sort((a, b) => srsState[a.id].dueDate.localeCompare(srsState[b.id].dueDate));
}

function showScreen(id) {
  for (const el of document.querySelectorAll("#app > main")) {
    el.hidden = el.id !== id;
  }
}

function renderDueCount() {
  const today = todayISO();
  const dueTotal = questions.filter((q) => ensureCardState(q.id).dueDate <= today).length;
  document.getElementById("due-count").textContent = `${dueTotal} due`;
}

function renderCurrentCard() {
  if (queue.length === 0) {
    renderDone();
    return;
  }

  const card = queue[0];
  document.getElementById("card-block").textContent = card.block;
  document.getElementById("card-topic").textContent = card.topic;
  const labelEl = document.getElementById("card-label");
  if (card.label) {
    labelEl.textContent = card.label;
    labelEl.hidden = false;
  } else {
    labelEl.hidden = true;
  }
  document.getElementById("card-prompt").textContent = card.prompt;
  document.querySelector("#card-sql code").textContent = card.solution_sql;
  document.getElementById("card-notes").textContent = card.dialect_notes || "";

  document.getElementById("answer").hidden = true;
  document.getElementById("show-answer-btn").hidden = false;

  showScreen("review-screen");
  renderDueCount();
}

function renderDone() {
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

  document.getElementById("show-answer-btn").addEventListener("click", handleShowAnswer);
  document.querySelectorAll(".rate").forEach((btn) => {
    btn.addEventListener("click", () => handleRate(btn.dataset.rating));
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

init();
