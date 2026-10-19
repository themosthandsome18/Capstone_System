"""Is `appContent` in the public tourism bootstrap, and is it right? GET only: no login, no database, nothing written.

A PART OF THE STANDING LIVE MEASUREMENT, not a one-off for Commit 3. Run it with the other figures every time the live
system is measured:

    python backend/tools/check_live_appcontent.py                      # asks the live backend
    python backend/tools/check_live_appcontent.py --before FILE        # FILE = the bootstrap saved BEFORE a deploy
    python backend/tools/check_live_appcontent.py --url URL            # another server

Why it exists: the server builds appContent inside a try/except on purpose, so that a bug in it can never take the
destinations away from every installed app. The price is that a failure there is SILENT for the user: the bootstrap
still answers 200, just without the key (the app then shows the texts written in its own code). This check, and the
ERROR line APPCONTENT_FAILED in the Render logs, are how we notice. If the key is ever missing from live, this exits
with 1 and says FAIL.

It exits 0 only if every check is OK.
"""
import hashlib
import json
import sys
import urllib.request

LIVE = "https://capstone-backend-stzr.onrender.com/api/mobile/tourism/bootstrap/"
MARK = b',"appContent":'
OLD_KEYS = ["referenceTables", "destinations", "featuredDestinations", "barangays", "notifications", "theme", "emergencyContacts"]
BLOCKS = {"welcome": ["title", "subtitle"], "why_visit": ["title", "subtitle", "body"], "travel_guide": ["title"], "port_guide": ["title", "body"]}
ITEM_KEYS = ["id", "icon", "title", "short_text", "full_text", "style", "tappable"]
CANARY_BYTES = 60 * 1024  # the same canary as the backend test (SIZE_CANARY_BYTES); a surprise, not a limit
# What of the OLD bytes can move with nobody deploying anything: a resort's monthly_arrivals is the number of ARRIVED records of THIS
# calendar month, so it changes when the month turns (1 November) and whenever a record of the month is checked in. It is in
# destinations, featuredDestinations and referenceTables.resorts, and it decides which destination is on top, so also the order of
# those lists and the "is trending" line of notifications (and an advisory that expires drops out). Nothing else moves by itself.
MOVES_WITH_THE_CALENDAR = {"destinations", "featuredDestinations", "notifications", "referenceTables.resorts"}


def _moved(data, saved):
    keys = []
    for key in OLD_KEYS:
        if key == "referenceTables" and isinstance(data.get(key), dict) and isinstance(saved.get(key), dict):
            for sub in sorted(set(data[key]) | set(saved[key])):
                if data[key].get(sub) != saved[key].get(sub):
                    keys.append(f"referenceTables.{sub}")
        elif data.get(key) != saved.get(key):
            keys.append(key)
    return keys


def _texts(content):
    for key, block in (content.get("blocks") or {}).items():
        for field, text in (block or {}).items():
            yield f"blocks.{key}.{field}", text
    for section, rows in (content.get("sections") or {}).items():
        for row in rows or []:
            for field in ("title", "short_text", "full_text"):
                yield f"sections.{section}[{row.get('id')}].{field}", row.get(field)


def check(body, before=None):
    """-> [(name, ok, detail)] for the bytes of one bootstrap answer. `before` = the bytes of the answer saved earlier."""
    out = []

    def add(name, ok, detail=""):
        out.append((name, bool(ok), detail))

    try:
        data = json.loads(body)
    except ValueError:
        add("the answer is a JSON object", False, "it is not JSON")
        return out
    add("the answer is a JSON object", isinstance(data, dict))
    if not isinstance(data, dict):
        return out
    keys = list(data)
    add("the seven old keys are all there, in their places", keys[: len(OLD_KEYS)] == OLD_KEYS, str(keys))
    present = "appContent" in data
    add("appContent IS in the bootstrap", present, "MISSING: look for APPCONTENT_FAILED in the Render logs" if not present else "")
    if not present:
        return out
    add("appContent is the LAST key", keys[-1] == "appContent")
    add("appContent appears once in the bytes", body.count(MARK) == 1)
    content = data["appContent"]
    add("appContent has exactly blocks and sections", isinstance(content, dict) and list(content) == ["blocks", "sections"])
    if not (isinstance(content, dict) and list(content) == ["blocks", "sections"]):
        return out
    blocks, sections = content["blocks"], content["sections"]
    add("blocks: only the four the app shows, each with its fields", isinstance(blocks, dict) and {k: list(v) for k, v in blocks.items()} == BLOCKS,
        "a block missing means it was left out (a fee placeholder could not be filled in, or the row is gone): check the logs"
        if isinstance(blocks, dict) and set(blocks) != set(BLOCKS) else "")
    add("sections: why_visit and travel_guide, both lists", isinstance(sections, dict) and list(sections) == ["why_visit", "travel_guide"]
        and all(isinstance(v, list) for v in sections.values()))
    rows = [row for v in (sections.values() if isinstance(sections, dict) else []) if isinstance(v, list) for row in v]
    add("every item has exactly the seven fields", all(isinstance(r, dict) and list(r) == ITEM_KEYS for r in rows))
    add("tappable agrees with the full text", all(isinstance(r, dict) and r.get("tappable") == bool(str(r.get("full_text", "")).strip()) for r in rows))
    texts = [(n, t) for n, t in _texts(content) if isinstance(t, str)]
    add("no {fee_...} placeholder is left in any text", not any("{fee_" in t for _, t in texts), str([n for n, t in texts if "{fee_" in t][:3]))
    leftover = [n for n, t in texts if ("{" in t.replace("{name}", "") or "}" in t.replace("{name}", ""))]
    add("no brace is left in any text, except {name}", not leftover, str(leftover[:3]))
    add("{name} appears only in the welcome banner", all(n.startswith("blocks.welcome.") for n, t in texts if "{name}" in t))
    value = body[body.index(MARK) + len(MARK): -1] if MARK in body and body.endswith(b"}") else b""
    add(f"appContent is under the canary ({CANARY_BYTES} bytes)", 0 < len(value) < CANARY_BYTES, f"{len(value)} bytes")
    if before is not None:
        add("everything before appContent is byte for byte the saved bootstrap",
            body[: body.index(MARK)] + b"}" == before if MARK in body else False,
            f"{len(before)} bytes saved before")
        add("prefix and suffix: not one byte moved", body == before[:-1] + MARK + value + b"}")
        try:
            moved = _moved(data, json.loads(before))
        except ValueError:
            moved = ["(the saved file is not JSON)"]
        add("INFO old keys that differ from the saved bootstrap", True, str(moved) if moved else "none")
        add("only keys that move with the calendar differ (monthly arrivals, the trending line)", set(moved) <= MOVES_WITH_THE_CALENDAR,
            f"unexpected: {sorted(set(moved) - MOVES_WITH_THE_CALENDAR)}; an admin edit, or a real problem" if not set(moved) <= MOVES_WITH_THE_CALENDAR else "")
    add("INFO", True, f"whole bootstrap {len(body)} bytes sha256 {hashlib.sha256(body).hexdigest()}; "
                      f"appContent {len(value)} bytes sha256 {hashlib.sha256(value).hexdigest()}")
    return out


def main(argv):
    url, before = LIVE, None
    args = list(argv)
    while args:
        flag = args.pop(0)
        if flag == "--url":
            url = args.pop(0)
        elif flag == "--before":
            before = open(args.pop(0), "rb").read()
        else:
            print(__doc__)
            return 2
    body = urllib.request.urlopen(url, timeout=120).read()
    results = check(body, before)
    for name, ok, detail in results:
        print(("OK   " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
    failed = [name for name, ok, _ in results if not ok]
    print("\nALL OK" if not failed else f"\n{len(failed)} FAILED: {failed}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
