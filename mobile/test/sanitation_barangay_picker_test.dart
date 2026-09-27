// The community report's barangay list.
//
// A phone running 1.0.2 showed only "Poblacion", "San Isidro" and "Cagsiay":
// the offline fallback, which the form captured when it was opened before
// the (cold) server answered. Mauban has 40 barangays and no "Poblacion".
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const officialMaubanBarangays = [
  'Abo-abo', 'Alitap', 'Baao', 'Bagong Bayan', 'Balaybalay', 'Bato',
  'Cagbalete I', 'Cagbalete II', 'Cagsiay I', 'Cagsiay II', 'Cagsiay III',
  'Concepcion', 'Daungan', 'Liwayway', 'Lual', 'Lual Rural', 'Lucutan',
  'Luya-luya', 'Mabato', 'Macasin', 'Polo', 'Remedios I', 'Remedios II',
  'Rizaliana', 'Rosario', 'Sadsaran', 'San Gabriel', 'San Isidro', 'San Jose',
  'San Lorenzo', 'San Miguel', 'San Rafael', 'San Roque', 'San Vicente',
  'Santa Lucia', 'Santo Angel', 'Santo Niño', 'Santol', 'Soledad', 'Tapucan',
];

const oldFallback = [
  BarangayItem(id: 1, name: 'Poblacion'),
  BarangayItem(id: 2, name: 'San Isidro'),
  BarangayItem(id: 3, name: 'Cagsiay'),
];

Future<void> pumpForm(
  WidgetTester tester, {
  List<BarangayItem> barangays = oldFallback,
  Future<List<BarangayItem>> Function()? refreshBarangays,
}) async {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      home: SanitationReportPage(
        api: const TourismApi(),
        barangays: barangays,
        refreshBarangays: refreshBarangays,
      ),
    ),
  );
  await tester.pumpAndSettle();
  if (find.byType(Dialog).evaluate().isNotEmpty) {
    await tester.tap(
      find.descendant(of: find.byType(Dialog), matching: find.byIcon(Icons.close)),
    );
    await tester.pumpAndSettle();
  }
}

List<String> visibleChoices(WidgetTester tester) {
  return tester
      .widgetList<ListTile>(find.byKey(const ValueKey('barangay-choice'), skipOffstage: false))
      .map((tile) => (tile.title as Text).data!)
      .toList();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('the offline fallback is the 40 official barangays, in display order', () {
    expect(
      sanitationBarangayFallback.map((item) => item.name).toList(),
      officialMaubanBarangays,
    );
    expect(
      SanitationBootstrap.fallback().barangays.map((item) => item.name).toList(),
      officialMaubanBarangays,
    );
  });

  test('a stored draft without a barangay does not invent "Poblacion"', () {
    final draft = SanitationReportDraft.fromJson({'id': 'x', 'name': 'Juana'});
    expect(draft.barangay, isEmpty);
  });

  testWidgets('the picker is searchable', (tester) async {
    await pumpForm(
      tester,
      barangays: [
        for (var i = 0; i < officialMaubanBarangays.length; i++)
          BarangayItem(id: i + 1, name: officialMaubanBarangays[i]),
      ],
    );

    await tester.tap(find.text('Piliin ang barangay'));
    await tester.pumpAndSettle();
    expect(visibleChoices(tester), hasLength(40));

    await tester.enterText(find.byKey(const ValueKey('barangay-search')), 'cagsiay');
    await tester.pumpAndSettle();
    expect(visibleChoices(tester), ['Cagsiay I', 'Cagsiay II', 'Cagsiay III']);

    await tester.tap(find.text('Cagsiay II'));
    await tester.pumpAndSettle();
    expect(find.text('Cagsiay II'), findsOneWidget);
    expect(find.text('Piliin ang barangay'), findsNothing);
  });

  testWidgets('a form opened before the server answered gets the real list', (tester) async {
    await pumpForm(
      tester,
      refreshBarangays: () async => [
        for (var i = 0; i < officialMaubanBarangays.length; i++)
          BarangayItem(id: i + 1, name: officialMaubanBarangays[i]),
      ],
    );

    await tester.tap(find.text('Piliin ang barangay'));
    await tester.pumpAndSettle();

    final choices = visibleChoices(tester);
    expect(choices, hasLength(40));
    expect(choices, isNot(contains('Poblacion')));
    expect(choices.last, 'Tapucan');
  });
}
