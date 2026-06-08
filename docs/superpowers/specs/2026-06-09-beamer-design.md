# Beamer — Design Spec

Date: 2026-06-09
Status: Approved

## Purpose

Beamer gives Claude Code a second screen. While Claude works in a terminal on one
monitor, it can broadcast clean, readable content (explanations, summaries,
copy-ready snippets) to a browser tab on a second monitor. The flow is one-way.
Claude pushes, the browser displays. No reply channel.

This replaces the current habit of dumping text into the inbox when the real
intent is "show me this on my other screen so I can read it or copy it cleanly."

## Goals

- Claude can send Markdown text and it appears live in a browser tab within a second.
- Every message renders as a card in a scrolling feed, newest at the bottom, auto-scrolled into view.
- Every card has a copy icon that copies the original clean text in its entirety, with no terminal whitespace or escape junk.
- Zero external dependencies. Runs from a single `python3` file already present on macOS.
- It just works. Claude auto-starts the server when needed; the user opens one browser tab.

## Non-Goals

- No two-way chat. The browser never sends back to Claude.
- No disk persistence of history. History lives in memory and is replayed on reload, cleared on server restart.
- No authentication, no network exposure. Localhost only.
- No multi-room or multi-user support. One feed.

## Architecture

Three parts, all living in this repo so it can be published as a standalone open-source skill.

```
beamer/
  beamer.py            # the server (Python stdlib only)
  bin/beamer           # CLI helper Claude calls (ensures server up, then sends)
  web/
    index.html         # the second-screen page
    app.js             # SSE client + card rendering + copy
    marked.min.js      # vendored Markdown renderer (no network needed)
    styles.css         # dark, large-type, calm layout
  skills/beamer/
    SKILL.md           # tells Claude when and how to beam
  test/
    test_beamer.sh     # boots server, posts, reads /events to confirm broadcast
  README.md
```

### 1. Server — `beamer.py`

A single file using only the Python standard library (`http.server`, `json`,
`threading`). It holds an in-memory list of messages and a set of connected SSE
clients.

Endpoints:

- `GET /` serves `web/index.html`.
- `GET /<static>` serves files under `web/` (app.js, styles.css, marked.min.js).
- `GET /events` opens a Server-Sent Events stream. On connect it replays the full
  in-memory history as a sequence of events, then streams each new message as it arrives.
- `POST /send` accepts a JSON body `{ "text": "...", "title": "..."?  }`. It appends
  a message record `{ id, ts, title, text }` to history and pushes it to every
  connected SSE client. Returns `{ "ok": true, "id": N }`.
- `POST /clear` empties the history and notifies clients to clear their feed.

Config:

- Port defaults to `4040`, overridable with `BEAMER_PORT`.
- Binds to `127.0.0.1` only.
- On start, writes a pidfile and a log file under a temp location (for example
  `$TMPDIR/beamer/`) so `bin/beamer` can detect a running instance and stop it.

Concurrency: a lock guards the history list and client set. SSE writes that fail
(disconnected browser) drop that client quietly.

### 2. Page — `web/`

A dark, large-type layout suited to a second monitor read from across the desk.

- `app.js` opens an `EventSource` to `/events`. For each message event it renders
  a card and auto-scrolls to the bottom. It auto-reconnects if the stream drops
  (server restart), and on reconnect the server replays history so the feed
  rebuilds itself.
- Each card shows: optional title, a relative timestamp, the Markdown body rendered
  via `marked.min.js`, and a copy icon button.
- The copy button copies the message's original raw text (the exact `text` field,
  not the rendered HTML), giving clean paste with no terminal artifacts. A brief
  "copied" confirmation flashes on the button.
- A `clear` event empties the feed.

`marked.min.js` is vendored into the repo so the page needs no network access.

### 3. Skill — `skills/beamer/SKILL.md`

Describes to Claude when to beam (the user says "send to beamer", "beam this",
"put this on the beamer", or sets up a learning task asking for explanations on
the second screen) and how: call `bin/beamer send` with the content piped on
stdin and an optional `--title`.

### 4. CLI helper — `bin/beamer`

A small script (Python or bash) with subcommands:

- `beamer send [--title T]` reads the message body from stdin, ensures the server
  is running (auto-starting it detached if not, then waiting briefly until the
  port answers), and POSTs to `/send`. Reading from stdin keeps multi-line
  Markdown intact and avoids shell-quoting damage.
- `beamer open` prints the URL and opens it in the default browser.
- `beamer clear` POSTs to `/clear`.
- `beamer stop` reads the pidfile and stops the server.

## Data Flow

1. User tells Claude to beam something.
2. Claude runs `bin/beamer send --title "..."` and pipes the Markdown on stdin.
3. `bin/beamer` checks the port. If nothing answers, it launches `python3 beamer.py`
   detached and waits until the port responds.
4. `bin/beamer` POSTs `{ text, title }` to `/send`.
5. The server appends the message and pushes it to all connected browsers over SSE.
6. The browser renders a new card at the bottom and scrolls to it.
7. The user reads it, or clicks copy to grab the clean text.

## Error Handling

- Server not reachable after auto-start window: `bin/beamer` exits non-zero and
  prints the manual start command and log path.
- Browser disconnected during a send: the server drops that SSE client silently;
  no error surfaces to Claude.
- Browser reconnect: `EventSource` retries automatically; the server replays
  history so no message is lost across a reload or restart.
- Malformed POST body: server returns HTTP 400 with a short JSON error.
- Port already in use by something else: server exits with a clear message naming
  the port and the `BEAMER_PORT` override.

## Testing

- `test/test_beamer.sh` starts the server on a test port, POSTs a message, opens
  `/events`, and asserts the message is broadcast (history replay path). It also
  posts a second message and asserts live delivery, then `/clear` and asserts the
  clear event. Tears down the server at the end.
- One-time manual check: open the page in a browser, beam a Markdown sample, confirm
  rendering, auto-scroll, reconnect-on-restart, and that the copy button yields clean text.

## Open Questions

None. Display mode, rendering, runtime, lifecycle, scroll direction, and network
scope are all decided.
