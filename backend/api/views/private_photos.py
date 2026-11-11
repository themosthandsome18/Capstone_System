"""Household-resolved private photos and shared protected response helper."""
from django.db import DatabaseError, transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.models import ROLE_ADMIN, ROLE_SANITATION, UserProfile, HouseholdSanitationRecord, HouseholdFrontPhoto
from api.services import private_photos
from api.services.household_photos import (
    HouseholdPhotoUpdateFailed, InvalidHouseholdPhoto, replace_household_photo, validated_image,
)
from api.services.private_photos import (
    InvalidPrivatePhotoKey, PrivatePhotoMissing, PrivatePhotoUnavailable,
    get_private_photo_store, validate_key,
)


def private_photo_response(request, *, resolved_key):
    user = request.user
    if not user or not user.is_authenticated or not user.is_active:
        response = JsonResponse({'detail': 'Authentication required.'}, status=401)
    else:
        role = UserProfile.objects.filter(user=user).values_list('role', flat=True).first()
        if not user.is_superuser and role not in (ROLE_ADMIN, ROLE_SANITATION):
            response = JsonResponse({'detail': 'Sanitation access required.'}, status=403)
        else:
            try:
                validate_key(resolved_key)
                data = get_private_photo_store().read(resolved_key)
                response = HttpResponse(data, content_type='image/png' if resolved_key.endswith('.png') else 'image/jpeg')
                response['Content-Disposition'] = 'inline; filename="front-photo.' + ('png' if resolved_key.endswith('.png') else 'jpg') + '"'
            except (InvalidPrivatePhotoKey, PrivatePhotoMissing):
                response = JsonResponse({'detail': 'Photo not found.'}, status=404)
            except PrivatePhotoUnavailable:
                response = JsonResponse({'detail': 'Private photo storage unavailable.'}, status=503)
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    response['Cross-Origin-Resource-Policy'] = 'same-origin'
    return response


@transaction.non_atomic_requests
@api_view(['GET', 'PUT'])
@parser_classes([MultiPartParser])
@permission_classes([IsAuthenticated])
def household_front_photo(request, household_id):
    role = UserProfile.objects.filter(user=request.user).values_list('role', flat=True).first()
    if not request.user.is_active or (not request.user.is_superuser and role not in (ROLE_ADMIN, ROLE_SANITATION)):
        return Response({'detail': 'Sanitation access required.'}, status=403)
    if request.query_params:
        return Response({'detail': 'Photo query parameters are not supported.'}, status=400)
    household = get_object_or_404(HouseholdSanitationRecord, pk=household_id)
    if request.method == 'GET':
        photo = HouseholdFrontPhoto.objects.filter(household=household).first()
        if photo is None:
            return Response({'detail': 'Photo not found.'}, status=404)
        return private_photo_response(request, resolved_key=photo.object_key)
    try:
        if (set(request.data) != {'photo'} or len(request.FILES.getlist('photo')) != 1
                or len(request.data.getlist('photo')) != 1):
            return Response({'detail': 'Supply exactly one photo file and no other fields.'}, status=400)
        store = private_photos.get_private_photo_store()
        data, extension = validated_image(request.FILES['photo'])
        pending = replace_household_photo(household.pk, data, extension, store)
        response = Response({'has_front_photo': True, 'cleanup_pending': pending})
    except InvalidHouseholdPhoto as error:
        response = Response({'detail': error.message}, status=error.status)
    except HouseholdPhotoUpdateFailed as error:
        response = Response({'detail': 'Photo could not be saved; the previous photo is unchanged.',
                             'cleanup_pending': error.cleanup_pending}, status=503)
    except (PrivatePhotoUnavailable, DatabaseError):
        response = Response({'detail': 'Private photo storage unavailable.'}, status=503)
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response
