const feed = document.getElementById("feed");
const empty = document.getElementById("empty");

function relTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString();
}

function addCard(msg) {
  if (empty) empty.style.display = "none";

  const card = document.createElement("div");
  card.className = "card";

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

  head.append(meta, copy);

  const body = document.createElement("div");
  body.className = "body";
  body.innerHTML = renderMarkdown(msg.text);

  card.append(head, body);
  feed.append(card);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

function connect() {
  const es = new EventSource("/events");
  // On each (re)connect the server replays full history, so rebuild from scratch.
  es.onopen = () => {
    feed.innerHTML = "";
    if (empty) empty.style.display = "";
  };
  es.addEventListener("message", (e) => addCard(JSON.parse(e.data)));
  es.addEventListener("clear", () => {
    feed.innerHTML = "";
    if (empty) empty.style.display = "";
  });
  // EventSource auto-reconnects on error; no manual handling needed.
}

connect();
