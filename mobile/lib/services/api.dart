part of '../main.dart';

/// What the user is told when the bootstrap fails. They see two answers only:
/// the connection (timeout, network) or the server (a bad status, or an
/// answer the app cannot read).
enum BootstrapFailureKind { timeout, network, server }

BootstrapFailureKind classifyBootstrapFailure(Object error) {
  if (error is TimeoutException) return BootstrapFailureKind.timeout;
  if (error is ApiException || error is FormatException) {
    return BootstrapFailureKind.server;
  }
  return BootstrapFailureKind.network;
}

const _unreadableResponse = 'The server sent a response the app could not read.';

/// The bootstrap as the server sent it: the JSON text, and a time in epoch
/// milliseconds. Public data only (destinations, reference lists, barangays,
/// public notices, theme colours); there is no visitor record in it.
const tourismBootstrapCacheKey = 'tourism_bootstrap_v1';
const tourismBootstrapSavedAtKey = 'tourism_bootstrap_saved_at';

/// A saved copy older than this is not used at all. The app still asks the
/// server on every launch; this only bounds how stale a copy can be when the
/// server cannot be reached (notices are time-sensitive).
const tourismBootstrapCacheMaxAge = Duration(days: 7);

/// Reads bootstrap JSON text into the model. Anything that is not a JSON
/// object the model can read is an [ApiException], whoever it came from.
MobileBootstrap parseBootstrapRaw(String raw) {
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) throw const FormatException();
    return MobileBootstrap.fromJson(decoded);
  } catch (_) {
    throw const ApiException(statusCode: 200, message: _unreadableResponse);
  }
}

class CachedBootstrap {
  const CachedBootstrap(this.bootstrap, this.savedAt, this.age);

  final MobileBootstrap bootstrap;
  final DateTime savedAt;
  final Duration age;
}

class TourismBootstrapCache {
  const TourismBootstrapCache();

  /// The saved copy, or null when there is none, it is older than
  /// [tourismBootstrapCacheMaxAge], or it cannot be read (a bad copy is
  /// thrown away). Never throws.
  Future<CachedBootstrap?> read({DateTime? now}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(tourismBootstrapCacheKey);
      final savedMs = prefs.getInt(tourismBootstrapSavedAtKey);
      if (raw == null || savedMs == null) return null;
      final savedAt = DateTime.fromMillisecondsSinceEpoch(savedMs);
      final age = (now ?? DateTime.now()).difference(savedAt);
      if (age.isNegative || age > tourismBootstrapCacheMaxAge) {
        await _discard(prefs);
        return null;
      }
      try {
        return CachedBootstrap(parseBootstrapRaw(raw), savedAt, age);
      } catch (_) {
        await _discard(prefs);
        return null;
      }
    } catch (_) {
      return null;
    }
  }

  /// Saves [raw] (the response text, already known to parse). Never throws.
  Future<void> write(String raw, {DateTime? now}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(tourismBootstrapCacheKey, raw);
      await prefs.setInt(
        tourismBootstrapSavedAtKey,
        (now ?? DateTime.now()).millisecondsSinceEpoch,
      );
    } catch (_) {
      // A cache that cannot be written is just no cache.
    }
  }

  Future<void> _discard(SharedPreferences prefs) async {
    await prefs.remove(tourismBootstrapCacheKey);
    await prefs.remove(tourismBootstrapSavedAtKey);
  }
}

class TourismApi {
  const TourismApi();
  static const Duration _requestTimeout = Duration(seconds: 90);
  static const Duration _uploadTimeout = Duration(seconds: 120);

  /// The response text, for the cache. Throws on any failure (a bad status,
  /// or a body that is not a JSON object); the caller turns that into a state.
  Future<String> fetchBootstrapRaw() async {
    final response = await http
        .get(Uri.parse('$apiBaseUrl/mobile/tourism/bootstrap/'))
        .timeout(_requestTimeout);
    _decode(response);
    return response.body.isEmpty ? '{}' : response.body;
  }

  /// Throws on any failure; the caller turns that into a `failed` state.
  Future<MobileBootstrap> fetchBootstrap() async =>
      parseBootstrapRaw(await fetchBootstrapRaw());

  Future<Map<String, dynamic>> fetchDestinationDetail(int resortId) async {
    return _get('/mobile/tourism/destinations/$resortId/');
  }

  Future<Map<String, dynamic>> registerTourist({
    required String fullName,
    required String email,
    required String password,
    String? username,
    String? contactNumber,
  }) async {
    return _post('/mobile/tourism/register/', {
      'full_name': fullName.trim(),
      'email': email.trim(),
      'password': password,
      if (username != null && username.trim().isNotEmpty)
        'username': username.trim(),
      if (contactNumber != null && contactNumber.trim().isNotEmpty)
        'contact_number': contactNumber.trim(),
    });
  }

  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
  }) async {
    return _post('/auth/login/', {
      'username': username.trim(),
      'password': password,
    });
  }

  Future<SanitationBootstrap> fetchSanitationBootstrap() async {
    try {
      final data = await _get('/mobile/sanitation/bootstrap/');
      return SanitationBootstrap.fromJson(data);
    } catch (error) {
      debugPrint('Sanitation bootstrap failed: $error');
      return SanitationBootstrap.fallback(
        message: 'Connection failed. Please ensure the backend server is running.',
      );
    }
  }

  /// Current sanitation staff identity using the existing authenticated session.
  Future<Map<String, dynamic>> fetchSanitationStaffIdentity({
    String? expectedSessionToken,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final activeToken = prefs.getString(staffAuthTokenKey);
    if (expectedSessionToken != null && activeToken != expectedSessionToken) {
      throw const ApiException(
        statusCode: 409,
        message: 'Staff session changed. Reopen the inspection form.',
      );
    }
    final token = expectedSessionToken ?? activeToken;
    if (token == null || token.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        message: 'Your session expired, please sign in again.',
      );
    }
    return _getWithQuery(
      '/auth/me/',
      const {},
      headers: {'Authorization': 'Token $token'},
    );
  }

  /// Staff-only sanitation records (establishments, inspections, complaints,
  /// households, staff notifications). Requires a signed-in admin or
  /// sanitation account; throws [ApiException] (401/403) otherwise.
  Future<Map<String, dynamic>> fetchSanitationStaffRecords() async {
    final token = await _getStaffAuthToken();
    if (token == null || token.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        message: 'Your session expired, please sign in again.',
      );
    }
    return _getWithQuery(
      '/mobile/sanitation/staff-bootstrap/',
      const {},
      headers: {'Authorization': 'Token $token'},
    );
  }

  Future<Map<String, dynamic>> fetchSanitationPendingComplaints() async {
    return _getWithQuery('/sanitation/complaints/', {'status': 'pending'},
        headers: await _sanitationDashboardHeaders());
  }

  /// This endpoint returns an uncapped JSON array, unlike the shared object decoder.
  Future<List<Map<String, dynamic>>> fetchSanitationDashboardInspections() async {
    final response = await http.get(
      Uri.parse('$apiBaseUrl/sanitation/inspections/'),
      headers: await _sanitationDashboardHeaders(),
    ).timeout(_requestTimeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      _decode(response); // Preserve existing ApiException/401 behavior on errors.
    }
    return sanitationDashboardRows(jsonDecode(response.body));
  }

  Future<Map<String, String>> _sanitationDashboardHeaders() async {
    final token = await _getStaffAuthToken();
    if (token == null || token.isEmpty) {
      throw const ApiException(statusCode: 401,
          message: 'Your session expired, please sign in again.');
    }
    return {'Authorization': 'Token $token'};
  }

  /// Subscribe once per load/refresh. An error has no data, never fabricated zeros.
  /// Optional staffRecords must be a successfully loaded authenticated staff payload.
  Stream<SanitationDashboardState> loadSanitationDashboard({
    DateTime? now,
    Map<String, dynamic>? staffRecords,
  }) async* {
    yield const SanitationDashboardState.loading();
    try {
      final staff = staffRecords ?? await fetchSanitationStaffRecords();
      final complaints = await fetchSanitationPendingComplaints();
      final inspections = await fetchSanitationDashboardInspections();
      yield SanitationDashboardState.loaded(SanitationDashboardData.fromSources(
        staff: staff, complaints: complaints, inspections: inspections,
        now: now ?? DateTime.now(),
      ));
    } catch (error) {
      yield SanitationDashboardState.unavailable(error);
    }
  }

  Future<List<MobileSanitationReceipt>> fetchSanitationReportHistory({
    required String contact,
    required String reference,
  }) async {
    final data = await _getWithQuery('/mobile/sanitation/reports/history/', {
      if (contact.trim().isNotEmpty) 'contact': contact.trim(),
      if (reference.trim().isNotEmpty) 'reference': reference.trim(),
    });
    return parseList(data['rows'], MobileSanitationReceipt.fromJson);
  }

  /// Establishment Portal: the owner's permit status by private tracking code.
  /// No login; nothing is stored on the phone.
  Future<OwnerPermitStatus> fetchOwnerPermitStatus(String code) async {
    final data = await _post('/mobile/sanitation/establishment-status/', {
      'code': code,
    });
    return OwnerPermitStatus.fromJson(data);
  }

  Future<PermitVerificationResult> verifySanitaryPermit(String code) async {
    final data = await _getWithQuery('/mobile/sanitation/permits/verify/', {
      'code': code.trim(),
    });
    return PermitVerificationResult.fromJson(data);
  }

  Future<Map<String, dynamic>> lookupTouristRecord(String query) async {
    final token = await _getStaffAuthToken();
    return _getWithQuery(
      '/mobile/tourism/records/lookup/',
      {'query': query.trim()},
      headers: (token != null && token.isNotEmpty)
          ? {'Authorization': 'Token $token'}
          : null,
    );
  }

  Future<Map<String, dynamic>> checkInTouristRecord(Map<String, dynamic> payload) async {
    final token = await _getStaffAuthToken();
    return _post(
      '/mobile/tourism/records/check-in/',
      payload,
      headers: (token != null && token.isNotEmpty)
          ? {'Authorization': 'Token $token'}
          : null,
    );
  }

  Future<List<Map<String, dynamic>>> fetchTouristRecordHistory({
    String? search,
    int? resortId,
  }) async {
    final token = await _getStaffAuthToken();
    final data = await _getWithQuery(
      '/mobile/tourism/records/history/',
      {
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (resortId != null) 'resort_id': resortId.toString(),
      },
      headers: (token != null && token.isNotEmpty)
          ? {'Authorization': 'Token $token'}
          : null,
    );
    return (data['records'] as List? ?? []).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> registerVisit({
    required String firstName,
    required String lastName,
    String? fullName,
    required String contactNumber,
    required String email,
    required bool consentConfirmed,
    required String arrivalDate,
    required int countryId,
    // Null for a foreign visitor: the server accepts a record without them.
    int? regionId,
    int? provinceId,
    required String countryOfOrigin,
    required int resortId,
    required int itineraryId,
    required int travelModeId,
    required int boatTypeId,
    required String boatCapacityFare,
    required String parkingSpace,
    required int visitPurposeId,
    required int totalVisitors,
    required int totalMale,
    required int totalFemale,
    required int filipinoCount,
    required int maubaninCount,
    required int foreignerCount,
    required int specialGroupCount,
    // The people who pay the discounted entrance fee (see
    // suggestedDiscountedCount). Without it the server saves 0 and charges
    // every visitor the regular fee.
    required int discountedCount,
    required int age0To7,
    required int age8To59,
    required int age60Above,
  }) {
    final computedFullName = (fullName != null && fullName.trim().isNotEmpty)
        ? fullName.trim()
        : '$firstName $lastName'.trim();

    return _post('/mobile/tourism/register-visit/', {
      'first_name': firstName.trim(),
      'last_name': lastName.trim(),
      'full_name': computedFullName,
      'contact_number': contactNumber,
      'email': email,
      'consent_confirmed': consentConfirmed,
      'arrival_date': arrivalDate,
      'country_id': countryId,
      // Left out, not sent as null, when there is none (a foreign visitor).
      'region_id': ?regionId,
      'province_id': ?provinceId,
      'country_of_origin': countryOfOrigin,
      'resort_id': resortId,
      'itinerary_id': itineraryId,
      'travel_mode_id': travelModeId,
      'boat_type_id': boatTypeId,
      'boat_capacity_fare': boatCapacityFare,
      'parking_space': parkingSpace,
      'visit_purpose_id': visitPurposeId,
      'total_visitors': totalVisitors,
      'total_male': totalMale,
      'total_female': totalFemale,
      'filipino_count': filipinoCount,
      'maubanin_count': maubaninCount,
      'foreigner_count': foreignerCount,
      'special_group_count': specialGroupCount,
      'discounted_count': discountedCount,
      'age_0_7': age0To7,
      'age_8_59': age8To59,
      'age_60_above': age60Above,
    });
  }

  Future<Map<String, dynamic>> submitFeedback({
    required int destinationId,
    required String reviewer,
    required int rating,
    required String message,
    required int cleanlinessRating,
    required String sanitationComment,
    List<XFile> photos = const [],
  }) {
    final fields = {
      'destination_id': '$destinationId',
      'reviewer': reviewer,
      'rating': '$rating',
      'message': message,
      'cleanliness_rating': '$cleanlinessRating',
      'sanitation_comment': sanitationComment,
    };

    if (photos.isNotEmpty) {
      return _multipartPost('/mobile/tourism/feedback/', fields, photos);
    }

    return _post('/mobile/tourism/feedback/', fields);
  }

  Future<Map<String, dynamic>> submitSanitationReport({
    required String name,
    required String contactNumber,
    required String category,
    required String priority,
    required String barangay,
    required String locationAddress,
    required String description,
    List<XFile> photos = const [],
    required String latitude,
    required String longitude,
    String clientSubmissionId = '',
  }) {
    final fields = {
      'complainant_name': name,
      'contact_number': contactNumber,
      'category': category,
      'priority': priority,
      'barangay': barangay,
      'location_address': locationAddress,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
      if (clientSubmissionId.isNotEmpty) 'client_submission_id': clientSubmissionId,
    };

    if (photos.isNotEmpty) {
      return _multipartPost('/mobile/sanitation/reports/', fields, photos);
    }

    return _post('/mobile/sanitation/reports/', fields);
  }

  Future<Map<String, dynamic>> submitSanitationReportDraft(
    SanitationReportDraft draft,
  ) {
    return submitSanitationReport(
      name: draft.name,
      contactNumber: normalizePhMobileNumber(draft.contactNumber),
      category: draft.category,
      priority: draft.priority,
      barangay: draft.barangay,
      locationAddress: draft.address,
      description: draft.description,
      latitude: draft.latitude,
      longitude: draft.longitude,
    );
  }

  Future<Map<String, dynamic>> submitHouseholdSurvey({
    HouseholdSanitationItem? originalHousehold,
    String? householdCode,
    String? septicTankType,
    required String householdHead,
    required String barangay,
    required String address,
    String? houseNumber,
    String? sitio,
    required int maleCount,
    required int femaleCount,
    required String toiletType,
    required String waterLevel,
    required String waterSource,
    required String wasteDisposal,
    required String latitude,
    required String longitude,
  }) async {
    final body = <String, dynamic>{
      'household_head': householdHead,
      'barangay': barangay,
      'address': address,
      'house_number': ?houseNumber,
      'sitio': ?sitio,
      'male_count': maleCount,
      'female_count': femaleCount,
      'toilet_type': toiletType,
      if ((toiletType == 'water_sealed' || toiletType == 'pour_flush') &&
          septicTankType != null)
        'septic_tank_type': septicTankType,
      'water_level': waterLevel,
      'water_source': waterSource,
      'waste_disposal': wasteDisposal,
      // Omit remarks: updates must preserve notes entered through the web.
      'latitude': latitude,
      'longitude': longitude,
    };
    if (householdCode != null) {
      body['household_code'] = householdCode;
    }
    final token = await _getStaffAuthToken();
    if (originalHousehold != null) {
      final problem = originalHousehold.editIncompatibility;
      if (problem != null || householdCode != originalHousehold.householdCode) {
        throw StateError(
          'Cannot safely edit household: ${problem ?? 'household_code differs'}',
        );
      }
      final stored = originalHousehold.surveyValues!;
      // The mobile POST endpoint inserts defaults even for omitted fields.
      // Existing records use the existing partial-update contract instead.
      final changes = <String, dynamic>{};
      for (final entry in body.entries) {
        final value = entry.key == 'latitude' || entry.key == 'longitude'
            ? double.parse(entry.value as String)
            : entry.value;
        if (value != stored[entry.key]) changes[entry.key] = value;
      }
      if (changes.isEmpty) return {...stored, 'status': originalHousehold.status};
      final response = await http.patch(
        Uri.parse('$apiBaseUrl/households/records/${stored['id']}/'),
        headers: {
          'Content-Type': 'application/json',
          if (token != null && token.isNotEmpty) 'Authorization': 'Token $token',
        },
        body: jsonEncode(changes),
      ).timeout(_requestTimeout);
      return _decode(response);
    }
    return _post(
      '/mobile/sanitation/household-surveys/',
      body,
      headers: (token != null && token.isNotEmpty)
          ? {'Authorization': 'Token $token'}
          : null,
    );
  }

  Future<Map<String, dynamic>> submitSanitationInspection({
    String? expectedSessionToken,
    required int establishmentId,
    required String inspectorName,
    required String inspectionDate,
    required String nextDueDate,
    required String findings,
    required String remarks,
    required String statusAfterInspection,
    required List<InspectionChecklistDraft> checklistItems,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final activeToken = prefs.getString(staffAuthTokenKey);
    if (expectedSessionToken != null &&
        (expectedSessionToken.isEmpty || activeToken != expectedSessionToken)) {
      throw const ApiException(
        statusCode: 409,
        message: 'Staff session changed. Reopen the inspection form.',
      );
    }
    // No await between validation and dispatch; never substitute another session.
    final token = expectedSessionToken ?? activeToken;
    return _post(
      '/mobile/sanitation/inspections/',
      {
        'establishment': establishmentId,
        'inspector_name': inspectorName,
        'inspection_date': inspectionDate,
        'next_due_date': nextDueDate,
        'findings': findings,
        'remarks': remarks,
        'status_after_inspection': statusAfterInspection,
        'is_draft': false,
        'checklist_items': checklistItems
            .map(
              (item) => {
                'requirement_name': item.requirementName,
                'is_complied': item.isComplied,
                'notes': '',
              },
            )
            .toList(),
      },
      headers: (token != null && token.isNotEmpty)
          ? {'Authorization': 'Token $token'}
          : null,
    );
  }

  Future<String?> _getStaffAuthToken() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(staffAuthTokenKey);
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final response = await http
        .get(Uri.parse('$apiBaseUrl$path'))
        .timeout(_requestTimeout);
    return _decode(response);
  }

  Future<Map<String, dynamic>> _getWithQuery(
    String path,
    Map<String, String> query, {
    Map<String, String>? headers,
  }) async {
    final uri = Uri.parse('$apiBaseUrl$path').replace(queryParameters: query);
    final response = await http
        .get(uri, headers: headers)
        .timeout(_requestTimeout);
    return _decode(response);
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, Object?> body, {
    Map<String, String>? headers,
  }) async {
    final response = await http
        .post(
          Uri.parse('$apiBaseUrl$path'),
          headers: {
            'Content-Type': 'application/json',
            ...?headers,
          },
          body: jsonEncode(body),
        )
        .timeout(_requestTimeout);
    return _decode(response);
  }

  Future<Map<String, dynamic>> _multipartPost(
    String path,
    Map<String, String> fields,
    List<XFile> photos,
  ) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$apiBaseUrl$path'),
    );
    request.fields.addAll(fields);
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    for (var i = 0; i < photos.length; i++) {
      final photo = photos[i];
      final bytes = await photo.readAsBytes();
      final originalName = photo.name.trim();
      final ext = originalName.contains('.')
          ? originalName.split('.').last.toLowerCase()
          : 'jpg';
      final validExt = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].contains(ext)
          ? ext
          : 'jpg';
      final filename = 'report_${timestamp}_$i.$validExt';

      final mediaType = switch (validExt) {
        'png' => MediaType('image', 'png'),
        'webp' => MediaType('image', 'webp'),
        'heic' => MediaType('image', 'heic'),
        'heif' => MediaType('image', 'heif'),
        _ => MediaType('image', 'jpeg'),
      };

      request.files.add(
        http.MultipartFile.fromBytes(
          'photo',
          bytes,
          filename: filename,
          contentType: mediaType,
        ),
      );
    }

    final streamed = await request.send().timeout(_uploadTimeout);
    final response = await http.Response.fromStream(streamed).timeout(_uploadTimeout);
    return _decode(response);
  }

  Map<String, dynamic> _decode(http.Response response) {
    dynamic decoded;
    try {
      decoded = jsonDecode(response.body.isEmpty ? '{}' : response.body);
    } catch (_) {
      decoded = null;
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (decoded is Map<String, dynamic>) return decoded;
      // Not an object (or not JSON): never pass that off as an empty answer.
      throw ApiException(
        statusCode: response.statusCode,
        message: _unreadableResponse,
      );
    }

    String? errorMessage;
    if (decoded is Map<String, dynamic> && decoded['detail'] != null) {
      errorMessage = decoded['detail'].toString();
    } else if (decoded is Map<String, dynamic>) {
      final errors = decoded.entries
          .map((entry) {
            final value = entry.value;
            if (value is List) return '${entry.key}: ${value.join(', ')}';
            return '${entry.key}: $value';
          })
          .join('\n');
      if (errors.isNotEmpty) {
        errorMessage = errors;
      }
    }

    errorMessage ??= 'Request failed with status ${response.statusCode}.';

    throw ApiException(
      statusCode: response.statusCode,
      message: errorMessage,
    );
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String message;

  const ApiException({
    required this.statusCode,
    required this.message,
  });

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;

  @override
  String toString() => message;
}
