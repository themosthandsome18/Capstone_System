"""Take the mobile app's written content OUT OF THE DART SOURCE, string by string,
into the seed file of migration 0061 (api/migrations/seed_data/mobile_content_0061.json).

Nothing is typed by hand: every text in the file is a string literal matched in
mobile/lib/screens/tourism_screens.dart. If the Dart has a shape this script does
not expect, it stops with an error instead of guessing.

    python backend/tools/extract_mobile_content_seed.py          # writes the file
    python backend/tools/extract_mobile_content_seed.py --check  # only compares

What it changes on the way (and only this):
* the greeting: Dart's  'Mabuhay, ${widget.profile.displayName}! ...'  becomes
  'Mabuhay, {name}! ...'  (the guest form 'Mabuhay, Explorer! ...' is checked to be
  the same text);
* in the PORT GUIDE only: the two amounts become {fee_regular} and
  {fee_discounted}. The real amounts are filled in by the server later, from the
  one constant the reports use; they are not stored here;
* EVERYWHERE the place of the Tourism Office is written (the Boat Guide tile, the
  Environmental Fee tile and the port guide) it becomes {fee_office}, and the one
  block `fee_office` holds the place. One source: the script stops unless it finds
  exactly three of them and no "2nd Floor" is left outside that block;
* the leading "• " of each port guide line is dropped (the app draws it).
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DART = os.path.join(ROOT, "mobile", "lib", "screens", "tourism_screens.dart")
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


def build(src):
    # -- the welcome banner ------------------------------------------------------
    greeting = re.search(r"widget\.profile\.isGuest\s*\?\s*" + LIT + r"\s*:\s*" + LIT, src)
    if not greeting:
        fail("cannot find the greeting")
    guest, member = greeting.group(1), greeting.group(2)
    if "${widget.profile.displayName}" not in member:
        fail("the greeting no longer uses the display name")
    template = member.replace("${widget.profile.displayName}", "{name}")
    if guest.replace("Explorer", "{name}") != template:
        fail("the guest greeting and the member greeting are no longer the same text")
    after = src[greeting.end():]
    welcome_sub = re.search(r"Text\(\s*" + LIT, after)
    if not welcome_sub:
        fail("cannot find the welcome text")
    welcome = {"key": "welcome", "title": unescape(template.replace("{name}", "NAME")).replace("NAME", "{name}"),
               "subtitle": unescape(welcome_sub.group(1)), "body": ""}

    # -- Why Visit: introduction and the four pillars ------------------------------
    highlights = region(src, "class _MaubanTownHighlightsCard", "Widget _buildPillarItem")
    head = texts(highlights)
    if len(head) != 3:
        fail(f"the Why Visit card has {len(head)} texts, expected 3 (title, subtitle, paragraph)")
    why = {"key": "why_visit", "title": head[0], "subtitle": head[1], "body": head[2]}

    pillars = re.findall(
        r"_buildPillarItem\(\s*icon: Icons\.(\w+),\s*title: " + LIT + r",\s*sub: " + LIT + r",\s*color: const Color\((0x[0-9A-Fa-f]+)\)",
        highlights,
    )
    if len(pillars) != 4:
        fail(f"{len(pillars)} pillars found, expected 4")

    # -- the travel guide: heading, four guides (tiles), two notices (banners) ---------
    guide_region = region(src, "class _MaubanTownGuideSection", "class DestinationListPage")
    heading = texts(guide_region)[0]
    travel_guide = {"key": "travel_guide", "title": heading, "subtitle": "", "body": ""}
    guides = re.findall(
        r"_buildGuideTile\(\s*icon: Icons\.(\w+),\s*title: " + LIT + r",\s*desc: " + LIT + r",\s*color: const Color\((0x[0-9A-Fa-f]+)\)",
        guide_region,
    )
    if len(guides) != 4:
        fail(f"{len(guides)} guides found, expected 4")
    banners = re.findall(
        r"InfoBanner\(\s*icon: Icons\.(\w+),\s*title: " + LIT + r",\s*text: " + LIT + r",\s*color: ",
        src,
    )
    if len(banners) != 2:
        fail(f"{len(banners)} InfoBanner notices found, expected 2")
    # In the Home page the guides are built BEFORE the notices: that is the order of the list.
    if not 0 <= src.find("_MaubanTownGuideSection()") < src.find("InfoBanner("):
        fail("the notices are no longer below the guides in the Home page")

    # -- the port guide ---------------------------------------------------------------
    port_region = region(src, "Widget _buildPortGuideCard", "class ProfilePage")
    port_texts = texts(port_region)
    if len(port_texts) != 5 or not all(t.startswith("• ") for t in port_texts[1:]):
        fail("the port guide is no longer a title and four '• ' lines")
    bullets = [t[2:] for t in port_texts[1:]]
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
    port = {"key": "port_guide", "title": port_texts[0], "subtitle": "", "body": "\n".join(templated)}
    fee_office = {"key": "fee_office", "title": "", "subtitle": "", "body": office}

    # -- the items ---------------------------------------------------------------------
    def icon(name):
        if name not in ICONS:
            fail(f"a Dart icon with no stored name: {name}")
        return ICONS[name]

    items = []
    for n, (ic, title, sub, _color) in enumerate(pillars, start=1):
        items.append(dict(section="why_visit", icon=icon(ic), title=unescape(title), short_text=unescape(sub),
                          full_text="", style="tile", display_order=n * 10, is_active=True))
    for n, (ic, title, desc, _color) in enumerate(guides, start=1):
        items.append(dict(section="travel_guide", icon=icon(ic), title=unescape(title), short_text=unescape(desc),
                          full_text="", style="tile", display_order=n * 10, is_active=True))
    for n, (ic, title, text) in enumerate(banners, start=len(guides) + 1):
        items.append(dict(section="travel_guide", icon=icon(ic), title=unescape(title), short_text=unescape(text),
                          full_text="", style="banner", display_order=n * 10, is_active=True))

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
    data = build(src)
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
