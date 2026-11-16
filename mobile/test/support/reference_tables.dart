// A COMPLETE set of reference lists for a test that opens the registration form.
//
// The form no longer makes up an item when the server's list is empty (it shows "Registration isn't available right now" instead), so a test that is
// about something else (the contact number, the pax, the fare) has to hand it a full set, the way the server does. These ids are the TEST'S OWN: they are
// not read from the app, so the app has no copy of them to drift from. A test that is about one list passes its own in [overrides].
Map<String, dynamic> fixtureReferenceTables([Map<String, dynamic> overrides = const {}]) => {
  'countries': [
    {'id': 1, 'name': 'Philippines', 'type': 'local'},
    {'id': 2, 'name': 'United States', 'type': 'foreign'},
  ],
  'regions': [
    {'id': 4, 'name': 'CALABARZON Region'},
  ],
  'provinces': [
    {'id': 20, 'name': 'Quezon', 'region_id': 4},
  ],
  'itineraries': [
    {'id': 1, 'name': 'Overnight'},
    {'id': 2, 'name': 'Same Day'},
    {'id': 3, 'name': '2 Nights'},
  ],
  'travelModes': [
    {'id': 1, 'name': 'Private Vehicle'},
    {'id': 2, 'name': 'Public Utility Vehicle'},
  ],
  'boatTypes': [
    {'id': 1, 'name': 'Tourist Boat', 'requires_capacity_fare': true},
    {'id': 2, 'name': 'Passenger Boat', 'requires_capacity_fare': false},
  ],
  'visitPurposes': [
    {'id': 1, 'name': 'Leisure'},
    {'id': 3, 'name': 'Business'},
  ],
  ...overrides,
};
