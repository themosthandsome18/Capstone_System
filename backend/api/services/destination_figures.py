"""The figures a destination carries: people who arrived this month and this year, and how many reviews it has.

One place for the sum, so the web list, the app's bootstrap and the serializer's fallback cannot count it three ways.
The arrivals are PEOPLE (the records' total_visitors added up), not a count of records.
"""
from django.db.models import Count, IntegerField, OuterRef, Subquery, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from ..models import BOOKING_STATUS_ARRIVED, FeedbackEntry, TouristRecord


def _people(**when):
    arrived = (
        TouristRecord.objects.filter(resort=OuterRef("pk"), status=BOOKING_STATUS_ARRIVED, **when)
        .order_by()
        .values("resort")
        .annotate(total=Sum("total_visitors"))
        .values("total")
    )
    return Coalesce(Subquery(arrived, output_field=IntegerField()), 0)


def _reviews():
    # a hidden review does not count, as it does not count in the rating
    visible = (
        FeedbackEntry.objects.filter(destination=OuterRef("pk"), is_hidden=False)
        .order_by()
        .values("destination")
        .annotate(total=Count("pk"))
        .values("total")
    )
    return Coalesce(Subquery(visible, output_field=IntegerField()), 0)


def annotate_destination_figures(queryset, today=None):
    """Adds visitor_total (people this month), yearly_total (people this year) and review_total (visible reviews).

    Each is its own subquery, so no join multiplies another one's rows.
    """
    today = today or timezone.localdate()
    return queryset.annotate(
        visitor_total=_people(arrival_date__year=today.year, arrival_date__month=today.month),
        yearly_total=_people(arrival_date__year=today.year),
        review_total=_reviews(),
    )
