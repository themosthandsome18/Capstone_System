"""backend/tools/check_live_appcontent.py: the standing live check "is appContent there, and is it right".

The check is run against bytes made from the REAL golden bootstrap and the REAL appContent value (the file the Dart test
reads), then against damaged copies: each damage must be caught by name, and the good one must pass every check.
"""
import importlib.util
import json
from pathlib import Path

from django.test import SimpleTestCase

HERE = Path(__file__).resolve().parent
TOOL = HERE.parent / "tools" / "check_live_appcontent.py"
GOLDEN = (HERE / "bootstrap_golden" / "before_appcontent_5ded035.json").read_bytes()
VALUE_FILE = HERE.parent.parent / "mobile" / "test" / "data" / "app_content_commit3.json"
MARK = b',"appContent":'


def load_tool():
    spec = importlib.util.spec_from_file_location("check_live_appcontent", TOOL)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CheckLiveAppContentTests(SimpleTestCase):
    def setUp(self):
        if not VALUE_FILE.exists():
            self.skipTest("the mobile source is not next to the backend here")
        self.tool = load_tool()
        self.value = VALUE_FILE.read_bytes()
        self.good = GOLDEN[:-1] + MARK + self.value + b"}"

    def failed(self, body, before=GOLDEN):
        return [name for name, ok, _ in self.tool.check(body, before) if not ok]

    def edited(self, change):
        content = json.loads(self.value)
        change(content)
        return GOLDEN[:-1] + MARK + json.dumps(content, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"}"

    def test_the_real_bootstrap_passes_every_check(self):
        results = self.tool.check(self.good, GOLDEN)
        self.assertGreaterEqual(len(results), 15)  # the fixture: it really ran the checks
        self.assertEqual([name for name, ok, _ in results if not ok], [])

    def test_a_missing_appcontent_is_the_failure_this_exists_to_catch(self):
        failed = self.failed(GOLDEN)
        self.assertEqual(failed, ["appContent IS in the bootstrap"])
        detail = [d for n, ok, d in self.tool.check(GOLDEN) if n == "appContent IS in the bootstrap"][0]
        self.assertIn("APPCONTENT_FAILED", detail)

    def test_each_damage_is_caught_by_name(self):
        cases = {
            "the answer is not JSON": (b"<html>502</html>", ["the answer is a JSON object"]),
            "an old key gone": (self.good.replace(b'"theme"', b'"themed"', 1), ["the seven old keys are all there, in their places"]),
            "a fee placeholder left": (self.edited(lambda c: c["blocks"]["port_guide"].update(body="Pay {fee_regular}")), ["no {fee_...} placeholder is left in any text"]),
            "a stray brace": (self.edited(lambda c: c["blocks"]["why_visit"].update(body="a } b")), ["no brace is left in any text, except {name}"]),
            "the name outside the welcome": (self.edited(lambda c: c["blocks"]["why_visit"].update(body="Hi {name}")), ["{name} appears only in the welcome banner", "no brace is left in any text, except {name}"][:1]),
            "a block left out": (self.edited(lambda c: c["blocks"].pop("port_guide")), ["blocks: only the four the app shows, each with its fields"]),
            "an item with an extra field": (self.edited(lambda c: c["sections"]["why_visit"][0].update(is_active=True)), ["every item has exactly the seven fields"]),
            "a tappable that disagrees": (self.edited(lambda c: c["sections"]["why_visit"][0].update(tappable=True)), ["tappable agrees with the full text"]),
            "a section gone": (self.edited(lambda c: c["sections"].pop("travel_guide")), ["sections: why_visit and travel_guide, both lists"]),
        }
        for label, (body, expected) in cases.items():
            with self.subTest(label):
                failed = self.failed(body)
                for name in expected:
                    self.assertIn(name, failed, label)

    def test_the_key_must_be_last_and_the_old_bytes_must_not_move(self):
        content = self.value
        moved = b'{"appContent":' + content + b"," + GOLDEN[1:]
        self.assertIn("appContent is the LAST key", self.failed(moved))
        shifted = self.good.replace(b'"Cagsiay I"', b'"Cagsiay J"', 1)
        self.assertNotEqual(shifted, self.good)  # the fixture: one byte of an OLD key really moved
        failed = self.failed(shifted)
        self.assertIn("everything before appContent is byte for byte the saved bootstrap", failed)  # each of the two catches it by itself
        self.assertIn("prefix and suffix: not one byte moved", failed)

    def test_the_canary_is_checked(self):
        big = self.edited(lambda c: c["sections"]["why_visit"][0].update(full_text="word " * 14000, tappable=True))
        self.assertIn(f"appContent is under the canary ({self.tool.CANARY_BYTES} bytes)", self.failed(big))

    def test_it_exits_nonzero_when_a_check_fails(self):
        from unittest.mock import patch

        with patch.object(self.tool.urllib.request, "urlopen") as urlopen:
            urlopen.return_value.read.return_value = GOLDEN
            self.assertEqual(self.tool.main([]), 1)
            urlopen.return_value.read.return_value = self.good
            self.assertEqual(self.tool.main([]), 0)

    def test_a_month_turning_is_told_from_a_real_change(self):
        """On 1 November the arrivals of a destination go back to 0 with nothing deployed: the byte checks must fail (the old bytes DID
        move) but the check that names WHAT moved must say it was only what the calendar moves."""
        saved = json.loads(GOLDEN)
        self.assertTrue(saved["destinations"] and saved["notifications"])  # the fixture: there is something to move
        calendar = json.loads(self.good)
        calendar["destinations"][0]["monthly_arrivals"] = 0
        calendar["destinations"].reverse()
        calendar["notifications"] = []
        calendar["referenceTables"]["resorts"] = []
        body = json.dumps(calendar, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        failed = self.failed(body)
        self.assertIn("everything before appContent is byte for byte the saved bootstrap", failed)  # the bytes did move ...
        self.assertNotIn("only keys that move with the calendar differ (monthly arrivals, the trending line)", failed)  # ... but only the calendar's
        self.assertEqual([d for n, ok, d in self.tool.check(body, GOLDEN) if n == "INFO old keys that differ from the saved bootstrap"],
                         ["['referenceTables.resorts', 'destinations', 'notifications']"])
        real = json.loads(self.good)
        real["theme"]["primary_color"] = "#000000"
        real["barangays"] = []
        body = json.dumps(real, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.assertIn("only keys that move with the calendar differ (monthly arrivals, the trending line)", self.failed(body))
