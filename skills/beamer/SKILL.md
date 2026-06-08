---
name: beamer
description: Use when the user says "beam this", "send to beamer", "put this on the beamer", "show on my second screen", or sets up a task asking for explanations or clean copy-ready text on a second screen. Broadcasts Markdown to a live local browser tab.
---

# Beamer

Broadcast Markdown to the user's second-screen browser tab. One-way: you push, they read and copy. Use it instead of dumping text into the inbox when the intent is "show me this on my other screen."

## When to use
- The user says "beam this", "send to beamer", "put it on the beamer", "show on second screen".
- The user sets up a learning or work task and asks for explanations, summaries, definitions, or clean copy-ready snippets on their second screen while you keep working in the terminal.

## How to send
Pipe the content on stdin to the helper. Use `--title` for a short heading. The helper auto-starts the server if it is not already running.

Single line:

    printf '%s' "Your **markdown** here" | /Users/simohosio/Code/open-source/beamer/bin/beamer send --title "Topic"

Multi-line (preferred for explanations):

    /Users/simohosio/Code/open-source/beamer/bin/beamer send --title "Closures" <<'EOF'
    A **closure** is a function bundled with its surrounding state.

    - it captures variables from the enclosing scope
    - the captured state outlives the original call
    EOF

Open the page once (also auto-starts the server):

    /Users/simohosio/Code/open-source/beamer/bin/beamer open

Clear the feed:

    /Users/simohosio/Code/open-source/beamer/bin/beamer clear

## Notes
- `send` auto-opens a browser tab when none is connected, so the user sees the message even if they have no tab open. Once a tab is connected it will not open more.
- Markdown is rendered: headings, bold, italic, inline code, fenced code blocks, lists, links.
- Every message gets a Copy button on the page for clean paste.
- Prefer several focused messages over one giant blob when teaching.
- Default URL is http://127.0.0.1:4040 (override with the BEAMER_PORT env var).
