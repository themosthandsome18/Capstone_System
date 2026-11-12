"""The resorts that an import MAKES UP, so that they are not taken for real destinations.

A booking that names a resort the database does not know gets a resort made for it by an import (the online booking import, the fallback
"Others / Private Residence", and the monitoring-form Excel command). Nobody has said where such a resort is, so it is given the middle of the town
as its coordinate. That is not a place: on the GIS map it would be a pin at a spot that is nothing, and it would look like a destination.

Those resorts carry Resort.is_placeholder = True. The map asks only two things: are the coordinates inside Mauban, and is it not a placeholder.
A placeholder stops being one when an admin saves it with a coordinate that is not the one the import gave: that is "exact coordinates added".

The words and the coordinates below are the ones the three importers write. They are written HERE once and the importers read them from here; the
migration that marked the resorts that already existed (0071) holds a copy, and a test holds the two together.
"""

# (latitude, longitude) the importers give a resort whose place nobody has said.
ONLINE_BOOKING_COORDINATES = (14.185, 121.731)
FALLBACK_COORDINATES = (14.185, 121.725)
MONITORING_FORM_COORDINATES = (14.185, 121.731)

# What an admin would have had to leave exactly as the import wrote it, for the resort to still be the import's.
PLACEHOLDER_COORDINATES = frozenset({ONLINE_BOOKING_COORDINATES, FALLBACK_COORDINATES, MONITORING_FORM_COORDINATES})

ONLINE_BOOKING_DESCRIPTION = "Imported from Tourism Office online booking responses."
FALLBACK_DESCRIPTION = "Fallback destination for private residences, homestays, and other non-resort locations."
MONITORING_FORM_DESCRIPTION = "Imported from client monitoring form."

# description -> the coordinates that go with it: the three signatures of a resort an import made up.
PLACEHOLDER_SIGNATURES = {
    ONLINE_BOOKING_DESCRIPTION: ONLINE_BOOKING_COORDINATES,
    FALLBACK_DESCRIPTION: FALLBACK_COORDINATES,
    MONITORING_FORM_DESCRIPTION: MONITORING_FORM_COORDINATES,
}


def has_placeholder_coordinates(latitude, longitude):
    """True when the pair is exactly one the importers give (so nobody has said where the place is)."""
    return (latitude, longitude) in PLACEHOLDER_COORDINATES
