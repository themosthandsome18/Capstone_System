"""Record-resolved private front photos (households, establishments) and the shared protected response helper."""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import DatabaseError, transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.models import (
    ROLE_ADMIN, ROLE_SANITATION, UserProfile, HouseholdSanitationRecord, HouseholdFrontPhoto,
    EstablishmentFrontPhoto, SanitaryEstablishment,
)
from api.services import private_photos
from api.services.establishment_photos import replace_establishment_photo
from api.services.front_photos import FrontPhotoUpdateFailed, NativeFrontPhotoUpdateFailed, InvalidFrontPhoto, validated_image
from api.services.household_photos import replace_household_photo
from api.services.private_photos import (
    InvalidPrivatePhotoKey, PrivatePhotoMissing, PrivatePhotoUnavailable,
    get_private_photo_store, validate_key,
)


def private_photo_response(request, *, resolved_photo):
    user = request.user
    if not user or not user.is_authenticated or not user.is_active:
        response = JsonResponse({'detail': 'Authentication required.'}, status=401)
    else:
        role = UserProfile.objects.filter(user=user).values_list('role', flat=True).first()
        if not user.is_superuser and role not in (ROLE_ADMIN, ROLE_SANITATION):
            response = JsonResponse({'detail': 'Sanitation access required.'}, status=403)
        else:
            try:
                # The record-resolved, persisted binding selects the provider.
                # Journal/key matches remain cleanup holds, never read routing.
                resolved_key = resolved_photo.object_key
                validate_key(resolved_key)
                if resolved_photo.storage_provider == 'S3':
                    store = get_private_photo_store()
                    private_photos.require_s3_binding(resolved_photo, private_photos.s3_target(store))
                elif resolved_photo.storage_provider == 'NATIVE':
                    if not (getattr(settings, 'SANITATION_NATIVE_PHOTO_READS_ENABLED', False) is True
                            or getattr(settings, 'SANITATION_NATIVE_PHOTO_READ_DEVELOPMENT', False) is True):
                        raise PrivatePhotoUnavailable()
                    if any(value is not None for value in
                           (resolved_photo.s3_endpoint, resolved_photo.s3_bucket, resolved_photo.s3_region)):
                        raise PrivatePhotoUnavailable()
                    resolved_photo._native_binding(using=resolved_photo._state.db)
                    from api.services.native_private_photos import get_native_create_only_store, NativePhotoConfigurationError
                    try:
                        store = get_native_create_only_store()
                    except NativePhotoConfigurationError:
                        raise PrivatePhotoUnavailable() from None
                    attempt = resolved_photo.native_attempt
                    if (attempt.project_ref, attempt.bucket) != (store.project_ref, store.bucket):
                        raise PrivatePhotoUnavailable()
                else:
                    raise PrivatePhotoUnavailable()
                data = store.read(resolved_key)
                response = HttpResponse(data, content_type='image/png' if resolved_key.endswith('.png') else 'image/jpeg')
                response['Content-Disposition'] = 'inline; filename="front-photo.' + ('png' if resolved_key.endswith('.png') else 'jpg') + '"'
            except (InvalidPrivatePhotoKey, PrivatePhotoMissing):
                response = JsonResponse({'detail': 'Photo not found.'}, status=404)
            except (PrivatePhotoUnavailable, DatabaseError, ValidationError):
                response = JsonResponse({'detail': 'Private photo storage unavailable.'}, status=503)
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    response['Cross-Origin-Resource-Policy'] = 'same-origin'
    return response


def _front_photo(request, *, owner_model, owner_id, photo_model, owner_field, replace):
    """GET/PUT one record's private front photo. Keys are always resolved server-side."""
    role = UserProfile.objects.filter(user=request.user).values_list('role', flat=True).first()
    if not request.user.is_active or (not request.user.is_superuser and role not in (ROLE_ADMIN, ROLE_SANITATION)):
        return Response({'detail': 'Sanitation access required.'}, status=403)
    if request.query_params:
        return Response({'detail': 'Photo query parameters are not supported.'}, status=400)
    owner = get_object_or_404(owner_model, pk=owner_id)
    if request.method == 'GET':
        photo = photo_model.objects.filter(**{owner_field: owner}).first()
        if photo is None:
            return Response({'detail': 'Photo not found.'}, status=404)
        return private_photo_response(request, resolved_photo=photo)
    try:
        if (set(request.data) != {'photo'} or len(request.FILES.getlist('photo')) != 1
                or len(request.data.getlist('photo')) != 1):
            return Response({'detail': 'Supply exactly one photo file and no other fields.'}, status=400)
        data, extension = validated_image(request.FILES['photo'])
        provider = getattr(settings, 'SANITATION_PHOTO_WRITE_PROVIDER', 'S3')
        if provider == 'NATIVE':
            # Development flags cannot activate uploads through normal routes.
            if getattr(settings, 'SANITATION_NATIVE_PHOTO_UPLOADS_ENABLED', False) is not True:
                raise PrivatePhotoUnavailable()
            pending = replace(owner.pk, data, extension, None,
                              native_development=True, actor=request.user)
        elif provider == 'S3':
            pending = replace(owner.pk, data, extension, private_photos.get_private_photo_store())
        else:
            raise PrivatePhotoUnavailable()
        response = Response({'has_front_photo': True, 'cleanup_pending': pending})
    except InvalidFrontPhoto as error:
        response = Response({'detail': error.message}, status=error.status)
    except NativeFrontPhotoUpdateFailed as error:
        response = Response({'detail': 'Native photo requires reconciliation; no object was deleted.',
                             'photo_outcome': error.outcome, 'cleanup_pending': True},
                            status=409 if error.outcome == 'CONFLICT' else 503)
    except FrontPhotoUpdateFailed as error:
        response = Response({'detail': 'Photo could not be saved; the previous photo is unchanged.',
                             'cleanup_pending': error.cleanup_pending}, status=503)
    except (PrivatePhotoUnavailable, DatabaseError, ValidationError):
        response = Response({'detail': 'Private photo storage unavailable.'}, status=503)
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


@transaction.non_atomic_requests
@api_view(['GET', 'PUT'])
@parser_classes([MultiPartParser])
@permission_classes([IsAuthenticated])
def household_front_photo(request, household_id):
    return _front_photo(request, owner_model=HouseholdSanitationRecord, owner_id=household_id,
                        photo_model=HouseholdFrontPhoto, owner_field='household',
                        replace=replace_household_photo)


@transaction.non_atomic_requests
@api_view(['GET', 'PUT'])
@parser_classes([MultiPartParser])
@permission_classes([IsAuthenticated])
def establishment_front_photo(request, establishment_id):
    return _front_photo(request, owner_model=SanitaryEstablishment, owner_id=establishment_id,
                        photo_model=EstablishmentFrontPhoto, owner_field='establishment',
                        replace=replace_establishment_photo)
