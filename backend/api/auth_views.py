from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import ROLE_ADMIN, ROLE_TOURISM, UserProfile
from .serializers import AuthUserSerializer


def get_or_create_profile(user):
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"role": ROLE_ADMIN if user.is_superuser else ROLE_TOURISM},
    )
    return profile


def serialize_auth_payload(user, token=None):
    get_or_create_profile(user)
    payload = {
        "user": AuthUserSerializer(user).data,
    }

    if token:
        payload["token"] = token.key

    return payload


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""

    if not username or not password:
        return Response(
            {"detail": "Username and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, username=username, password=password)
    if not user or not user.is_active:
        return Response(
            {"detail": "Invalid username or password."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    token, _ = Token.objects.get_or_create(user=user)
    return Response(serialize_auth_payload(user, token))


@api_view(["GET"])
def current_user_view(request):
    return Response(serialize_auth_payload(request.user))


@api_view(["POST"])
def logout_view(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
