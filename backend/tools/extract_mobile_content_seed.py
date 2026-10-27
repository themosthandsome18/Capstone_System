"""Take the mobile app's written content OUT OF THE DART SOURCE, string by string,
into the seed file of migration 0061 (api/migrations/seed_data/mobile_content_0061.json).

Nothing is typed by hand: every text in the file is a string literal matched in
mobile/lib/models/app_content_defaults.dart, where the texts of the app were MOVED out of
the screens (Commits 9b and 9c; the screen, tourism_screens.dart, now reads them from there
and is looked at only for the order in which the Home builds the guides and the notices).
If the Dart has a shape this script does not expect, it stops with an error instead of
guessing.

    python backend/tools/extract_mobile_content_seed.py          # writes the file
    python backend/tools/extract_mobile_content_seed.py --check  # only compares

What it changes on the way (and only this):
* the greeting: it is stored as 'Mabuhay, {name}! ...' (the defaults file already writes it
  so; the screen puts in the visitor's name, or the Explorer for a guest);
* in the PORT GUIDE only: the two amounts become {fee_regular} and
  {fee_discounted}. The real amounts are filled in by the server later, from the
  one constant the reports use; they are not stored here;
* EVERYWHERE the place of the Tourism Office is written (the Boat Guide tile, the
  Environmental Fee tile and the port guide) it becomes {fee_office}, and the one
  block `fee_office` holds the place. One source: the script stops unless it finds
  exactly three of them and no "2nd Floor" is left outside that block;
* the leading "• " of each port guide line is dropped (the server sends the lines without it;
  the app draws it).
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DART = os.path.join(ROOT, "mobile", "lib", "screens", "tourism_screens.dart")
DEFAULTS = os.path.join(ROOT, "mobile", "lib", "models", "app_content_defaults.dart")
OUT = os.path.join(ROOT, "backend", "api", "migrations", "seed_data", "mobile_content_0061.json")

LIT = r"'((?:[^'\\\n]|\\.)*)'"  # one single-quoted Dart string literal on one line

# Dart icon -> the NAME stored (the app and the web draw the picture and colour of a name).
ICONS = {
    "beach_access": "beach",
    "workspace_premium": "craft",
    "water_drop": "waterfall",
    "restaurant_menu": "food",
    "directions_boat_outlined": "boat",
    "festival_outlined": "festival",
    "receipt_long_outlined": "receipt",
    "delete_outline": "waste",
    "event_available_outlined": "event",
    "eco_outlined": "eco",
}


def fail(message):
    sys.exit(f"extract_mobile_content_seed: {message}")


def unescape(raw):
    """A Dart literal's text. Refuses anything it would have to interpret."""
    if "$" in raw:
        fail(f"a literal with an interpolation or $ sign: {raw[:60]!r}")
    if "\\" in raw:
        fail(f"a literal with an escape sequence: {raw[:60]!r}")
    return raw


def region(src, start_marker, end_marker):
    a = src.find(start_marker)
    if a < 0:
        fail(f"cannot find {start_marker!r} in the Dart file")
    b = src.find(end_marker, a + len(start_marker))
    if b < 0:
        fail(f"cannot find {end_marker!r} after {start_marker!r}")
    return src[a:b]


def texts(chunk):
    return [unescape(m) for m in re.findall(r"Text\(\s*" + LIT, chunk)]


def build(src, defaults):
    """`src` is tourism_screens.dart; `defaults` is app_content_defaults.dart (the Welcome and the Why Visit)."""

    def constant(name):
        found = re.search(r"static const " + name + r" = " + LIT + ";", defaults)
        if not found:
            fail(f"cannot find {name} in app_content_defaults.dart")
        return unescape(found.group(1))

    # -- the welcome banner (the defaults file) -----------------------------------
    title = constant("welcomeTitle")
    if title.count("{name}") != 1:
        fail("the greeting no longer has exactly one {name}")
    welcome = {"key": "welcome", "title": title, "subtitle": constant("welcomeSubtitle"), "body": ""}

    def default_items(const_name):
        """(icon name, title, short text, style) of every AppContentItem in one list of the defaults file."""
        chunk = region(defaults, f"static const {const_name} = <AppContentItem>[", "\n  ];")
        found = re.findall(
            r"AppContentItem\(\s*id: -\d+,\s*icon: " + LIT + r",\s*title: " + LIT + r",\s*shortText: " + LIT
            + r",\s*(?:style: AppContentStyle\.(banner),\s*)?\),",
            chunk,
        )
        if len(found) != chunk.count("AppContentItem("):
            fail(f"an AppContentItem in {const_name} has a shape this script does not expect")
        out = []
        for name, title, short, banner in found:
            if name not in ICONS.values():
                fail(f"an item with an icon name that is not stored: {name}")
            out.append((name, unescape(title), unescape(short), "banner" if banner else "tile"))
        return out

    # -- Why Visit: introduction and the four pillars (the defaults file) -----------
    why = {"key": "why_visit", "title": constant("whyVisitTitle"), "subtitle": constant("whyVisitSubtitle"),
           "body": constant("whyVisitBody")}
    pillars = default_items("whyVisitItems")
    if len(pillars) != 4 or any(style != "tile" for _n, _t, _s, style in pillars):
        fail(f"{len(pillars)} pillars found, expected 4 tiles")

    # -- the travel guide: heading, four guides (tiles), two notices (banners) (the defaults file) ---
    travel_guide = {"key": "travel_guide", "title": constant("travelGuideTitle"), "subtitle": "", "body": ""}
    guide_items = default_items("travelGuideItems")
    guides = [item for item in guide_items if item[3] == "tile"]
    banners = [item for item in guide_items if item[3] == "banner"]
    if len(guides) != 4:
        fail(f"{len(guides)} guides found, expected 4")
    if len(banners) != 2:
        fail(f"{len(banners)} notices found, expected 2")
    # In the list the guides come BEFORE the notices: that is the order of the list.
    if guide_items != guides + banners:
        fail("the notices are no longer below the guides in the list")
    # In the Home page the guides are built BEFORE the notices (the screen, which reads the list).
    if not 0 <= src.find("_MaubanTownGuideSection(") < src.find("InfoBanner("):
        fail("the notices are no longer below the guides in the Home page")

    # -- the port guide (the defaults file) -----------------------------------------------
    port_chunk = region(defaults, "static const portGuideBullets = <String>[", "\n  ];")
    bullets_all = [unescape(m) for m in re.findall(LIT, port_chunk)]
    if len(bullets_all) != 4 or not all(t.startswith("• ") for t in bullets_all):
        fail("the port guide is no longer four '• ' lines")
    bullets = [t[2:] for t in bullets_all]
    office = re.search(r"Pay at the (Tourism Office, 2nd Floor, Mauban Municipal Hall)\.", bullets[2])
    if not office:
        fail("cannot find the place of the Tourism Office in the fee line")
    office = office.group(1)
    fee_line = bullets[2]
    if fee_line.count("₱80") != 1 or fee_line.count("₱64") != 1:
        fail("the fee line no longer has exactly one ₱80 and one ₱64")
    templated = []
    for line in bullets:
        line = line.replace("₱80", "{fee_regular}").replace("₱64", "{fee_discounted}")
        templated.append(line)
    if any(re.search(r"₱\s?\d", line) for line in templated):
        fail("an amount of money is left in the port guide")
    port = {"key": "port_guide", "title": constant("portGuideTitle"), "subtitle": "", "body": "\n".join(templated)}
    fee_office = {"key": "fee_office", "title": "", "subtitle": "", "body": office}

    # -- the items ---------------------------------------------------------------------
    items = []
    for n, (ic, title, sub, _style) in enumerate(pillars, start=1):
        items.append(dict(section="why_visit", icon=ic, title=title, short_text=sub,
                          full_text="", style="tile", display_order=n * 10, is_active=True))
    for n, (ic, title, desc, style) in enumerate(guide_items, start=1):
        items.append(dict(section="travel_guide", icon=ic, title=title, short_text=desc,
                          full_text="", style=style, display_order=n * 10, is_active=True))

    blocks = [welcome, why, travel_guide, port, fee_office]

    # The place of the Tourism Office has ONE source: the block `fee_office`. Every
    # other text that names it says {fee_office} instead.
    found = 0
    for row in items + [b for b in blocks if b["key"] != "fee_office"]:
        for field in ("title", "subtitle", "short_text", "body"):
            if field in row:
                found += row[field].count(office)
                row[field] = row[field].replace(office, "{fee_office}")
    if found != 3:
        fail(f"the place of the Tourism Office is written {found} times, expected 3")
    for row in items + blocks:
        if row.get("key") == "fee_office":
            continue
        if any("2nd Floor" in str(value) for value in row.values()):
            fail("a text still has the place of the Tourism Office written out")

    return {
        "source": "mobile/lib/screens/tourism_screens.dart",
        "blocks": blocks,
        "items": items,
    }


def main():
    src = open(DART, encoding="utf-8", newline="").read().replace("\r\n", "\n")
    defaults = open(DEFAULTS, encoding="utf-8", newline="").read().replace("\r\n", "\n")
    data = build(src, defaults)
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if "--check" in sys.argv:
        # (a checkout on Windows may turn the line endings into CRLF: the text is what counts)
        current = None
        if os.path.exists(OUT):
            current = open(OUT, encoding="utf-8", newline="").read().replace("\r\n", "\n")
        print("seed file matches the Dart source:", current == text)
        sys.exit(0 if current == text else 1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as handle:
        handle.write(text)
    print(f"wrote {OUT}: {len(data['items'])} items, {len(data['blocks'])} blocks, "
          f"sha256 {hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]}")


if __name__ == "__main__":
    main()
