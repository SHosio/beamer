const feed = document.getElementById("feed");
const empty = document.getElementById("empty");
const soundBtn = document.getElementById("sound");
const wipeBtn = document.getElementById("wipe");

function postJSON(path, obj) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });
}

function showEmptyIfBare() {
  if (!feed.children.length && empty) empty.style.display = "";
}

wipeBtn.addEventListener("click", () => postJSON("/clear", {}));

// Sound preference persists across reloads; default on.
let soundOn = localStorage.getItem("beamer-sound") !== "off";
let audioCtx = null;

function renderSoundBtn() {
  soundBtn.textContent = soundOn ? "🔔" : "🔕";
  soundBtn.title = soundOn ? "Sound on" : "Sound off";
}

function chime() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch (e) {
    // Audio unavailable; ignore.
  }
}

renderSoundBtn();
soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  localStorage.setItem("beamer-sound", soundOn ? "on" : "off");
  renderSoundBtn();
  if (soundOn) chime();  // confirms the choice and unlocks audio for later
});

function relTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString();
}

function addCard(msg) {
  if (empty) empty.style.display = "none";

  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = msg.id;

  const head = document.createElement("div");
  head.className = "card-head";

  const meta = document.createElement("div");
  meta.textContent = (msg.title ? msg.title + " · " : "") + relTime(msg.ts);

  const copy = document.createElement("button");
  copy.className = "copy";
  copy.title = "Copy clean text";
  copy.textContent = "⧉ Copy";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(msg.text);
      copy.textContent = "✓ Copied";
    } catch (e) {
      copy.textContent = "✗ Failed";
    }
    setTimeout(() => { copy.textContent = "⧉ Copy"; }, 1200);
  });

  const del = document.createElement("button");
  del.className = "del";
  del.title = "Delete this message";
  del.textContent = "🗑";
  del.addEventListener("click", () => postJSON("/delete", { id: msg.id }));

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(copy, del);

  head.append(meta, actions);

  const body = document.createElement("div");
  body.className = "body";
  body.innerHTML = renderMarkdown(msg.text);

  card.append(head, body);
  feed.append(card);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

let replaying = true;

function connect() {
  const es = new EventSource("/events");
  // On each (re)connect the server replays full history, so rebuild from scratch.
  es.onopen = () => {
    feed.innerHTML = "";
    if (empty) empty.style.display = "";
    // Stay silent while the replayed burst lands; chime only on later live messages.
    replaying = true;
    setTimeout(() => { replaying = false; }, 500);
  };
  es.addEventListener("message", (e) => {
    addCard(JSON.parse(e.data));
    if (soundOn && !replaying) chime();
  });
  es.addEventListener("delete", (e) => {
    const el = feed.querySelector(`[data-id="${JSON.parse(e.data).id}"]`);
    if (el) el.remove();
    showEmptyIfBare();
  });
  es.addEventListener("clear", () => {
    feed.innerHTML = "";
    if (empty) empty.style.display = "";
  });
  // EventSource auto-reconnects on error; no manual handling needed.
}

connect();
