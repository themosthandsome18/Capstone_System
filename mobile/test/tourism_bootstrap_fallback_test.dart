// MobileBootstrap.fallback() is only used by the Staff QR portal. Its barangay
// list had three names that are not the live ones ("Poblacion" does not exist;
// Cagsiay is I, II and III), and no tourism screen reads it. A wrong name shown
// is worse than none, so it is empty. The field itself stays. The same goes for the reference lists (countries, provinces ...): the province written as 1
// "Quezon" is Ilocos Norte on the live database, so no list is written in the app; the registration form needs the server's (see registration_no_invented_ids_test.dart).
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

void main() {
  test('the fallback has no barangay names (none is better than a wrong one)', () {
    final fallback = MobileBootstrap.fallback();

    expect(fallback.barangays, isA<List<BarangayItem>>());
    expect(fallback.barangays, isEmpty);
  });

  test('the offline bootstrap offers NO reference list: an id written in the app is a guess about the database of the server', () {
    final fallback = MobileBootstrap.fallback();

    expect(fallback.isOffline, isTrue);
    expect(fallback.countries, isEmpty);
    expect(fallback.regions, isEmpty);
    expect(fallback.provinces, isEmpty);
    expect(fallback.itineraries, isEmpty);
    expect(fallback.travelModes, isEmpty);
    expect(fallback.boatTypes, isEmpty);
    expect(fallback.visitPurposes, isEmpty);
    expect(fallback.destinations, isEmpty);
    // the registration form says so, and does not open on it
    expect(missingRegistrationLists(fallback), hasLength(7));
  });

  test('a barangay list from the server is still read', () {
    final bootstrap = MobileBootstrap.fromJson({
      'barangays': [
        {'id': 9, 'name': 'Cagsiay I'},
        {'id': 10, 'name': 'Cagsiay II'},
      ],
    });

    expect(bootstrap.barangays.map((b) => b.name), ['Cagsiay I', 'Cagsiay II']);
  });
}
