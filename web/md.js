// Minimal, dependency-free Markdown -> HTML. Covers the common teaching subset:
// headings, bold, italic, inline code, fenced code blocks, lists, links.
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(s) {
  s = escapeHtml(s);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
                '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function renderMarkdown(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let html = "", inCode = false, code = [], listType = null, listBuf = [];

  function flushList() {
    if (!listType) return;
    html += `<${listType}>` +
      listBuf.map((li) => `<li>${renderInline(li)}</li>`).join("") +
      `</${listType}>`;
    listType = null; listBuf = [];
  }

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) {
        html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
        inCode = false; code = [];
      } else { flushList(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(line); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushList(); html += `<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>`; continue; }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul) { if (listType !== "ul") { flushList(); listType = "ul"; } listBuf.push(ul[1]); continue; }
    if (ol) { if (listType !== "ol") { flushList(); listType = "ol"; } listBuf.push(ol[1]); continue; }

    if (line.trim() === "") { flushList(); continue; }
    flushList();
    html += `<p>${renderInline(line)}</p>`;
  }
  if (inCode) html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
  flushList();
  return html;
}
