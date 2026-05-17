from functools import wraps

from rest_framework import status
from rest_framework.response import Response

from .models import ROLE_ADMIN, ROLE_SANITATION, ROLE_TOURISM, UserProfile


MODULE_ROLES = {
    "tourism": {ROLE_ADMIN, ROLE_TOURISM},
    "sanitation": {ROLE_ADMIN, ROLE_SANITATION},
}


def get_user_role(user):
    if not user or not user.is_authenticated:
        return ""

    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"role": ROLE_ADMIN if user.is_superuser else ROLE_TOURISM},
    )
    return profile.role


def has_module_access(user, module):
    return get_user_role(user) in MODULE_ROLES.get(module, {ROLE_ADMIN})


def module_required(module):
    def decorator(view_func):
        @wraps(view_func)
        def wrapped(request, *args, **kwargs):
            if not has_module_access(request.user, module):
                return Response(
                    {"detail": "You do not have access to this module."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            return view_func(request, *args, **kwargs)

        return wrapped

    return decorator
