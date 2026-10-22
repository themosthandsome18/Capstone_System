import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_lookup_client.dart';

Map<String, dynamic> payload() => {
  'business_name': 'Synthetic',
  'business_type': 'Food',
  'barangay': 'Synthetic',
  'permit_number': null,
  'permit_status': 'active',
  'permit_status_label': 'Active',
  'permit_expiry_date': null,
  'days_left': null,
  'is_expired': false,
  'renewal_notice': null,
  'expired_notice': null,
  'suspended_notice': null,
  'requirements': [
    {'name': 'A', 'submitted': true},
    {'name': 'B', 'submitted': false},
    {'name': 'C', 'submitted': null},
  ],
  'requirements_note': null,
};

class Fake implements OwnerLookupTransport, OwnerLookupOperation {
  Fake(this.response);
  @override
  final Future<OwnerLookupResponse> response;
  int calls = 0, aborts = 0;
  Uri? endpoint;
  String? body;
  @override
  OwnerLookupOperation post(Uri uri, String json) {
    calls++;
    endpoint = uri;
    body = json;
    return this;
  }

  @override
  void abort() {
    aborts++;
  }
}

Matcher fails(OwnerLookupFailure f) =>
    isA<OwnerLookupException>().having((e) => e.failure, 'failure', f);
void main() {
  Fake reply(Object? data, [int status = 200]) =>
      Fake(Future.value(OwnerLookupResponse(status, jsonEncode(data))));
  OwnerLookupClient client(
    Fake f, {
    Duration timeout = const Duration(seconds: 90),
  }) => OwnerLookupClient(
    apiBase: 'http://127.0.0.1:8765/api/',
    transport: f,
    timeout: timeout,
  );
  for (final base in [
    '',
    '/api/',
    'https://example.invalid',
    'http://example.invalid/api/',
    'https://u:p@example.invalid/api/',
    'https://@example.invalid/api/',
    'https://example.invalid/api/?',
    'https://example.invalid/api/#',
    ' https://example.invalid/api/',
    'ftp://localhost/api/',
    'http://127.0.0.2/api/',
  ]) {
    test('invalid configuration $base sends nothing', () {
      final f = reply(payload());
      expect(
        () => OwnerLookupClient(apiBase: base, transport: f),
        throwsA(fails(OwnerLookupFailure.configuration)),
      );
      expect(f.calls, 0);
    });
  }
  for (final base in [
    'https://example.invalid/api/',
    'http://localhost/api/',
    'http://127.0.0.1/api/',
    'http://[::1]/api/',
  ]) {
    test('valid explicit base $base', () {
      final f = reply(payload());
      OwnerLookupClient(apiBase: base, transport: f);
      expect(f.calls, 0);
    });
  }
  test('exact endpoint and normalized JSON once', () async {
    final f = reply(payload());
    await client(f).lookup(' mbn - abcd 2345 ');
    expect(
      f.endpoint.toString(),
      'http://127.0.0.1:8765/api/mobile/sanitation/establishment-status/',
    );
    expect(jsonDecode(f.body!), {'code': 'MBN-ABCD2345'});
    expect(f.calls, 1);
  });
  for (final status in [
    'active',
    'renewal_due',
    'expired',
    'suspended',
    'conditional',
    'no_permit',
  ]) {
    test('preserve server $status policy and notices', () async {
      final data = payload()
        ..addAll({
          'permit_status': status,
          'permit_expiry_date': '2026-01-01',
          'days_left': -5,
          'is_expired': true,
          'suspended_notice': 'Contact office.',
          'renewal_notice': 'Renew.',
          'expired_notice': 'Expired.',
          'requirements_note': 'Bring documents.',
          'extra': 'private ignored',
        });
      final result = await client(reply(data)).lookup('SYNTHETIC');
      expect(result.permitStatus, status);
      expect(result.daysLeft, -5);
      expect(result.suspendedNotice, 'Contact office.');
      expect(result.renewalNotice, 'Renew.');
      expect(result.requirements.map((e) => e.submitted), [true, false, null]);
    });
  }
  test('nullable fields and empty requirements accepted', () async {
    final result = await client(
      reply(payload()..['requirements'] = []),
    ).lookup('SYNTHETIC');
    expect(result.daysLeft, null);
    expect(result.permitNumber, null);
    expect(result.permitExpiryDate, null);
    expect(result.requirements, isEmpty);
  });
  for (final key in payload().keys) {
    test('missing $key rejected', () async {
      await expectLater(
        client(reply(payload()..remove(key))).lookup('SYNTHETIC'),
        throwsA(fails(OwnerLookupFailure.unreadable)),
      );
    });
    test('wrong type $key rejected', () async {
      await expectLater(
        client(reply(payload()..[key] = {})).lookup('SYNTHETIC'),
        throwsA(fails(OwnerLookupFailure.unreadable)),
      );
    });
  }
  for (final key in [
    'business_name',
    'business_type',
    'barangay',
    'permit_status',
    'permit_status_label',
    'is_expired',
    'requirements',
  ]) {
    test('required null $key rejected', () async {
      await expectLater(
        client(reply(payload()..[key] = null)).lookup('SYNTHETIC'),
        throwsA(fails(OwnerLookupFailure.unreadable)),
      );
    });
  }
  for (final value in [null, [], {}, 'private raw', 123]) {
    test('bad shape $value rejected', () async {
      await expectLater(
        client(reply(value)).lookup('SYNTHETIC'),
        throwsA(fails(OwnerLookupFailure.unreadable)),
      );
    });
  }
  for (final date in ['2026-02-30', '2026-1-1', '', 'invalid']) {
    test('bad date $date rejected', () async {
      await expectLater(
        client(
          reply(payload()..['permit_expiry_date'] = date),
        ).lookup('SYNTHETIC'),
        throwsA(fails(OwnerLookupFailure.unreadable)),
      );
    });
  }
  for (final item in [
    {'name': 'A'},
    {'name': null, 'submitted': null},
    {'name': 'A', 'submitted': 'true'},
    null,
  ]) {
    test('bad requirement $item rejected', () async {
      await expectLater(
        client(reply(payload()..['requirements'] = [item])).lookup('SYNTHETIC'),
        throwsA(fails(OwnerLookupFailure.unreadable)),
      );
    });
  }
  test('unknown status rejected', () async {
    await expectLater(
      client(
        reply(payload()..['permit_status'] = 'invented'),
      ).lookup('SYNTHETIC'),
      throwsA(fails(OwnerLookupFailure.unreadable)),
    );
  });
  for (final e in {
    404: OwnerLookupFailure.notFound,
    429: OwnerLookupFailure.throttled,
    503: OwnerLookupFailure.unavailable,
    500: OwnerLookupFailure.server,
    502: OwnerLookupFailure.server,
    400: OwnerLookupFailure.unreadable,
    302: OwnerLookupFailure.unreadable,
  }.entries) {
    test('HTTP ${e.key} safe error, no retry', () async {
      final f = reply({
        'detail': 'PRIVATE_CODE https://private.invalid',
      }, e.key);
      await expectLater(
        client(f).lookup('PRIVATE_CODE'),
        throwsA(fails(e.value)),
      );
      expect(
        ownerLookupErrorMessage(OwnerLookupException(e.value)),
        isNot(contains('PRIVATE')),
      );
      expect(f.calls, 1);
    });
  }
  test('network failure sanitized', () async {
    final f = Fake(Future.error(StateError('PRIVATE_CODE')));
    await expectLater(
      client(f).lookup('PRIVATE_CODE'),
      throwsA(fails(OwnerLookupFailure.connection)),
    );
    expect(f.calls, 1);
    expect(
      ownerLookupErrorMessage(StateError('PRIVATE_CODE')),
      isNot(contains('PRIVATE')),
    );
  });
  test('timeout aborts; late completion cannot replace failure', () async {
    final pending = Completer<OwnerLookupResponse>();
    final f = Fake(pending.future);
    await expectLater(
      client(f, timeout: const Duration(milliseconds: 5)).lookup('SYNTHETIC'),
      throwsA(fails(OwnerLookupFailure.connection)),
    );
    expect(f.aborts, 1);
    pending.complete(OwnerLookupResponse(200, jsonEncode(payload())));
    await Future<void>.delayed(Duration.zero);
    expect(f.calls, 1);
  });
  test('invalid JSON safe error', () async {
    await expectLater(
      client(
        Fake(Future.value(const OwnerLookupResponse(200, 'PRIVATE malformed'))),
      ).lookup('SYNTHETIC'),
      throwsA(fails(OwnerLookupFailure.unreadable)),
    );
  });
  test('zero timeout rejected', () {
    expect(
      () => client(reply(payload()), timeout: Duration.zero),
      throwsA(fails(OwnerLookupFailure.configuration)),
    );
  });
}
