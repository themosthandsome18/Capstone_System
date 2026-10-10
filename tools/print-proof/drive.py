"""Print the real built app through a real browser's own window.print().

    python tools/print-proof/drive.py BUILD_DIR SCENARIO PAPER NAME [noredraw]

SCENARIO  report | tabswitch | insights | all
          report     "Print report" once every chart has settled
          tabswitch  switch to the Origin tab and press "Print report" 50 ms after
                     its title changes, while the chart is still animating
          insights   "Print Key Insights"
          all        "Print all reports"
PAPER     a4 | letter
noredraw  makes the print-media listener a no-op, to compare page counts
          without the print-time chart redraw

The browser (Edge; set BROWSER to another Chromium executable to override) runs
with --kiosk-printing and "Save as PDF" preselected, in a throwaway profile, so
the app's own window.print() writes a PDF through the real print pipeline. The
app talks only to the local stand-in (stub_server.py), which replays
fixtures/responses.json. Chart animation is left on.

The one departure from the real pipeline: kiosk printing ignores the saved paper
size (Save as PDF falls back to the machine's default, Letter here), so PAPER is
applied with an injected test-only `@page { size: ... }`. The app's own @page
margins still apply.

Writes to out/: NAME.pdf, NAME.json (the print layout, recorded at the print-media
change), NAME.run.json (events, request log, recorded gaps).
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websocket

BUILD, SCENARIO, PAPER, NAME = sys.argv[1:5]
NOREDRAW = len(sys.argv) > 5 and sys.argv[5] == "noredraw"
HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "fixtures", "responses.json")
OUT = os.path.join(HERE, "out")
BROWSER = os.environ.get("BROWSER") or r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT, DEBUG = 8765, 9361
if not os.path.exists(FIXTURES):
    sys.exit("No fixtures: run gen_fixtures.py first (see README.md).")
RECORDER = open(os.path.join(HERE, "recorder.js"), encoding="utf-8").read()

os.makedirs(OUT, exist_ok=True)
profile = os.path.join(OUT, "profile_" + NAME)
downloads = os.path.join(OUT, "downloads_" + NAME)
log = os.path.join(OUT, NAME + ".requests.log")
for folder in (profile, downloads):
    shutil.rmtree(folder, ignore_errors=True)
os.makedirs(os.path.join(profile, "Default"))
os.makedirs(downloads)
if os.path.exists(log):
    os.remove(log)
app_state = {
    "version": 2,
    "recentDestinations": [{"id": "Save as PDF", "origin": "local", "account": ""}],
    "selectedDestinationId": "Save as PDF",
    "scaling": "100", "scalingType": 0,
    "isHeaderFooterEnabled": False, "isCssBackgroundEnabled": True, "marginsType": 0,
}
with open(os.path.join(profile, "Default", "Preferences"), "w") as handle:
    json.dump({"printing": {"print_preview_sticky_settings": {"appState": json.dumps(app_state)}},
               "savefile": {"default_directory": downloads},
               "download": {"default_directory": downloads, "prompt_for_download": False}}, handle)

server = subprocess.Popen([sys.executable, os.path.join(HERE, "stub_server.py"), BUILD, str(PORT), FIXTURES, log],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
browser = subprocess.Popen([BROWSER, "--kiosk-printing", "--no-first-run", "--no-default-browser-check",
                            "--user-data-dir=" + profile, f"--remote-debugging-port={DEBUG}",
                            f"--remote-allow-origins=http://127.0.0.1:{DEBUG}", "--window-size=1366,900", "about:blank"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
result = {"scenario": SCENARIO, "paper": PAPER, "redraw": not NOREDRAW}
try:
    for _ in range(80):
        try:
            target = next(t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{DEBUG}/json")) if t["type"] == "page")
            break
        except Exception:
            time.sleep(0.25)
    ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=60)
    sequence = [0]

    def call(method, **params):
        sequence[0] += 1
        ws.send(json.dumps({"id": sequence[0], "method": method, "params": params}))
        while True:
            message = json.loads(ws.recv())
            if message.get("id") == sequence[0]:
                return message.get("result", {})

    def js(expression):
        return call("Runtime.evaluate", expression=expression, returnByValue=True, awaitPromise=True)["result"].get("value")

    setup = RECORDER + """
      localStorage.setItem('capstone_auth_token', 'print-proof');
      window.__events = [];
      addEventListener('beforeprint', () => __events.push('beforeprint ' + performance.now().toFixed(0)));
      addEventListener('afterprint', () => __events.push('afterprint ' + performance.now().toFixed(0)));
      document.addEventListener('DOMContentLoaded', () => {
        // Test-only: kiosk printing ignores the paper setting (see the module docstring).
        const style = document.createElement('style'); style.textContent = '@page { size: %s; }'; document.head.appendChild(style);
      });
    """ % ("A4" if PAPER == "a4" else "letter")
    if NOREDRAW:
        setup += """
      const realMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (q) => { const m = realMatchMedia(q); if (/print/.test(q)) { m.addEventListener = () => {}; } return m; };
    """
    call("Page.enable")
    call("Page.addScriptToEvaluateOnNewDocument", source=setup)
    call("Page.navigate", url=f"http://127.0.0.1:{PORT}/analytics-reports")
    ready = """(() => { const h = document.querySelector('.report-chart-card h3'); const c = document.querySelector('.report-chart-card canvas');
                return !!(h && c && document.fonts.check('800 22px "Public Sans"') && document.fonts.check('400 14px "Public Sans"')
                          && document.querySelectorAll('.analytics-question-item canvas').length >= 8); })()"""
    for _ in range(200):
        if js(ready):
            break
        time.sleep(0.1)
    else:
        raise SystemExit("The app did not finish loading: " + str(js("document.body.innerText.slice(0, 300)")))
    time.sleep(2.5)  # every chart on the page has finished its opening animation
    js("window.__addLateRecorder && window.__addLateRecorder()")
    click = "(name) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === name).click()"
    if SCENARIO == "report":
        js(f"({click})('Print report')")
    elif SCENARIO == "insights":
        js(f"({click})('Print Key Insights')")
    elif SCENARIO == "all":
        js(f"({click})('Print all reports')")
    elif SCENARIO == "tabswitch":
        js("""new Promise((done) => {
            const click = %s;
            const title = document.querySelector('.report-chart-card h3');
            const observer = new MutationObserver(() => {
              if (title.textContent === 'Visitor Origin Report') {
                observer.disconnect();
                setTimeout(() => { window.__printedAt = performance.now(); click('Print report'); done(true); }, 50);
              }
            });
            observer.observe(title, { childList: true, characterData: true, subtree: true });
            window.__tabAt = performance.now(); click('Origin Report');
          })""" % click)
        result["tab_to_print_ms"] = js("Math.round(window.__printedAt - window.__tabAt)")
    else:
        raise SystemExit(f"Unknown scenario {SCENARIO}")
    pdf = None
    for _ in range(90):
        time.sleep(0.5)
        written = [f for f in glob.glob(os.path.join(downloads, "*.pdf")) if os.path.getsize(f) > 0]
        if written:
            time.sleep(1.5)
            pdf = written[0]
            break
    result["events"] = js("window.__events")
    printed, layout = js("window.__print"), js("window.__layout")
    result["printed_gaps"] = js("window.__printedGaps")
    if printed and layout:
        with open(os.path.join(OUT, NAME + ".json"), "w") as handle:
            json.dump({"cards": printed["cards"], "headingCssWidth": printed["headingCssWidth"], "layout": layout}, handle, indent=1)
    result["print_scope_after"] = js("document.querySelector('.reports-page').dataset.printScope || null")
    result["all_block_after"] = js("!!document.querySelector('.report-print-all')")
    result["alert"] = js("(document.querySelector('[role=alert]') || {}).textContent || null")
    ws.close()
    if pdf:
        shutil.copy(pdf, os.path.join(OUT, NAME + ".pdf"))
    result["pdf"] = NAME + ".pdf" if pdf else None
finally:
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(browser.pid)], capture_output=True)
    server.terminate()
    time.sleep(1.0)
    shutil.rmtree(profile, ignore_errors=True)
    shutil.rmtree(downloads, ignore_errors=True)
result["requests"] = [line.split(" ", 1)[1].strip() for line in open(log)] if os.path.exists(log) else []
with open(os.path.join(OUT, NAME + ".run.json"), "w") as handle:
    json.dump(result, handle, indent=1)
print(json.dumps({k: v for k, v in result.items() if k not in ("requests", "printed_gaps")}), "| api requests:", len(result["requests"]))
