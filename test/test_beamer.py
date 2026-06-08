import json, os, subprocess, sys, threading, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = "4099"
BASE = f"http://127.0.0.1:{PORT}"


def post(path, obj):
    data = json.dumps(obj).encode()
    req = urllib.request.Request(
        BASE + path, data=data,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())


def read_events(n, timeout=3):
    """Connect to /events and parse the first n SSE (event, data) pairs."""
    req = urllib.request.Request(BASE + "/events")
    out, event = [], None
    with urllib.request.urlopen(req, timeout=timeout) as r:
        while len(out) < n:
            line = r.readline().decode().rstrip("\n")
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                out.append((event, json.loads(line.split(":", 1)[1].strip())))
                event = None
    return out


def wait_up(timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(BASE + "/", timeout=0.5)
            return True
        except Exception:
            time.sleep(0.1)
    return False


def cli_test():
    """bin/beamer send auto-starts the server and delivers the message."""
    env = dict(os.environ, BEAMER_PORT=PORT)
    subprocess.run([str(ROOT / "bin" / "beamer"), "stop"], env=env)
    time.sleep(0.5)
    p = subprocess.run(
        [str(ROOT / "bin" / "beamer"), "send", "--title", "FromCLI"],
        input="piped **markdown**\nsecond line\n",
        text=True, env=env, capture_output=True)
    assert p.returncode == 0, p.stderr
    assert wait_up(), "helper did not start server"
    evs = read_events(1)
    assert evs[0][1]["text"] == "piped **markdown**\nsecond line\n", evs
    assert evs[0][1]["title"] == "FromCLI", evs
    subprocess.run([str(ROOT / "bin" / "beamer"), "stop"], env=env)


def main():
    env = dict(os.environ, BEAMER_PORT=PORT)
    proc = subprocess.Popen([sys.executable, str(ROOT / "beamer.py")], env=env)
    try:
        assert wait_up(), "server did not start"

        # the page and its assets are served
        with urllib.request.urlopen(BASE + "/", timeout=2) as r:
            home = r.read().decode()
        assert "<title>Beamer</title>" in home, "index not served"
        for asset in ("/app.js", "/styles.css", "/md.js"):
            with urllib.request.urlopen(BASE + asset, timeout=2) as r:
                assert r.status == 200, asset

        # send + history replay
        res = post("/send", {"text": "hello **world**", "title": "Greeting"})
        assert res["ok"] and res["id"] == 1, res
        evs = read_events(1)
        assert evs[0][0] == "message", evs
        assert evs[0][1]["text"] == "hello **world**", evs
        assert evs[0][1]["title"] == "Greeting", evs

        # clear empties history and emits a clear event
        post("/clear", {})
        results = []
        t = threading.Thread(target=lambda: results.extend(read_events(1)))
        t.start()
        time.sleep(0.3)  # let the reader subscribe (empty history -> no replay)
        post("/send", {"text": "live msg"})  # live push, id continues at 2
        t.join(timeout=3)
        assert results and results[0][1]["text"] == "live msg", results
        assert results[0][1]["id"] == 2, results

        # bad request: missing text -> 400
        try:
            post("/send", {"title": "no text"})
            assert False, "expected HTTP 400"
        except urllib.error.HTTPError as e:
            assert e.code == 400, e.code
    finally:
        proc.terminate()
        proc.wait(timeout=3)

    cli_test()
    print("ALL TESTS PASSED")


if __name__ == "__main__":
    main()
