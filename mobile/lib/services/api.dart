part of '../main.dart';

class TourismApi {
  const TourismApi();
  static const Duration _requestTimeout = Duration(seconds: 8);

  Future<MobileBootstrap> fetchBootstrap() async {
    try {
      final data = await _get('/mobile/tourism/bootstrap/');
      return MobileBootstrap.fromJson(data);
    } catch (_) {
      return MobileBootstrap.fallback();
    }
  }

  Future<SanitationBootstrap> fetchSanitationBootstrap() async {
    try {
      final data = await _get('/mobile/sanitation/bootstrap/');
      return SanitationBootstrap.fromJson(data);
    } catch (error) {
      debugPrint('Sanitation bootstrap failed: $error');
      return SanitationBootstrap.fallback(
        message: 'Connection failed via $apiBaseUrl: ${conciseError(error)}',
      );
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

  Future<PermitVerificationResult> verifySanitaryPermit(String code) async {
    final data = await _getWithQuery('/mobile/sanitation/permits/verify/', {
      'code': code.trim(),
    });
    return PermitVerificationResult.fromJson(data);
  }

  Future<Map<String, dynamic>> registerVisit({
    required String fullName,
    required String contactNumber,
    required String email,
    required bool consentConfirmed,
    required String arrivalDate,
    required int countryId,
    required int regionId,
    required int provinceId,
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
    required int age0To7,
    required int age8To59,
    required int age60Above,
  }) {
    return _post('/mobile/tourism/register-visit/', {
      'full_name': fullName,
      'contact_number': contactNumber,
      'email': email,
      'consent_confirmed': consentConfirmed,
      'arrival_date': arrivalDate,
      'country_id': countryId,
      'region_id': regionId,
      'province_id': provinceId,
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
  }) {
    return _post('/mobile/tourism/feedback/', {
      'destination_id': destinationId,
      'reviewer': reviewer,
      'rating': rating,
      'message': message,
      'cleanliness_rating': cleanlinessRating,
      'sanitation_comment': sanitationComment,
    });
  }

  Future<Map<String, dynamic>> submitSanitationReport({
    required String name,
    required String contactNumber,
    required String category,
    required String priority,
    required String barangay,
    required String description,
    XFile? photo,
    required String latitude,
    required String longitude,
  }) {
    final fields = {
      'complainant_name': name,
      'contact_number': contactNumber,
      'category': category,
      'priority': priority,
      'barangay': barangay,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
    };

    if (photo != null) {
      return _multipartPost('/mobile/sanitation/reports/', fields, photo);
    }

    return _post('/mobile/sanitation/reports/', fields);
  }

  Future<Map<String, dynamic>> submitSanitationReportDraft(
    SanitationReportDraft draft,
  ) {
    return submitSanitationReport(
      name: draft.name,
      contactNumber: draft.contactNumber,
      category: draft.category,
      priority: draft.priority,
      barangay: draft.barangay,
      description: draft.description,
      latitude: draft.latitude,
      longitude: draft.longitude,
    );
  }

  Future<Map<String, dynamic>> submitHouseholdSurvey({
    required String householdHead,
    required String barangay,
    required String address,
    required int maleCount,
    required int femaleCount,
    required String toiletType,
    required String waterLevel,
    required String waterSource,
    required String wasteDisposal,
    required String remarks,
    required String latitude,
    required String longitude,
  }) {
    return _post('/mobile/sanitation/household-surveys/', {
      'household_head': householdHead,
      'barangay': barangay,
      'address': address,
      'male_count': maleCount,
      'female_count': femaleCount,
      'toilet_type': toiletType,
      'water_level': waterLevel,
      'water_source': waterSource,
      'waste_disposal': wasteDisposal,
      'remarks': remarks,
      'latitude': latitude,
      'longitude': longitude,
    });
  }

  Future<Map<String, dynamic>> submitSanitationInspection({
    required int establishmentId,
    required String inspectorName,
    required String inspectionDate,
    required String nextDueDate,
    required String findings,
    required String remarks,
    required String statusAfterInspection,
    required List<InspectionChecklistDraft> checklistItems,
  }) {
    return _post('/mobile/sanitation/inspections/', {
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
    });
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final response = await http
        .get(Uri.parse('$apiBaseUrl$path'))
        .timeout(_requestTimeout);
    return _decode(response);
  }

  Future<Map<String, dynamic>> _getWithQuery(
    String path,
    Map<String, String> query,
  ) async {
    final uri = Uri.parse('$apiBaseUrl$path').replace(queryParameters: query);
    final response = await http.get(uri).timeout(_requestTimeout);
    return _decode(response);
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, Object?> body,
  ) async {
    final response = await http
        .post(
          Uri.parse('$apiBaseUrl$path'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(_requestTimeout);
    return _decode(response);
  }

  Future<Map<String, dynamic>> _multipartPost(
    String path,
    Map<String, String> fields,
    XFile photo,
  ) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$apiBaseUrl$path'),
    );
    request.fields.addAll(fields);
    request.files.add(
      http.MultipartFile.fromBytes(
        'photo',
        await photo.readAsBytes(),
        filename: photo.name,
      ),
    );

    final streamed = await request.send().timeout(_requestTimeout);
    final response = await http.Response.fromStream(streamed);
    return _decode(response);
  }

  Map<String, dynamic> _decode(http.Response response) {
    final decoded = jsonDecode(response.body.isEmpty ? '{}' : response.body);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded as Map<String, dynamic>;
    }

    if (decoded is Map<String, dynamic> && decoded['detail'] != null) {
      throw Exception(decoded['detail']);
    }

    if (decoded is Map<String, dynamic>) {
      final errors = decoded.entries
          .map((entry) {
            final value = entry.value;
            if (value is List) return '${entry.key}: ${value.join(', ')}';
            return '${entry.key}: $value';
          })
          .join('\n');

      if (errors.isNotEmpty) throw Exception(errors);
    }

    throw Exception('Request failed with status ${response.statusCode}.');
  }
}
