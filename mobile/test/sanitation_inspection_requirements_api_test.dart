import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, Object?> establishment() => {
  'id': 71,
  'business_type': 8,
  'permit_size': 'sp',
};
Map<String, Object?> requirement(
  int id, {
  String size = 'sp',
  bool required = true,
}) => {
  'id': id,
  'business_type': 8,
  'permit_size': size,
  'requirement_name': '  Synthetic requirement $id  ',
  'is_required': required,
};
List<Object?> catalogue() => [
  {
    'id': 9,
    'requirements': [requirement(99)..['business_type'] = 9],
  },
  {
    'id': 8,
    'requirements': [
      requirement(3),
      requirement(1, size: 'large'),
      requirement(2, required: false),
    ],
  },
];
Future<InspectionRequirementsResult> load({
  String? expected = 'synthetic-A',
  int id = 71,
}) => const TourismApi().fetchInspectionRequirements(
  id,
  expectedSessionToken: expected,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'synthetic-A',
    }),
  );

  Future<InspectionRequirementsResult> responses(
    Object? detail,
    Object? types,
  ) async {
    final paths = <String>[];
    final client = MockClient((request) async {
      paths.add(request.url.path);
      expect(request.method, 'GET');
      expect(request.headers['authorization'], 'Token synthetic-A');
      return http.Response(jsonEncode(paths.length == 1 ? detail : types), 200);
    });
    try {
      final result = await http.runWithClient(() => load(), () => client);
      expect(paths.first, '/api/sanitation/establishments/71/');
      expect(paths.every((p) => !p.contains('bootstrap')), isTrue);
      return result;
    } finally {
      client.close();
    }
  }

  test(
    'authenticated endpoints preserve exact IDs, order, names and optional metadata',
    () async {
      final requests = <http.Request>[];
      final client = MockClient((r) async {
        requests.add(r);
        return http.Response(
          jsonEncode(requests.length == 1 ? establishment() : catalogue()),
          200,
        );
      });
      final r = await http.runWithClient(() => load(), () => client);
      client.close();
      expect(requests.map((r) => r.url.path), [
        '/api/sanitation/establishments/71/',
        '/api/sanitation/business-types/',
      ]);
      expect(
        requests.every(
          (r) =>
              r.method == 'GET' &&
              r.headers['authorization'] == 'Token synthetic-A',
        ),
        isTrue,
      );
      expect(r.status.name, 'ready');
      expect(r.context!.establishmentId, 71);
      expect(r.context!.businessTypeId, 8);
      expect(r.context!.permitSize, 'sp');
      expect(r.context!.requirements.map((dynamic x) => x.id).toList(), [3, 2]);
      expect(
        r.context!.requirements.map((dynamic x) => x.isRequired).toList(),
        [true, false],
      );
      expect(
        r.context!.requirements.first.requirementName,
        '  Synthetic requirement 3  ',
      );
      expect(
        r.context!.requirements.every(
          (dynamic x) => x.businessTypeId == 8 && x.permitSize == 'sp',
        ),
        isTrue,
      );
      expect(() => r.context!.requirements.clear(), throwsUnsupportedError);
    },
  );

  test(
    'large applicability never substitutes SP rows or another business type',
    () async {
      final r = await responses(
        establishment()..['permit_size'] = 'large',
        catalogue(),
      );
      expect(r.status.name, 'ready');
      expect(r.context!.requirements.map((dynamic x) => x.id).toList(), [1]);
    },
  );
  test('empty selected type is valid unconfigured, not failure', () async {
    final r = await responses(establishment(), [
      {'id': 8, 'requirements': []},
    ]);
    expect(r.status.name, 'unconfigured');
    expect(r.context!.requirements, isEmpty);
    expect(r.failure, isNull);
  });
  test(
    'no matching size is unconfigured without cross-size substitution',
    () async {
      final r = await responses(establishment(), [
        {
          'id': 8,
          'requirements': [requirement(1, size: 'large')],
        },
      ]);
      expect(r.status.name, 'unconfigured');
      expect(r.context!.requirements, isEmpty);
    },
  );

  for (final key in ['id', 'business_type', 'permit_size']) {
    test('missing establishment $key is a contract failure', () async {
      final r = await responses(establishment()..remove(key), catalogue());
      expect(r.status.name, 'failure');
      expect(r.failure!.name, 'contract');
      expect(r.context, isNull);
    });
  }
  for (final entry in {
    'id': 72,
    'business_type': '8',
    'permit_size': 'small',
  }.entries) {
    test('invalid establishment ${entry.key} is not defaulted', () async {
      final r = await responses(
        establishment()..[entry.key] = entry.value,
        catalogue(),
      );
      expect(r.status.name, 'failure');
      expect(r.failure!.name, 'contract');
    });
  }
  for (final key in [
    'id',
    'business_type',
    'permit_size',
    'requirement_name',
    'is_required',
  ]) {
    test('missing requirement $key is a contract failure', () async {
      final r = await responses(establishment(), [
        {
          'id': 8,
          'requirements': [requirement(1)..remove(key)],
        },
      ]);
      expect(r.status.name, 'failure');
      expect(r.failure!.name, 'contract');
      expect(r.context, isNull);
    });
  }
  for (final entry in {
    'id': 0,
    'business_type': 9,
    'permit_size': 'unknown',
    'requirement_name': ' ',
    'is_required': 'true',
  }.entries) {
    test('invalid requirement ${entry.key} is rejected', () async {
      final r = await responses(establishment(), [
        {
          'id': 8,
          'requirements': [requirement(1)..[entry.key] = entry.value],
        },
      ]);
      expect(r.status.name, 'failure');
      expect(r.failure!.name, 'contract');
    });
  }
  for (final types in <Object?>[
    null,
    {},
    [],
    [
      {'id': 8},
    ],
    [
      {'id': 8, 'requirements': null},
    ],
    [
      {'id': 8, 'requirements': {}},
    ],
    [
      {'id': 9, 'requirements': []},
    ],
    [
      {
        'id': 8,
        'requirements': [null],
      },
    ],
  ]) {
    test(
      'missing/malformed catalogue is never a successful empty list: $types',
      () async {
        final r = await responses(establishment(), types);
        expect(r.status.name, 'failure');
        expect(r.failure!.name, 'contract');
        expect(r.context, isNull);
      },
    );
  }
  test('duplicate IDs are rejected instead of silently merged', () async {
    for (final types in [
      [
        {
          'id': 8,
          'requirements': [requirement(1), requirement(1)],
        },
      ],
      [
        {'id': 8, 'requirements': []},
        {'id': 8, 'requirements': []},
      ],
    ]) {
      final r = await responses(establishment(), types);
      expect(r.failure!.name, 'contract');
    }
  });
  for (final endpoint in [0, 1]) {
    for (final code in [401, 403, 404, 503]) {
      test(
        'HTTP $code at endpoint $endpoint remains a typed failure with no fallback',
        () async {
          var count = 0;
          final client = MockClient(
            (r) async => count++ == endpoint
                ? http.Response('{}', code)
                : http.Response(jsonEncode(establishment()), 200),
          );
          final r = await http.runWithClient(() => load(), () => client);
          client.close();
          expect(r.status.name, 'failure');
          expect(r.httpStatus, code);
          expect(r.context, isNull);
          expect(count, endpoint + 1);
        },
      );
    }
  }
  test('missing or changed session blocks before any HTTP', () async {
    var calls = 0;
    final client = MockClient((r) async {
      calls++;
      return http.Response('{}', 200);
    });
    final prefs = await SharedPreferences.getInstance();
    await http.runWithClient(() async {
      await prefs.remove(staffAuthTokenKey);
      expect((await load(expected: null)).failure!.name, 'unauthenticated');
      await prefs.setString(staffAuthTokenKey, 'synthetic-B');
      expect((await load()).failure!.name, 'sessionChanged');
    }, () => client);
    client.close();
    expect(calls, 0);
  });
  test(
    'session change during either GET rejects old data and preserves new token',
    () async {
      for (final endpoint in [0, 1]) {
        SharedPreferences.setMockInitialValues({
          staffAuthTokenKey: 'synthetic-A',
        });
        var count = 0;
        final prefs = await SharedPreferences.getInstance();
        final client = MockClient((r) async {
          if (count++ == endpoint) {
            await prefs.setString(staffAuthTokenKey, 'synthetic-B');
          }
          return http.Response(
            jsonEncode(count == 1 ? establishment() : catalogue()),
            200,
          );
        });
        final r = await http.runWithClient(() => load(), () => client);
        client.close();
        expect(r.failure!.name, 'sessionChanged');
        expect(r.context, isNull);
        expect(count, endpoint + 1);
        expect(prefs.getString(staffAuthTokenKey), 'synthetic-B');
      }
    },
  );
  test('network and malformed JSON errors are not unconfigured', () async {
    for (final invalidJson in [true, false]) {
      final client = MockClient((r) async {
        if (!invalidJson) throw http.ClientException('synthetic');
        return http.Response('not json', 200);
      });
      final r = await http.runWithClient(() => load(), () => client);
      client.close();
      expect(r.status.name, 'failure');
      expect(r.failure!.name, invalidJson ? 'contract' : 'retrieval');
    }
  });
  test('invalid target ID sends no request', () async {
    final r = await load(id: 0);
    expect(r.failure!.name, 'contract');
  });
}
