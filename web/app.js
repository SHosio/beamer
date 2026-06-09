const feed = document.getElementById("feed");
const empty = document.getElementById("empty");
const soundBtn = document.getElementById("sound");
const wipeBtn = document.getElementById("wipe");
const effectSel = document.getElementById("effect");

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

// Sound preferences persist across reloads; sound defaults on, effect to "chime".
let soundOn = localStorage.getItem("beamer-sound") !== "off";
let effect = localStorage.getItem("beamer-effect") || "chime";
let audioCtx = null;

function ctx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// One enveloped oscillator: the building block for every effect.
function tone(c, freq, start, dur, type = "sine", peak = 0.18) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.03);
  return osc;
}

// All effects are synthesized, no audio files. Each takes (context, startTime).
const EFFECTS = {
  Chime(c, t) { tone(c, 660, t, 0.25); tone(c, 880, t + 0.09, 0.25); },
  Blip(c, t) { tone(c, 880, t, 0.12, "triangle", 0.2); },
  Marimba(c, t) { tone(c, 523.25, t, 0.18, "sine", 0.22); tone(c, 783.99, t + 0.06, 0.22); },
  Coin(c, t) { tone(c, 987.77, t, 0.07, "square", 0.12); tone(c, 1318.51, t + 0.07, 0.20, "square", 0.12); },
  Pop(c, t) { tone(c, 440, t, 0.12, "sine", 0.22).frequency.exponentialRampToValueAtTime(160, t + 0.12); },
  Knock(c, t) { tone(c, 180, t, 0.12, "triangle", 0.3); tone(c, 120, t + 0.05, 0.14, "triangle", 0.25); },
  Airhorn(c, t) {
    // Two bold sawtooth blasts, a stacked chord for that "look up now" punch.
    [0, 0.34].forEach((off) => {
      const s = t + off;
      tone(c, 233.08, s, 0.3, "sawtooth", 0.26);
      tone(c, 311.13, s, 0.3, "sawtooth", 0.22);
      tone(c, 466.16, s, 0.3, "sawtooth", 0.16);
    });
  },
  Beam(c, t) {
    // "Energize" transporter shimmer: a long rising sweep with a sparkly cascade.
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(147, t);
    osc.frequency.exponentialRampToValueAtTime(1976, t + 1.3);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
    gain.gain.setValueAtTime(0.16, t + 1.0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 1.65);
    [660, 880, 1100, 1320, 1760, 2093].forEach((f, i) =>
      tone(c, f, t + 0.15 + i * 0.14, 0.32, "triangle", 0.07));
  },
};

function playEffect() {
  try {
    const c = ctx();
    (EFFECTS[effect] || EFFECTS.Chime)(c, c.currentTime);
  } catch (e) {
    // Audio unavailable; ignore.
  }
}

function renderSoundBtn() {
  soundBtn.textContent = soundOn ? "🔔" : "🔕";
  soundBtn.title = soundOn ? "Sound on" : "Sound off";
}

Object.keys(EFFECTS).forEach((name) => {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  effectSel.append(opt);
});
if (!EFFECTS[effect]) effect = "Chime";
effectSel.value = effect;

effectSel.addEventListener("change", () => {
  effect = effectSel.value;
  localStorage.setItem("beamer-effect", effect);
  playEffect();  // preview the chosen sound
});

renderSoundBtn();
soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  localStorage.setItem("beamer-sound", soundOn ? "on" : "off");
  renderSoundBtn();
  if (soundOn) playEffect();  // confirms the choice and unlocks audio for later
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
    if (soundOn && !replaying) playEffect();
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
