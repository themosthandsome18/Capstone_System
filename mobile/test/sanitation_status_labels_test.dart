// A never-inspected establishment must read as "Not Yet Inspected" with a
// neutral colour, and the app must survive any status value it does not know.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

void main() {
  group('sanitationStatusLabel', () {
    test('names the never-inspected status', () {
      expect(sanitationStatusLabel('not_yet_inspected'), 'Not Yet Inspected');
    });

    test('keeps the existing statuses unchanged', () {
      expect(sanitationStatusLabel('good_standing'), 'Good Standing');
      expect(sanitationStatusLabel('violation'), 'Violation');
      expect(sanitationStatusLabel('no_permit'), 'No Permit');
    });

    test('falls back without throwing on an unknown value', () {
      expect(sanitationStatusLabel('something_new'), 'something_new');
      expect(sanitationStatusLabel(''), 'Pending');
    });
  });

  group('sanitationStatusColor', () {
    test('gives the never-inspected status a neutral colour', () {
      final colour = sanitationStatusColor('not_yet_inspected');

      expect(colour, AppColors.muted);
      expect(colour, isNot(AppColors.green));
      expect(colour, isNot(Colors.red));
    });

    test('keeps the existing colours unchanged', () {
      expect(sanitationStatusColor('good_standing'), AppColors.green);
      expect(sanitationStatusColor('violation'), Colors.red);
    });

    test('falls back without throwing on an unknown value', () {
      expect(sanitationStatusColor('something_new'), AppColors.muted);
    });
  });

  group('SanitationEstablishment', () {
    test('parses the never-inspected status and its label', () {
      final record = SanitationEstablishment.fromJson({
        'id': 1,
        'business_name': 'Brand New',
        'compliance_status': 'not_yet_inspected',
        'compliance_status_label': 'Not Yet Inspected',
      });

      expect(record.complianceStatus, 'not_yet_inspected');
      expect(record.statusLabel, 'Not Yet Inspected');
    });

    test('uses the server label even for a status it does not know', () {
      // This is why an already-distributed APK stays readable.
      final record = SanitationEstablishment.fromJson({
        'id': 2,
        'business_name': 'Future Status',
        'compliance_status': 'invented_later',
        'compliance_status_label': 'Invented Later',
      });

      expect(record.statusLabel, 'Invented Later');
    });
  });
}
