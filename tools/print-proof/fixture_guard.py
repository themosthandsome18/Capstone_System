"""The visitor-data check for print-proof fixtures.

find_visitor_data(data, names) returns (section, pattern, count) for every match:
survey IDs, email addresses, Philippine mobile numbers, visitor-level field names,
and any of the given visitor names. An empty list means clean.

Also usable on its own, on any JSON file (without the names check):
    python tools/print-proof/fixture_guard.py FILE.json
exits 2 and lists the matches, or exits 0 when clean.
"""
import json
import re
import sys

PATTERNS = {
    "survey ID": re.compile(r"SURV-\d{4}-\d+"),
    "email address": re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    "Philippine mobile number": re.compile(r"(?<!\d)(?:\+?63|0)9\d{9}(?!\d)"),
}
VISITOR_FIELDS = ("full_name", "first_name", "last_name", "contact_number", "email", "survey_id")


def _sections(data, prefix=""):
    """Top-level sections, and the bootstrap's own sections, each checked and named separately."""
    for key, value in data.items():
        name = f"{prefix}{key}"
        if key == "bootstrap" and isinstance(value, dict):
            yield from _sections(value, "bootstrap.")
        else:
            yield name, value


def _keys(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from _keys(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _keys(inner)


def find_visitor_data(data, names=()):
    problems = []
    for section, value in _sections(data):
        text = json.dumps(value, ensure_ascii=False)
        for label, pattern in PATTERNS.items():
            count = len(pattern.findall(text))
            if count:
                problems.append((section, label, count))
        fields = sorted({key for key in _keys(value) if key in VISITOR_FIELDS})
        if fields:
            problems.append((section, f"visitor-level field(s) {', '.join(fields)}", len(fields)))
        lowered = text.lower()
        hits = sum(1 for name in names if re.search(r"\b" + re.escape(name.lower()) + r"\b", lowered))
        if hits:
            problems.append((section, "visitor name", hits))
    return problems


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as handle:
        found = find_visitor_data(json.load(handle))
    if found:
        print("REFUSED: visitor data found.", file=sys.stderr)
        for section, pattern, count in found:
            print(f"  {section}: {pattern} ({count})", file=sys.stderr)
        sys.exit(2)
    print("clean")
