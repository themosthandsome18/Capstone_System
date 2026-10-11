// MobileBootstrap.fallback() is only used by the Staff QR portal. Its barangay
// list had three names that are not the live ones ("Poblacion" does not exist;
// Cagsiay is I, II and III), and no tourism screen reads it. A wrong name shown
// is worse than none, so it is empty. The field itself stays.
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

void main() {
  test('the fallback has no barangay names (none is better than a wrong one)', () {
    final fallback = MobileBootstrap.fallback();

    expect(fallback.barangays, isA<List<BarangayItem>>());
    expect(fallback.barangays, isEmpty);
  });

  test('the rest of the fallback is still there for the staff QR portal', () {
    final fallback = MobileBootstrap.fallback();

    expect(fallback.isOffline, isTrue);
    expect(fallback.countries, isNotEmpty);
    expect(fallback.regions, isNotEmpty);
    expect(fallback.provinces, isNotEmpty);
    expect(fallback.itineraries, hasLength(3));
    expect(fallback.travelModes, isNotEmpty);
    expect(fallback.boatTypes, isNotEmpty);
    expect(fallback.visitPurposes, isNotEmpty);
    expect(fallback.destinations, isEmpty);
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
