from django.db import migrations


TOURIST_BOAT_ID = 1
PASSENGER_BOAT_ID = 2

# id -> (names it may have now, name it gets)
RENAMES = {
    TOURIST_BOAT_ID: (("Public Boat",), "Tourist Boat"),
    PASSENGER_BOAT_ID: (
        ("Private Boat (Rates depend on the capacity)", "Private Boat"),
        "Passenger Boat",
    ),
}

# Rows leaving the dropdown, by id and the name each has now. Matching both
# means a database where an id holds something else is left alone.
REMOVED_ROWS = {
    3: "Boat Provided by Resort (As confirmed by both guests and resort)",
    4: "2.0",
    5: "Motorized Banca",
    6: "Speedboat",
    7: "Passenger Boat",
}

# Records on the old "Passenger Boat" row move to the renamed id 2, which
# takes that name. Their fare is left as it is.
MERGED_INTO_PASSENGER_BOAT = 7


def _rows_named(BoatType, boat_id, names):
    query = BoatType.objects.none()
    for name in names:
        query = query | BoatType.objects.filter(id=boat_id, name__iexact=name)
    return query


def forwards(apps, schema_editor):
    BoatType = apps.get_model("api", "BoatType")
    TouristRecord = apps.get_model("api", "TouristRecord")

    merged_row = _rows_named(
        BoatType,
        MERGED_INTO_PASSENGER_BOAT,
        [REMOVED_ROWS[MERGED_INTO_PASSENGER_BOAT]],
    )
    if merged_row.exists() and BoatType.objects.filter(id=PASSENGER_BOAT_ID).exists():
        TouristRecord.objects.filter(boat_type_id=MERGED_INTO_PASSENGER_BOAT).update(
            boat_type_id=PASSENGER_BOAT_ID
        )

    for boat_id, name in REMOVED_ROWS.items():
        row = _rows_named(BoatType, boat_id, [name])
        if not row.exists():
            continue
        if TouristRecord.objects.filter(boat_type_id=boat_id).exists():
            # Records still point here (the boat type is PROTECTed). Keep the
            # row rather than fail the deploy; it stays in the dropdown.
            print(
                f"\n  WARNING: BoatType {boat_id} '{name}' still has tourist "
                "records; not deleting it."
            )
            continue
        row.delete()

    # Renamed last, so id 2 never shares the name "Passenger Boat" with id 7.
    for boat_id, (current_names, new_name) in RENAMES.items():
        _rows_named(BoatType, boat_id, current_names).update(name=new_name)


def backwards(apps, schema_editor):
    # Restores the two old names and recreates the deleted rows, empty.
    # It cannot restore which records were on id 7: they stay on id 2.
    BoatType = apps.get_model("api", "BoatType")

    for boat_id, (current_names, new_name) in RENAMES.items():
        _rows_named(BoatType, boat_id, [new_name]).update(name=current_names[0])

    for boat_id, name in REMOVED_ROWS.items():
        if not BoatType.objects.filter(id=boat_id).exists():
            BoatType.objects.create(id=boat_id, name=name)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0044_boattype_requires_capacity_fare"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
