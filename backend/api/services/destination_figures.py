"""The figures a destination carries: people who arrived this month, this year and in the last 365 days, and how many reviews it has.

One place for the sum, so the web list, the app's bootstrap and the serializer's fallback cannot count it three ways.
The arrivals are PEOPLE (the records' total_visitors added up), not a count of records.
"""
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, IntegerField, OuterRef, Subquery, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from ..models import BOOKING_STATUS_ARRIVED, FeedbackEntry, Resort, TouristRecord


# The window the two lists of the Home are ranked by: today and the 364 days before it (365 days). It slides one day a day, so nothing starts
# again from 0 on 1 January the way the calendar year does.
ROLLING_DAYS = 365


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
    """Adds visitor_total (people this month), yearly_total (people this year), rolling_total (people in the last 365 days, today included)
    and review_total (visible reviews).

    yearly_total is what a card shows ("this year"); rolling_total is only what the lists are RANKED by. Each is its own subquery, so no join
    multiplies another one's rows.
    """
    today = today or timezone.localdate()
    return queryset.annotate(
        visitor_total=_people(arrival_date__year=today.year, arrival_date__month=today.month),
        yearly_total=_people(arrival_date__year=today.year),
        rolling_total=_people(arrival_date__gt=today - timedelta(days=ROLLING_DAYS), arrival_date__lte=today),
        review_total=_reviews(),
    )


def destination_map_figures(today=None):
    """The four boxes under the GIS map that are not a count of the map's own list, worked out from yearly_total.

    activeCount of totalCount: the destinations a tourist sees (is_active) out of all of them.
    arrivalsThisYear: people who arrived this year in every destination (every record has one), so it is the Year view's total of
    Arrival Monitoring. mostVisited: the destination with the most people this year, the smallest resort_id when two are level,
    and None when nobody has arrived (the screen says "None yet"; a name with 0 would be a guess).

    All of the figures below mean the same "this year" (yearly_total):
    mostVisitedSharePercent: the share of arrivalsThisYear that the busiest place has, as a whole number (half rounds up), and None when the
    total is 0 (there is nothing to take a share of).
    leastVisited: the place with the FEWEST people among those that have some (a place with none is not "the least visited": it has no visit),
    chosen as mostVisited is (the smallest resort_id when two are level), and None when nobody has arrived.
    placesWithNoArrivals: how many places a tourist could go to (active, and not a resort an import made up) have no arrivals this year.
    """
    today = today or timezone.localdate()
    rows = list(
        annotate_destination_figures(Resort.objects.all(), today).values(
            "resort_id", "resort_name", "is_active", "is_placeholder", "yearly_total"
        )
    )
    visited = [row for row in rows if row["yearly_total"] > 0]
    top = min(visited, key=lambda row: (-row["yearly_total"], row["resort_id"])) if visited else None
    bottom = min(visited, key=lambda row: (row["yearly_total"], row["resort_id"])) if visited else None
    arrivals = sum(row["yearly_total"] for row in rows)
    share = None
    if top and arrivals > 0:
        share = int((Decimal(top["yearly_total"]) * 100 / Decimal(arrivals)).quantize(Decimal(1), rounding=ROUND_HALF_UP))

    def named(row):
        return {"resort_id": row["resort_id"], "name": row["resort_name"], "arrivals": row["yearly_total"]} if row else None

    return {
        "year": today.year,
        "activeCount": sum(1 for row in rows if row["is_active"]),
        "totalCount": len(rows),
        "arrivalsThisYear": arrivals,
        "mostVisited": named(top),
        "mostVisitedSharePercent": share,
        "leastVisited": named(bottom),
        "placesWithNoArrivals": sum(
            1 for row in rows if row["yearly_total"] == 0 and row["is_active"] and not row["is_placeholder"]
        ),
    }
