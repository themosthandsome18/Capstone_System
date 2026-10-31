"""Internal response helper; NOT a routed endpoint accepting caller object keys.

Future views must authenticate and resolve the key from the authorized profile.
The role check here is defense in depth; it does not establish record ownership.
"""
from django.http import HttpResponse, JsonResponse

from api.models import ROLE_ADMIN, ROLE_SANITATION, UserProfile
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
