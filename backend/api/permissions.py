from functools import wraps

from rest_framework import status
from rest_framework.response import Response

from .models import ROLE_ADMIN, ROLE_SANITATION, ROLE_TOURIST, ROLE_TOURISM, UserProfile


MODULE_ROLES = {
    "tourism": {ROLE_ADMIN, ROLE_TOURISM},
    "sanitation": {ROLE_ADMIN, ROLE_SANITATION},
}

# Who may change the tourism Administration pages: Settings (the theme), Registration Options (with Boat Capacity and Fare) and Mobile
# App Content (with the Emergency Hotlines). The Tourism Office uses them in real life, so the tourism role is in; every other role is
# out, and so is a role that does not exist yet. The web's tourism/administrationAccess.js says the same, and a test holds them together.
ADMINISTRATION_ROLES = frozenset({ROLE_ADMIN, ROLE_TOURISM})


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


def administration_required(message):
    """403 with `message` unless the user's role is in ADMINISTRATION_ROLES (anything else, a role not known yet included, is refused)."""

    def decorator(view_func):
        @wraps(view_func)
        def wrapped(request, *args, **kwargs):
            if get_user_role(request.user) not in ADMINISTRATION_ROLES:
                return Response({"detail": message}, status=status.HTTP_403_FORBIDDEN)

            return view_func(request, *args, **kwargs)

        return wrapped

    return decorator


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
