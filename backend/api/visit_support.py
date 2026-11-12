"""Test helper: the visit a tourist must have made before the server takes a review from them (mobile_feedback_submit).

A review needs a TouristRecord for THAT destination, scanned on arrival (status arrived), and its survey ID and contact number in the post.
"""
from .test_destination_accuracy import arrive

CONTACT = "09170000000"  # the contact number arrive() gives every record it makes


def arrived_visit(resort, survey_id="FB-0001", status="arrived"):
    """A record at `resort`, arrived by default."""
    return arrive(resort, survey_id, 2, status=status)


def visit_fields(record, **extra):
    """What a review must carry besides its text: the survey ID and the contact number of the visit."""
    return {"survey_id": record.survey_id, "contact_number": record.contact_number, **extra}
