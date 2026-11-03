// In real use the age of the saved copy is measured against the REAL clock (TourismBootstrapCache.read with no `now`, as AppBootstrap calls it),
// and the limit is 7 days. The tests with a fixed clock (app_content_resume_test.dart) pass their own `now`; these two show that the app's own
// way, without one, is as it was.

import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> saveAged(Duration age) async {
  final raw = '{"destinations": [], "referenceTables": {}}';
  SharedPreferences.setMockInitialValues({
    tourismBootstrapCacheKey: raw,
    tourismBootstrapSavedAtKey: DateTime.now().subtract(age).millisecondsSinceEpoch,
  });
}

void main() {
  const cache = TourismBootstrapCache();

  test('the limit is 7 days', () {
    expect(tourismBootstrapCacheMaxAge, const Duration(days: 7));
  });

  test('with no `now` the real clock is used: a copy 6 days old by it is read, one 8 days old is thrown away', () async {
    await saveAged(const Duration(days: 6));
    final fresh = await cache.read();
    expect(fresh, isNotNull);
    expect(fresh!.age, greaterThanOrEqualTo(const Duration(days: 6)));
    expect(fresh.age, lessThan(const Duration(days: 6, minutes: 5)));

    await saveAged(const Duration(days: 8));
    expect(await cache.read(), isNull);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(tourismBootstrapCacheKey), isNull); // and it is removed, as before
  });

  test('a copy saved in the future by the real clock is not trusted, as before', () async {
    await saveAged(const Duration(days: -1));
    expect(await cache.read(), isNull);
  });

  test('a `now` that is given is what the age is measured against, not the real clock', () async {
    final savedAt = DateTime(2020, 1, 1, 12);
    SharedPreferences.setMockInitialValues({
      tourismBootstrapCacheKey: '{"destinations": [], "referenceTables": {}}',
      tourismBootstrapSavedAtKey: savedAt.millisecondsSinceEpoch,
    });
    final read = await cache.read(now: savedAt.add(const Duration(days: 6)));
    expect(read, isNotNull);
    expect(read!.age, const Duration(days: 6));
  });
}
