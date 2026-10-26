import 'dart:async';
import 'dart:convert';

import 'owner_formatting.dart';
import 'owner_models.dart';

enum OwnerLookupFailure {
  configuration,
  notFound,
  throttled,
  unavailable,
  server,
  connection,
  unreadable,
}

/// Carries only a controlled category, never a response body or tracking code.
class OwnerLookupException implements Exception {
  const OwnerLookupException(this.failure);
  final OwnerLookupFailure failure;

  @override
  String toString() => ownerLookupErrorMessage(this);
}

String ownerLookupErrorMessage(Object error) {
  final failure = error is OwnerLookupException
      ? error.failure
      : OwnerLookupFailure.connection;
  return switch (failure) {
    OwnerLookupFailure.configuration || OwnerLookupFailure.unavailable =>
      "This service isn't available yet. Please try again later.",
    OwnerLookupFailure.notFound =>
      "Tracking code not found. Check the code on your Owner's Slip.",
    OwnerLookupFailure.throttled =>
      'Too many attempts. Please try again later.',
    OwnerLookupFailure.server => 'Server problem. Please try again later.',
    OwnerLookupFailure.connection =>
      'Unable to connect. Check your connection and try again.',
    OwnerLookupFailure.unreadable =>
      'Unable to read the response. Please try again later.',
  };
}

class OwnerLookupResponse {
  const OwnerLookupResponse(this.status, this.body);
  final int status;
  final String body;
}

/// A request owns its cancellation, including reading the response body.
abstract interface class OwnerLookupOperation {
  Future<OwnerLookupResponse> get response;
  void abort();
}

abstract interface class OwnerLookupTransport {
  OwnerLookupOperation post(Uri endpoint, String jsonBody);
}

class OwnerLookupClient {
  OwnerLookupClient({
    required String apiBase,
    required this.transport,
    Duration timeout = const Duration(seconds: 90),
  }) : _endpoint = _validateBase(apiBase),
       _timeout = timeout {
    if (timeout <= Duration.zero) {
      throw const OwnerLookupException(OwnerLookupFailure.configuration);
    }
  }

  final Uri _endpoint;
  final OwnerLookupTransport transport;
  final Duration _timeout;

  static Uri _validateBase(String value) {
    final uri = Uri.tryParse(value);
    final loopback =
        uri != null &&
        const {'127.0.0.1', 'localhost', '::1', '[::1]'}.contains(uri.host);
    if (uri == null ||
        value != value.trim() ||
        !uri.isAbsolute ||
        !uri.hasAuthority ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        value.contains('@') ||
        uri.hasQuery ||
        uri.hasFragment ||
        uri.path != '/api/' ||
        (uri.scheme != 'https' && !(uri.scheme == 'http' && loopback)) ||
        RegExp(r'[\s\\]').hasMatch(value)) {
      throw const OwnerLookupException(OwnerLookupFailure.configuration);
    }
    return uri.resolve('mobile/sanitation/establishment-status/');
  }

  Future<OwnerPermitStatus> lookup(String code) async {
    OwnerLookupResponse response;
    try {
      final operation = transport.post(
        _endpoint,
        jsonEncode({'code': normalizeOwnerTrackingCode(code)}),
      );
      response = await operation.response.timeout(
        _timeout,
        onTimeout: () {
          operation.abort();
          throw const OwnerLookupException(OwnerLookupFailure.connection);
        },
      );
    } catch (_) {
      throw const OwnerLookupException(OwnerLookupFailure.connection);
    }
    if (response.status != 200) {
      throw OwnerLookupException(switch (response.status) {
        404 => OwnerLookupFailure.notFound,
        429 => OwnerLookupFailure.throttled,
        503 => OwnerLookupFailure.unavailable,
        >= 500 => OwnerLookupFailure.server,
        _ => OwnerLookupFailure.unreadable,
      });
    }
    try {
      return OwnerPermitStatus.fromJson(
        _validateResponse(jsonDecode(response.body)),
      );
    } catch (_) {
      throw const OwnerLookupException(OwnerLookupFailure.unreadable);
    }
  }
}

Map<String, dynamic> _validateResponse(Object? raw) {
  if (raw is! Map<String, dynamic>) throw const FormatException();
  const strings = [
    'business_name',
    'business_type',
    'barangay',
    'permit_status',
    'permit_status_label',
  ];
  const nullableStrings = [
    'permit_number',
    'permit_expiry_date',
    'renewal_notice',
    'expired_notice',
    'suspended_notice',
    'requirements_note',
  ];
  for (final key in [
    ...strings,
    ...nullableStrings,
    'days_left',
    'is_expired',
    'requirements',
  ]) {
    if (!raw.containsKey(key)) throw const FormatException();
  }
  for (final key in strings) {
    if (raw[key] is! String) throw const FormatException();
  }
  for (final key in nullableStrings) {
    if (raw[key] != null && raw[key] is! String) throw const FormatException();
  }
  if (!const {
        'active',
        'renewal_due',
        'conditional',
        'suspended',
        'no_permit',
        'expired',
      }.contains(raw['permit_status']) ||
      (raw['permit_status_label'] as String).trim().isEmpty ||
      (raw['days_left'] != null && raw['days_left'] is! int) ||
      raw['is_expired'] is! bool ||
      raw['requirements'] is! List) {
    throw const FormatException();
  }
  final date = raw['permit_expiry_date'];
  if (date != null) {
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date as String)) {
      throw const FormatException();
    }
    final parsed = DateTime.tryParse(date);
    if (parsed == null || parsed.toIso8601String().substring(0, 10) != date) {
      throw const FormatException();
    }
  }
  final requirements = <Map<String, dynamic>>[];
  for (final item in raw['requirements'] as List) {
    if (item is! Map<String, dynamic> ||
        item['name'] is! String ||
        !item.containsKey('submitted') ||
        (item['submitted'] != null && item['submitted'] is! bool)) {
      throw const FormatException();
    }
    requirements.add({'name': item['name'], 'submitted': item['submitted']});
  }
  // Strip extras before invoking the shared, deliberately permissive model.
  return {
    for (final key in [
      ...strings,
      ...nullableStrings,
      'days_left',
      'is_expired',
    ])
      key: raw[key],
    'requirements': requirements,
  };
}
