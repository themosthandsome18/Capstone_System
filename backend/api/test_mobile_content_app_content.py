"""The key `appContent` of the public tourism bootstrap (Mobile App Content, Commit 3b).

The fixed world and the golden bootstrap are in test_mobile_content_bootstrap.py. The golden file is what the OLD
code (origin/main, 5ded035) sent for that world, taken before any of this code existed.
"""
import hashlib
import json
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.authtoken.models import Token
from rest_framework.renderers import JSONRenderer
from rest_framework.test import APIClient

from .models import ROLE_ADMIN, ActivityLog, MobileContentBlock, MobileContentItem, UserProfile
from .services import mobile_content as svc
from .services import tourism as tourism_services
from .test_mobile_content_bootstrap import BOOTSTRAP, build_fixed_world

HERE = Path(__file__).resolve().parent
GOLDEN = (HERE / "bootstrap_golden" / "before_appcontent_5ded035.json").read_bytes()
SEED = json.loads((HERE / "migrations" / "seed_data" / "mobile_content_0061.json").read_text(encoding="utf-8"))
MARK = b',"appContent":'
OLD_KEYS = ["referenceTables", "destinations", "featuredDestinations", "barangays", "notifications", "theme", "emergencyContacts"]

# appContent for the seed texts with ids 1..10 in the fixed world, measured once and pinned: a tripwire for ANY change
# of shape, wording, order or amount.
PINNED_APPCONTENT_BYTES = 3359
PINNED_APPCONTENT_SHA256 = "5f3007cfb24065d17d1dadad24ae997706bc9a605b3aae8695cbb1ff46c9cfd5"


def build_content_world():
    """The ten items and the five blocks of the seed, with explicit ids (1..10, 1..5) so every run is the same."""
    MobileContentItem.objects.all().delete()
    MobileContentBlock.objects.all().delete()
    for number, block in enumerate(SEED["blocks"], 1):
        MobileContentBlock.objects.create(id=number, **block)
    for number, item in enumerate(SEED["items"], 1):
        MobileContentItem.objects.create(id=number, **item)


def split(body):
    """-> (the body without the key, the bytes of the value of appContent). The key must be there exactly once, last."""
    assert body.count(MARK) == 1, "appContent must be in the bootstrap exactly once"
    assert body.endswith(b"}")
    at = body.index(MARK)
    return body[:at] + b"}", body[at + len(MARK):-1]


def independent_app_content():
    """appContent worked out from the seed file by a different road than the service: plain str.replace, no regex."""
    office = next(b for b in SEED["blocks"] if b["key"] == "fee_office")["body"]

    def put(text):
        return text.replace("{fee_regular}", "₱80").replace("{fee_discounted}", "₱64").replace("{fee_office}", office)

    blocks = {}
    for key, fields in (("welcome", ("title", "subtitle")), ("why_visit", ("title", "subtitle", "body")),
                        ("travel_guide", ("title",)), ("port_guide", ("title", "body"))):
        row = next(b for b in SEED["blocks"] if b["key"] == key)
        blocks[key] = {field: put(row[field]) for field in fields}
    sections = {"why_visit": [], "travel_guide": []}
    for number, item in sorted(enumerate(SEED["items"], 1), key=lambda pair: (pair[1]["display_order"], pair[0])):
        sections[item["section"]].append({
            "id": number, "icon": item["icon"], "title": put(item["title"]), "short_text": put(item["short_text"]),
            "full_text": put(item["full_text"]), "style": item["style"], "tappable": bool(item["full_text"].strip()),
        })
    return {"blocks": blocks, "sections": sections}


@override_settings(USE_SEED_DATA=False)
class AppContentBase(TestCase):
    def setUp(self):
        build_fixed_world()
        build_content_world()
        self.assertEqual((MobileContentItem.objects.count(), MobileContentBlock.objects.count()), (10, 5))  # the fixture reached its case

    def get(self):
        response = APIClient().get(BOOTSTRAP)
        self.assertEqual(response.status_code, 200)
        return response.content

    def content(self):
        return json.loads(self.get())["appContent"]

    def titles(self, section):
        return [row["title"] for row in self.content()["sections"][section]]

    def admin(self):
        user = User.objects.create_user(username="ac_admin", password="Staff@12345")
        UserProfile.objects.create(user=user, role=ROLE_ADMIN)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        return client


class AppContentShapeTests(AppContentBase):
    def test_it_is_the_last_key_and_the_old_ones_keep_their_places(self):
        self.assertEqual(list(json.loads(self.get())), OLD_KEYS + ["appContent"])

    def test_the_shape_is_exactly_this(self):
        content = self.content()
        self.assertEqual(list(content), ["blocks", "sections"])
        self.assertEqual(list(content["blocks"]), ["welcome", "why_visit", "travel_guide", "port_guide"])  # no fee_office
        self.assertEqual({k: tuple(v) for k, v in content["blocks"].items()}, svc.SHOWN_FIELDS)
        self.assertEqual(list(content["sections"]), ["why_visit", "travel_guide"])
        self.assertEqual((len(content["sections"]["why_visit"]), len(content["sections"]["travel_guide"])), (4, 6))  # the fixture: items really there
        for rows in content["sections"].values():
            for row in rows:
                self.assertEqual(list(row), ["id", "icon", "title", "short_text", "full_text", "style", "tappable"])

    def test_the_fields_shown_are_the_ones_the_admin_api_lets_an_admin_edit(self):
        from .views.mobile_content import BLOCKS

        self.assertEqual(
            {key: tuple(spec["fields"]) for key, spec in BLOCKS.items() if key != "fee_office"},
            svc.SHOWN_FIELDS,
        )

    def test_the_banners_and_the_tiles_are_told_apart_by_style(self):
        styles = {row["title"]: row["style"] for row in self.content()["sections"]["travel_guide"]}
        self.assertEqual(sorted(set(styles.values())), ["banner", "tile"])
        self.assertEqual(styles["Upcoming: Fiesta de Mauban & Buntal Festival"], "banner")
        self.assertEqual(styles["Clean Coast & Eco-Tourism Policy"], "banner")
        self.assertEqual(styles["Environmental Fee"], "tile")

    def test_it_is_what_an_independent_reading_of_the_seed_says(self):
        self.assertEqual(self.content(), independent_app_content())


class AppContentWhichItemsTests(AppContentBase):
    def test_an_inactive_item_is_not_sent_and_comes_back_in_its_place(self):
        before = self.titles("travel_guide")
        self.assertIn("Environmental Fee", before)  # the fixture: it is there to be switched off
        MobileContentItem.objects.filter(title="Environmental Fee").update(is_active=False)
        after = self.titles("travel_guide")
        self.assertEqual(after, [t for t in before if t != "Environmental Fee"])
        gone = MobileContentItem.objects.get(title="Environmental Fee").pk
        self.assertNotIn(gone, [row["id"] for rows in self.content()["sections"].values() for row in rows])  # (other texts MENTION the fee)
        MobileContentItem.objects.filter(title="Environmental Fee").update(is_active=True)
        self.assertEqual(self.titles("travel_guide"), before)

    def test_what_is_never_sent_about_an_item(self):
        text = json.dumps(self.content())
        for word in ("is_active", "display_order", "section"):
            self.assertNotIn(f'"{word}"', text)

    def test_the_order_is_the_position_then_the_id_and_not_the_id_alone(self):
        MobileContentItem.objects.filter(section="why_visit").delete()
        make = MobileContentItem.objects.create
        make(id=101, section="why_visit", title="Created first, shown last", short_text="x", display_order=30)
        make(id=102, section="why_visit", title="Created second, shown first", short_text="x", display_order=10)
        make(id=104, section="why_visit", title="Tie, higher id", short_text="x", display_order=20)
        make(id=103, section="why_visit", title="Tie, lower id", short_text="x", display_order=20)
        self.assertEqual(
            self.titles("why_visit"),
            ["Created second, shown first", "Tie, lower id", "Tie, higher id", "Created first, shown last"],
        )

    def test_a_section_with_nothing_active_is_an_empty_list_not_a_missing_key(self):
        MobileContentItem.objects.filter(section="why_visit").update(is_active=False)
        self.assertEqual(self.content()["sections"]["why_visit"], [])
        self.assertEqual(list(self.content()["sections"]), ["why_visit", "travel_guide"])

    def test_tappable_is_decided_by_the_server_from_the_full_text(self):
        item = MobileContentItem.objects.get(title="Buntal Weaving")
        rows = lambda: {r["title"]: r for r in self.content()["sections"]["why_visit"]}
        self.assertEqual(rows()["Buntal Weaving"]["tappable"], False)  # the seed: no full text, nothing opens
        for text, tappable in (("The long story.", True), ("", False), ("   \n\t ", False), ("x", True)):
            MobileContentItem.objects.filter(pk=item.pk).update(full_text=text)
            row = rows()["Buntal Weaving"]
            self.assertEqual(row["tappable"], tappable, repr(text))
            self.assertEqual(row["full_text"], text)  # the text itself is sent as it is, so the app can open it

    def test_an_edit_through_the_admin_api_is_in_the_very_next_bootstrap(self):
        client = self.admin()
        item = MobileContentItem.objects.get(title="Forest Cascades")
        self.assertIn("Forest Cascades", self.titles("why_visit"))  # (and this read must not be kept anywhere)
        response = client.patch(f"/api/mobile-content/items/{item.pk}/", {"title": "Falls", "full_text": "Two falls, one trail."}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        rows = {r["id"]: r for r in self.content()["sections"]["why_visit"]}
        self.assertEqual((rows[item.pk]["title"], rows[item.pk]["tappable"]), ("Falls", True))
        response = client.post(f"/api/mobile-content/items/{item.pk}/deactivate/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotIn(item.pk, [r["id"] for r in self.content()["sections"]["why_visit"]])


class AppContentFillTests(AppContentBase):
    def test_the_fee_texts_are_filled_and_nothing_with_a_fee_brace_is_left(self):
        text = json.dumps(self.content(), ensure_ascii=False)
        self.assertNotIn("{fee_", text)
        port = self.content()["blocks"]["port_guide"]["body"]
        self.assertIn("Environmental Fee: ₱80 per visitor.", port)
        self.assertIn("pay ₱64. Pay at the Tourism Office, 2nd Floor, Mauban Municipal Hall.", port)
        boat = next(r for r in self.content()["sections"]["travel_guide"] if r["title"] == "Cagbalete Island Boat Guide")
        self.assertIn("paid at the Tourism Office, 2nd Floor, Mauban Municipal Hall. The boat fare", boat["short_text"])

    def test_the_title_and_the_full_text_of_an_item_are_filled_too_not_only_its_short_line(self):
        MobileContentItem.objects.create(
            id=201, section="why_visit", icon="info", title="Pay {fee_regular}", short_text="Short {fee_discounted}",
            full_text="At the {fee_office}: {fee_regular} or {fee_discounted}.", display_order=99,
        )
        row = next(r for r in self.content()["sections"]["why_visit"] if r["id"] == 201)
        self.assertEqual(row["title"], "Pay ₱80")
        self.assertEqual(row["short_text"], "Short ₱64")
        self.assertEqual(row["full_text"], "At the Tourism Office, 2nd Floor, Mauban Municipal Hall: ₱80 or ₱64.")
        self.assertTrue(row["tappable"])

    def test_the_visitors_name_is_left_for_the_app(self):
        self.assertEqual(self.content()["blocks"]["welcome"]["title"], "Mabuhay, {name}! \U0001F30A")

    def test_the_amounts_follow_the_constant_and_nothing_is_written_back(self):
        rows = lambda: (list(MobileContentItem.objects.order_by("pk").values()), list(MobileContentBlock.objects.order_by("pk").values()))
        before = rows()
        with patch.object(tourism_services, "REGULAR_ENTRANCE_FEE", 90), patch.object(tourism_services, "DISCOUNTED_ENTRANCE_FEE", 72):
            port = self.content()["blocks"]["port_guide"]["body"]
        self.assertIn("₱90 per visitor", port)
        self.assertIn("pay ₱72.", port)
        self.assertEqual(rows(), before)

    def test_a_blank_place_leaves_out_exactly_what_needs_it_and_says_so_in_the_log(self):
        MobileContentBlock.objects.filter(key="fee_office").update(body="   ")
        with self.assertLogs("api.services.mobile_content", level="WARNING") as logs:
            content = self.content()
        self.assertNotIn("port_guide", content["blocks"])  # its text says {fee_office}
        self.assertEqual(list(content["blocks"]), ["welcome", "why_visit", "travel_guide"])  # the others are still there
        titles = [row["title"] for row in content["sections"]["travel_guide"]]
        self.assertNotIn("Cagbalete Island Boat Guide", titles)  # says {fee_office}
        self.assertNotIn("Environmental Fee", titles)            # says {fee_office}
        self.assertEqual(len(titles), 4)                         # the four that do not are still there
        self.assertEqual(len(content["sections"]["why_visit"]), 4)
        joined = "\n".join(logs.output)
        self.assertIn("port_guide", joined)
        self.assertNotIn("Tourism Office", joined)  # the log names the block and the item, not their text
        self.assertNotIn("{fee_", json.dumps(content))

    def test_with_no_fee_office_block_at_all_it_is_the_same_as_a_blank_one(self):
        MobileContentBlock.objects.filter(key="fee_office").delete()
        with self.assertLogs("api.services.mobile_content", level="WARNING"):
            content = self.content()
        self.assertEqual(list(content["blocks"]), ["welcome", "why_visit", "travel_guide"])
        self.assertEqual(len(content["sections"]["travel_guide"]), 4)

    def test_a_missing_block_is_left_out_and_the_others_are_sent(self):
        MobileContentBlock.objects.filter(key="why_visit").delete()
        with self.assertLogs("api.services.mobile_content", level="WARNING"):
            content = self.content()
        self.assertEqual(list(content["blocks"]), ["welcome", "travel_guide", "port_guide"])


class AppContentNothingIsWrittenTests(AppContentBase):
    def test_reading_writes_nothing_and_costs_two_selects(self):
        with CaptureQueriesContext(connection) as queries:
            content = svc.build_app_content()
        self.assertTrue(content["sections"]["why_visit"])  # the fixture: there was something to read
        statements = [q["sql"].lstrip().upper() for q in queries.captured_queries]
        self.assertEqual(len(statements), 2)
        self.assertTrue(all(s.startswith("SELECT") for s in statements), statements)

    def test_three_bootstraps_leave_every_row_and_the_log_as_they_were(self):
        snapshot = lambda: (
            list(MobileContentItem.objects.order_by("pk").values()),
            list(MobileContentBlock.objects.order_by("pk").values()),
            ActivityLog.objects.count(),
        )
        before = snapshot()
        for _ in range(3):
            self.get()
        self.assertEqual(snapshot(), before)


class AppContentFailureTests(AppContentBase):
    def test_if_it_cannot_be_built_the_bootstrap_still_answers_with_every_old_key_unchanged(self):
        with patch("api.views.mobile.build_app_content", side_effect=RuntimeError("boom")), self.assertLogs("api.views.mobile", level="ERROR"):
            response = APIClient().get(BOOTSTRAP)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(b"appContent", response.content)
        self.assertEqual(response.content, GOLDEN)  # byte for byte what the old code sent


class AppContentTheThreeFencesTests(AppContentBase):
    """The bytes of the bootstrap, at three levels. A change anywhere outside appContent fails the first two."""

    def test_level_1_without_the_key_it_is_byte_for_byte_the_bootstrap_of_the_old_code(self):
        body = self.get()
        without, _ = split(body)
        self.assertGreater(len(body), len(GOLDEN))  # the fixture: something really was added
        self.assertEqual(without, GOLDEN)

    def test_level_2_before_it_and_after_it_not_one_byte_moved(self):
        body = self.get()
        _, value = split(body)
        self.assertEqual(body[: len(GOLDEN) - 1], GOLDEN[:-1])         # the prefix: everything the old code sent but its closing brace
        self.assertEqual(body[len(GOLDEN) - 1:], MARK + value + b"}")  # the suffix: the key, its value and the brace, nothing else
        self.assertEqual(body, GOLDEN[:-1] + MARK + value + b"}")

    def test_level_2_each_old_key_is_the_same_value_as_before(self):
        now, then = json.loads(self.get()), json.loads(GOLDEN)
        self.assertEqual(list(then), OLD_KEYS)
        for key in OLD_KEYS:
            with self.subTest(key=key):
                self.assertEqual(now[key], then[key])
                self.assertEqual(
                    hashlib.sha256(JSONRenderer().render(now[key])).hexdigest(), hashlib.sha256(JSONRenderer().render(then[key])).hexdigest()
                )

    def test_level_3_the_value_is_what_an_independent_reading_of_the_seed_renders_to(self):
        _, value = split(self.get())
        self.assertEqual(value, JSONRenderer().render(independent_app_content()))
        self.assertEqual(len(value), PINNED_APPCONTENT_BYTES)
        self.assertEqual(hashlib.sha256(value).hexdigest(), PINNED_APPCONTENT_SHA256)

    def test_the_old_keys_do_not_move_when_the_admin_changes_everything_in_the_content(self):
        client = self.admin()
        boat = MobileContentItem.objects.get(title="Cagbalete Island Boat Guide")
        for method, url, body in (
            ("post", "/api/mobile-content/items/", {"section": "travel_guide", "title": "Brand New", "short_text": "A new line."}),
            ("patch", f"/api/mobile-content/items/{boat.pk}/", {"title": "Changed title"}),
            ("post", f"/api/mobile-content/items/{boat.pk}/deactivate/", {}),
            ("patch", "/api/mobile-content/blocks/welcome/", {"subtitle": "Changed"}),
            ("patch", "/api/mobile-content/blocks/fee_office/", {"body": "Changed place"}),
        ):
            response = getattr(client, method)(url, body, format="json")
            self.assertIn(response.status_code, (200, 201), (url, response.content))
        without, value = split(self.get())
        self.assertEqual(without, GOLDEN)          # every old byte is where it was ...
        self.assertIn(b"Changed place", value)     # ... and the changes are all in the new key (the fixture: they really happened)
        self.assertIn(b"Brand New", value)
        self.assertNotIn(b"Cagbalete Island Boat Guide", value)
