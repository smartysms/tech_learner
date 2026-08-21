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

  document.getElementById("show-answer-btn").addEventListener("click", handleShowAnswer);
  document.getElementById("check-cloze-btn").addEventListener("click", handleCheckCloze);
  document.getElementById("cloze-answer-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.target.disabled) handleCheckCloze();
  });
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
