"""Filling in the {placeholders} of Mobile App Content (api/services/mobile_content.py).

These are SimpleTestCase tests on purpose: a SimpleTestCase refuses every database query, so a green test here
also proves that filling reads nothing from the database and writes nothing to it.
"""
from unittest.mock import patch

from django.test import SimpleTestCase

from api.services import mobile_content as svc
from api.services import tourism as tourism_services

OFFICE = "Tourism Office, 2nd Floor, Mauban Municipal Hall"


class FillTests(SimpleTestCase):
    def values(self, office=OFFICE):
        return svc.fee_values(office)

    # -- the amounts come from the constant, and only that direction ----------------------------------

    def test_the_amounts_are_the_constants_written_as_the_app_wrote_them(self):
        values = self.values()
        self.assertEqual(values["fee_regular"], "₱80")
        self.assertEqual(values["fee_discounted"], "₱64")
        self.assertEqual((tourism_services.REGULAR_ENTRANCE_FEE, tourism_services.DISCOUNTED_ENTRANCE_FEE), (80, 64))  # the fixture
        self.assertEqual(values["fee_office"], OFFICE)

    def test_change_the_constant_and_the_text_changes(self):
        text = "Fee {fee_regular}, discounted {fee_discounted}."
        self.assertEqual(svc.fill(text, self.values()), "Fee ₱80, discounted ₱64.")
        with patch.object(tourism_services, "REGULAR_ENTRANCE_FEE", 90), patch.object(tourism_services, "DISCOUNTED_ENTRANCE_FEE", 72):
            self.assertEqual(svc.fill(text, self.values()), "Fee ₱90, discounted ₱72.")

    def test_a_number_already_written_in_a_text_is_left_alone_and_never_read(self):
        # the direction is constant -> text: a text that says P80 (stored by a way around the API) is not read back
        # into anything, and the constant does not change it either.
        with patch.object(tourism_services, "REGULAR_ENTRANCE_FEE", 90):
            self.assertEqual(svc.fill("Pay P80 at the desk. {fee_regular}", self.values()), "Pay P80 at the desk. ₱90")

    def test_regular_and_discounted_are_not_swapped(self):
        with patch.object(tourism_services, "REGULAR_ENTRANCE_FEE", 11), patch.object(tourism_services, "DISCOUNTED_ENTRANCE_FEE", 22):
            filled = svc.fill("{fee_regular}|{fee_discounted}", self.values())
        self.assertEqual(filled, "₱11|₱22")

    # -- one pass ---------------------------------------------------------------------------------------

    def test_what_is_put_in_is_never_read_again(self):
        sneaky = "Desk {fee_regular} {fee_discounted} {fee_office} {name}"
        filled = svc.fill("Pay at the {fee_office}.", self.values(sneaky))
        self.assertEqual(filled, f"Pay at the {sneaky}.")  # inserted as written: nothing inside it was filled
        self.assertIn("{fee_regular}", filled)  # the fixture reached the case: there WAS something to fill inside

    def test_every_occurrence_and_every_kind_in_one_text(self):
        filled = svc.fill("{fee_regular}/{fee_regular} {fee_discounted}{fee_discounted} at {fee_office}", self.values())
        self.assertEqual(filled, f"₱80/₱80 ₱64₱64 at {OFFICE}")

    # -- what is not filled ----------------------------------------------------------------------------

    def test_the_name_travels_as_written(self):
        text = "Mabuhay, {name}!"
        self.assertEqual(svc.fill(text, self.values()), text)

    def test_a_placeholder_nobody_knows_stays_as_written_and_nothing_breaks(self):
        text = "Hello {fee_ofice} {x} {} { fee_regular } {{fee_regular}}"
        filled = svc.fill(text, self.values())
        self.assertIn("{fee_ofice}", filled)
        self.assertIn("{x}", filled)
        self.assertIn("{ fee_regular }", filled)  # a name with spaces around it is a different name
        self.assertEqual(filled, "Hello {fee_ofice} {x} {} { fee_regular } {₱80}")  # the inner pair of the double bracket is a placeholder

    def test_the_six_malformed_ones_as_the_filler_alone_would_treat_them(self):
        """The filler is NOT the fence for these: the admin API refuses all six at save time (see
        test_mobile_content_placeholders_api). This pins what would reach a visitor if one ever got past it."""
        expected = {
            "{{fee_regular}}": "{₱80}",
            "{ fee_regular }": "{ fee_regular }",
            "{fee_regular }": "{fee_regular }",
            "{ fee_regular}": "{ fee_regular}",
            "{FEE_REGULAR}": "{FEE_REGULAR}",
            "{{name}}": "{{name}}",
        }
        for text, shown in expected.items():
            self.assertEqual(svc.fill(text, self.values()), shown, text)

    def test_a_text_with_no_placeholder_comes_back_the_same(self):
        for text in ("", "Plain text.", "Mauban Port ↔ Cagbalete Boats \U0001F30A", "multi\nline\ntext"):
            self.assertEqual(svc.fill(text, self.values()), text)

    # -- the place of payment is missing --------------------------------------------------------------

    def test_a_missing_or_blank_place_makes_a_text_that_needs_it_unfillable(self):
        for office in (None, "", "   ", "\n\t "):
            with self.subTest(office=office):
                values = self.values(office)
                self.assertIsNone(values["fee_office"])
                with self.assertRaises(svc.Unfillable) as caught:
                    svc.fill("Pay at the {fee_office}.", values)
                self.assertEqual(caught.exception.name, "fee_office")

    def test_a_text_that_does_not_need_the_place_is_still_filled_when_the_place_is_missing(self):
        values = self.values(None)
        self.assertEqual(svc.fill("Fee {fee_regular}.", values), "Fee ₱80.")

    # -- the single definition ------------------------------------------------------------------------

    def test_the_admin_api_and_the_bootstrap_use_the_same_definition_of_a_placeholder(self):
        from api.views import mobile_content as admin

        self.assertIs(admin.PLACEHOLDER, svc.PLACEHOLDER)
        self.assertIs(admin.FEE_PLACEHOLDERS, svc.FEE_PLACEHOLDERS)
        self.assertEqual(admin.KNOWN_PLACEHOLDERS, svc.FEE_PLACEHOLDERS + ("name",))
