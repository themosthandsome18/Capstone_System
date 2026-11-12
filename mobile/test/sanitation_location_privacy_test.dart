import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mauban_mobile_app/main.dart';
import 'sanitation_gps_sitio_test.dart' show barangays, record, sitioRows;
import 'sanitation_household_location_test.dart' show FakeHouseholdLocation;
import 'sanitation_household_edit_preservation_test.dart' show storedHousehold;

void main() {
  for (final replacement in <String?>[null, 'account-B']) {
    testWidgets('late record response stays hidden after ${replacement ?? 'logout'}', (tester) async {
      SharedPreferences.setMockInitialValues({staffAuthTokenKey: 'account-A'});
      final pending = Completer<http.Response>();
      var calls = 0;
      final client = MockClient((request) { calls++; return pending.future; });
      await http.runWithClient(() async {
        await tester.pumpWidget(const MaterialApp(home: SavedSanitationLocationPage(
          api: TourismApi(),recordId:71,household:false,barangays:barangays)));
        await tester.pump();
        await setStaffSessionToken(await SharedPreferences.getInstance(), replacement);
        await tester.pump();
        pending.complete(http.Response(jsonEncode({...record(71),'business_name':'PRIVATE ACCOUNT A'}),200));
        await tester.pump(const Duration(milliseconds:100));
        expect(find.textContaining('PRIVATE'),findsNothing);
        expect(find.text('Session expired'),findsOneWidget);
        expect(find.byType(LocationCapturePanel),findsNothing);
        expect(calls,1);
        await tester.pumpWidget(const SizedBox());
      },()=>client);
      client.close();
    });
  }
  for (final kind in ['survey', 'establishment', 'repair']) {
    for (final replacement in <String?>[null, 'account-B']) {
      testWidgets('$kind clears private state on ${replacement ?? 'logout'} and rejects late GPS', (tester) async {
        SharedPreferences.setMockInitialValues({staffAuthTokenKey: 'account-A'});
        tester.view.physicalSize = const Size(1200, 5000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final pending = Completer<Position>();
        final location = FakeHouseholdLocation()..pendingPosition = pending.future;
        final writes = <http.Request>[];
        final client = MockClient((request) async {
          if (request.method != 'GET') writes.add(request);
          if (request.url.path.endsWith('/front-photo/')) return http.Response('{}', 404);
          return http.Response(jsonEncode(request.url.path.endsWith('/sitios/') ? sitioRows(11) : {
            ...record(71), 'business_name': 'PRIVATE ACCOUNT A', 'household_head': 'PRIVATE ACCOUNT A',
            'latitude':14.18,'longitude':121.73,'sitio':'PRIVATE SITIO',
          }), 200);
        });
        await http.runWithClient(() async {
          await tester.pumpWidget(MaterialApp(home: kind == 'survey'
            ? HouseholdSurveyPage(api: const TourismApi(), barangays: barangays,
                household: HouseholdSanitationItem.fromJson({...storedHousehold(),
                  'household_head':'PRIVATE ACCOUNT A', 'sitio':'PRIVATE SITIO'}), locationAdapter: location)
            : SavedSanitationLocationPage(api: const TourismApi(), recordId:71,
                household:kind == 'repair', barangays:barangays, locationAdapter:location)));
          await tester.pump(const Duration(milliseconds:100));
          final controllers = tester.widgetList<AppTextField>(find.byType(AppTextField))
              .map((field)=>field.controller).toList();
          expect(controllers.any((controller)=>controller.text.isNotEmpty), isTrue);
          await tester.tap(find.text('Use GPS'));
          await tester.pump();
          await setStaffSessionToken(await SharedPreferences.getInstance(), replacement);
          await tester.pump();
          expect(find.textContaining('PRIVATE'), findsNothing);
          expect(find.byType(LocationCapturePanel), findsNothing);
          expect(controllers.every((controller)=>controller.text.isEmpty), isTrue);
          pending.complete(await FakeHouseholdLocation().getCurrentPosition());
          await tester.pump(const Duration(milliseconds:100));
          await setStaffSessionToken(await SharedPreferences.getInstance(), 'account-B');
          await tester.pump();
          expect(find.textContaining('PRIVATE'), findsNothing);
          expect(find.byType(LocationCapturePanel), findsNothing);
          expect(writes, isEmpty);
          await tester.pumpWidget(const SizedBox());
        }, ()=>client);
        client.close();
      });
    }
  }
}
