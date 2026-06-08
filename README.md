# Beamer

A zero-dependency second screen for Claude Code. Claude broadcasts Markdown to a
browser tab on your other monitor: explanations, summaries, and clean copy-ready
text, rendered live with a Copy button on every message.

## Requirements
Python 3 (standard library only). No pip installs, no network access.

## Use
1. Open the page (auto-starts the server):

       ./bin/beamer open

2. Beam something:

       printf '# Hello\n\nThis is **live**.' | ./bin/beamer send --title "Demo"

3. Other commands: `./bin/beamer clear`, `./bin/beamer stop`.

The server listens on http://127.0.0.1:4040 (localhost only). Override the port
with `BEAMER_PORT`. History lives in memory and is replayed when the page
reconnects; restarting the server clears it.

## Install the skill (Claude Code)
Symlink the skill so Claude can discover it:

    ln -s "$(pwd)/skills/beamer" ~/.claude/skills/beamer

Then tell Claude things like "beam me a plain-English explanation of X" or
"send that summary to the beamer."

## Test

    python3 test/test_beamer.py
