import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_formatting.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_models.dart';

void main() {
  test(
    'const constructors preserve supplied owner values and requirement identity',
    () {
      const requirement = OwnerRequirementItem(
        name: 'Water test',
        submitted: true,
      );
      const requirements = [requirement];
      const status = OwnerPermitStatus(
        businessName: '  Synthetic business  ',
        businessType: 'Food establishment',
        barangay: 'Synthetic barangay',
        permitNumber: 'SP-LOCAL',
        permitStatus: 'active',
        permitStatusLabel: 'Active',
        permitExpiryDate: '2026-11-11',
        daysLeft: 1,
        isExpired: false,
        renewalNotice: 'Renew locally',
        expiredNotice: null,
        suspendedNotice: null,
        requirements: requirements,
        requirementsNote: null,
      );
      expect(status.businessName, '  Synthetic business  ');
      expect(status.businessType, 'Food establishment');
      expect(status.barangay, 'Synthetic barangay');
      expect(status.permitNumber, 'SP-LOCAL');
      expect(status.permitStatus, 'active');
      expect(status.permitStatusLabel, 'Active');
      expect(status.permitExpiryDate, '2026-11-11');
      expect(status.daysLeft, 1);
      expect(status.isExpired, isFalse);
      expect(status.renewalNotice, 'Renew locally');
      expect(status.expiredNotice, isNull);
      expect(status.suspendedNotice, isNull);
      expect(status.requirementsNote, isNull);
      expect(identical(status.requirements, requirements), isTrue);
      expect(identical(status.requirements.single, requirement), isTrue);
    },
  );

  test('JSON parsing trims and coerces text without changing server meaning', () {
    final status = OwnerPermitStatus.fromJson({
      'business_name': '  Synthetic business  ',
      'business_type': ' Shop ',
      'barangay': ' Synthetic barangay ',
      'permit_number': 123,
      'permit_status': ' suspended ',
      'permit_status_label': ' Suspended ',
      'permit_expiry_date': ' 2026-11-11 ',
      'days_left': '-2',
      'is_expired': true,
      'renewal_notice': ' Renew ',
      'expired_notice': ' Expired ',
      'suspended_notice': ' Contact the office ',
      'requirements_note': ' Bring documents ',
      'requirements': [
        {'name': ' Certificate ', 'submitted': true},
      ],
    });
    expect(status.businessName, 'Synthetic business');
    expect(status.businessType, 'Shop');
    expect(status.barangay, 'Synthetic barangay');
    expect(status.permitNumber, '123');
    expect(status.permitStatus, 'suspended');
    expect(status.permitStatusLabel, 'Suspended');
    expect(status.permitExpiryDate, '2026-11-11');
    expect(status.daysLeft, -2);
    expect(status.isExpired, isTrue);
    expect(status.renewalNotice, 'Renew');
    expect(status.expiredNotice, 'Expired');
    expect(status.suspendedNotice, 'Contact the office');
    expect(status.requirementsNote, 'Bring documents');
    // Requirement names deliberately retain their existing whitespace behavior.
    expect(status.requirements.single.name, ' Certificate ');
  });

  test('missing and blank optional JSON fields retain their defaults', () {
    for (final json in <Map<String, dynamic>>[
      {},
      {
        'business_name': null,
        'business_type': ' ',
        'barangay': null,
        'permit_number': ' ',
        'permit_status': null,
        'permit_status_label': ' ',
        'permit_expiry_date': null,
        'renewal_notice': null,
        'expired_notice': ' ',
        'suspended_notice': null,
        'requirements_note': ' ',
        'requirements': null,
      },
    ]) {
      final status = OwnerPermitStatus.fromJson(json);
      expect(status.businessName, '');
      expect(status.businessType, '');
      expect(status.barangay, '');
      expect(status.permitStatus, '');
      expect(status.permitStatusLabel, '');
      expect(status.permitNumber, isNull);
      expect(status.permitExpiryDate, isNull);
      expect(status.daysLeft, isNull);
      expect(status.isExpired, isFalse);
      expect(status.renewalNotice, isNull);
      expect(status.expiredNotice, isNull);
      expect(status.suspendedNotice, isNull);
      expect(status.requirementsNote, isNull);
      expect(status.requirements, isEmpty);
    }
  });

  test(
    'days_left accepts integers and integer strings, not fractional values',
    () {
      for (final entry in <Object?, int?>{
        4: 4,
        0: 0,
        -1: -1,
        '45': 45,
        '-3': -3,
        null: null,
        '': null,
        'unknown': null,
        1.5: null,
        '1.5': null,
      }.entries) {
        expect(
          OwnerPermitStatus.fromJson({'days_left': entry.key}).daysLeft,
          entry.value,
          reason: 'days_left=${entry.key}',
        );
      }
      expect(
        OwnerPermitStatus.fromJson({'is_expired': 'true'}).isExpired,
        isFalse,
      );
      expect(OwnerPermitStatus.fromJson({'is_expired': 1}).isExpired, isFalse);
    },
  );

  test(
    'requirement states remain true, false or neutral and non-map rows filter out',
    () {
      final status = OwnerPermitStatus.fromJson({
        'requirements': [
          {'name': 'Submitted', 'submitted': true},
          'not a requirement',
          null,
          {'name': 'Missing', 'submitted': false},
          {'name': 'Neutral', 'submitted': null},
          {'name': 'String state', 'submitted': 'true'},
          {'name': 42, 'submitted': 1},
          {},
        ],
      });
      expect(status.requirements.map((item) => item.name), [
        'Submitted',
        'Missing',
        'Neutral',
        'String state',
        '42',
        '',
      ]);
      expect(status.requirements.map((item) => item.submitted), [
        true,
        false,
        null,
        null,
        null,
        null,
      ]);
    },
  );

  test(
    'malformed requirement containers still fail rather than being repaired',
    () {
      expect(
        () => OwnerPermitStatus.fromJson({'requirements': 'not a list'}),
        throwsA(isA<TypeError>()),
      );
      expect(
        () => OwnerPermitStatus.fromJson({
          'requirements': [
            {1: 'not a string key'},
          ],
        }),
        throwsA(isA<TypeError>()),
      );
    },
  );

  test(
    'tracking normalization removes whitespace, capitalizes and preserves dashes',
    () {
      expect(normalizeOwnerTrackingCode('  mbn 7kq4 - xp2m '), 'MBN7KQ4-XP2M');
      expect(normalizeOwnerTrackingCode('\tmbn-7kq4\nxp2m\r'), 'MBN-7KQ4XP2M');
      expect(normalizeOwnerTrackingCode('MBN-7KQ4-XP2M'), 'MBN-7KQ4-XP2M');
      expect(normalizeOwnerTrackingCode(' \t\n '), '');
      // Filtering punctuation is the widget's job, not this pure helper's job.
      expect(normalizeOwnerTrackingCode('mbn-!'), 'MBN-!');
    },
  );

  test('missing and invalid expiry values preserve No date', () {
    for (final date in <String?>[null, '', 'not-a-date']) {
      expect(ownerExpiryText(date, 45), 'No date');
    }
  });

  test(
    'expiry wording preserves date, today and past/future singulars and plurals',
    () {
      const date = '2026-11-11';
      expect(ownerExpiryText(date, null), 'Nov 11, 2026');
      expect(ownerExpiryText(date, 0), 'Nov 11, 2026 · today');
      expect(ownerExpiryText(date, 1), 'Nov 11, 2026 · 1 day');
      expect(ownerExpiryText(date, 45), 'Nov 11, 2026 · 45 days');
      expect(ownerExpiryText(date, -1), 'Nov 11, 2026 · 1 day ago');
      expect(ownerExpiryText(date, -2), 'Nov 11, 2026 · 2 days ago');
      // The server-supplied day count is authoritative; no local-clock calculation.
      expect(ownerExpiryText('2000-01-01', 4), 'Jan 1, 2000 · 4 days');
      expect(ownerExpiryText('2026-12-31', null), 'Dec 31, 2026');
    },
  );
}
