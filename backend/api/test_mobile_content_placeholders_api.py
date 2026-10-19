"""Which fence holds a malformed placeholder: the validator at SAVE time, through the real admin endpoints.

The filler (api/services/mobile_content.py) leaves a malformed placeholder as it is written, so it is NOT the fence
for these: the validator must refuse them before they are stored. The tests below call the real endpoints (items:
add and edit; blocks: edit), never the validator directly, for each text a person can type.
"""
from django.test import TestCase, override_settings

from .models import MobileContentBlock, MobileContentItem
from .tests import _BlockApiBase, _ItemApiBase

MALFORMED = ["{{fee_regular}}", "{ fee_regular }", "{fee_regular }", "{ fee_regular}", "{FEE_REGULAR}", "{{name}}"]
# in the welcome banner {name} is allowed, so its own malformed forms need their own probe there
MALFORMED_NAME = ["{{name}}", "{ name }", "{name }", "{ name}", "{Name}", "{NAME}", "{{name}", "{name}}"]


@override_settings(USE_SEED_DATA=False)
class MalformedPlaceholderItemTests(_ItemApiBase, TestCase):
    def setUp(self):
        self.setUpItems()

    def test_each_malformed_placeholder_is_refused_when_adding_and_when_editing_every_text(self):
        self.assertEqual(len(MALFORMED), 6)
        self.assertTrue(all(("{" in text or "}" in text) for text in MALFORMED))  # the fixture: every probe has a bracket
        reached = 0
        for text in MALFORMED:
            for field in self.FEE_FIELDS:
                body = self._new(title="Probe")
                body[field] = text if field != "title" else "Probe " + text
                reply = self._refuse("post", self.LIST, body)  # 400, and nothing written or logged
                self.assertTrue(reply["detail"], (field, text))
                reply = self._refuse("patch", self._url(self.spare), {field: text})
                self.assertTrue(reply["detail"], (field, text))
                reached += 2
        self.assertEqual(reached, len(MALFORMED) * len(self.FEE_FIELDS) * 2)  # every combination was really sent

    def test_a_well_formed_one_is_accepted_in_the_same_places(self):
        # so that a refusal above is about the brackets, not about the place or the person
        for field in self.FEE_FIELDS:
            body = self._new(title="Fine " + field)
            body[field] = "{fee_regular}" if field != "title" else "Pay {fee_regular}"
            self._ok("post", self.LIST, body, expect=201)


@override_settings(USE_SEED_DATA=False)
class MalformedPlaceholderBlockTests(_BlockApiBase, TestCase):
    TARGETS = [
        ("welcome", "title"), ("welcome", "subtitle"), ("why_visit", "title"), ("why_visit", "subtitle"), ("why_visit", "body"),
        ("travel_guide", "title"), ("port_guide", "title"), ("port_guide", "body"), ("fee_office", "body"),
    ]

    PORT_KEEP = "Departures {fee_regular} {fee_discounted} at the {fee_office}."  # a line that keeps every fee placeholder

    def setUp(self):
        self.setUpBlocks()

    def test_each_malformed_placeholder_is_refused_in_every_field_of_every_block(self):
        reached = 0
        for text in MALFORMED:
            for key, field in self.TARGETS:
                value = f"{self.PORT_KEEP}\n{text}" if (key, field) == ("port_guide", "body") else text
                reply = self._refuse(key, {field: value})  # 400, nothing written, nothing logged anywhere
                self.assertTrue(reply["detail"], (key, field, text))
                reached += 1
        self.assertEqual(reached, len(MALFORMED) * len(self.TARGETS))

    def test_the_visitors_name_is_allowed_in_the_welcome_banner_and_its_malformed_forms_are_not(self):
        self._ok("welcome", {"title": "Mabuhay, {name}!"})  # the fixture: the right form IS accepted here
        self.assertEqual(self._block("welcome").title, "Mabuhay, {name}!")
        for text in MALFORMED_NAME:
            for field in ("title", "subtitle"):
                self._refuse("welcome", {field: text})
        self.assertEqual(self._block("welcome").title, "Mabuhay, {name}!")  # none of them got in

    def test_the_name_itself_is_refused_everywhere_except_the_two_lines_of_the_welcome_banner(self):
        for key, field in self.TARGETS:
            value = f"{self.PORT_KEEP}\nHello {{name}}" if (key, field) == ("port_guide", "body") else "Hello {name}"
            if (key, field) in (("welcome", "title"), ("welcome", "subtitle")):
                self._ok(key, {field: value})  # the fixture: the right place does take it
                self.assertIn("{name}", getattr(self._block(key), field))
            else:
                reply = self._refuse(key, {field: value})
                said = "bracket of its own" if key == "fee_office" else "welcome greeting"  # the place holds no placeholder at all
                self.assertIn(said, reply["detail"], (key, field))

    def test_what_is_stored_is_unchanged_by_all_of_it(self):
        before = list(MobileContentBlock.objects.order_by("pk").values())
        items = list(MobileContentItem.objects.order_by("pk").values())
        for text in MALFORMED:
            for key, field in self.TARGETS:
                self._refuse(key, {field: f"{self.PORT_KEEP}\n{text}" if (key, field) == ("port_guide", "body") else text})
        self.assertEqual(list(MobileContentBlock.objects.order_by("pk").values()), before)
        self.assertEqual(list(MobileContentItem.objects.order_by("pk").values()), items)
