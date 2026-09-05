from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import ROLE_ADMIN, ROLE_ESTABLISHMENT, ROLE_TOURISM, UserProfile
from .serializers import AuthUserSerializer


def get_or_create_profile(user):
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"role": ROLE_ADMIN if user.is_superuser else ROLE_TOURISM},
    )
    return profile


def serialize_auth_payload(user, token=None):
    profile = get_or_create_profile(user)
    payload = {
        "user": AuthUserSerializer(user).data,
    }

    if token:
        payload["token"] = token.key

    # Attach establishment details if applicable
    san_est = user.sanitary_establishments.first()
    if san_est:
        payload["establishment"] = {
            "id": san_est.id,
            "business_name": san_est.business_name,
            "owner_name": san_est.owner_name,
            "permit_number": san_est.permit_number,
            "permit_status": san_est.permit_status,
            "compliance_status": san_est.compliance_status,
            "barangay": san_est.barangay,
            "address": san_est.address,
            "permit_expiry_date": str(san_est.permit_expiry_date) if san_est.permit_expiry_date else "",
            "has_permit": san_est.has_permit,
        }
    
    resort = getattr(user, "resorts", None)
    if resort and resort.exists():
        r = resort.first()
        payload["resort"] = {
            "id": r.resort_id,
            "name": r.resort_name,
            "location": r.location,
        }

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


@api_view(["POST"])
@permission_classes([AllowAny])
def tourist_register_view(request):
    """
    Register a new tourist account from the mobile app.
    """
    full_name = (request.data.get("full_name") or request.data.get("name") or "").strip()
    first_name = (request.data.get("first_name") or "").strip()
    last_name = (request.data.get("last_name") or "").strip()

    if not first_name and full_name:
        parts = full_name.split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""

    email = (request.data.get("email") or "").strip().lower()
    username = (request.data.get("username") or email or "").strip()
    password = request.data.get("password") or ""
    contact_number = (request.data.get("contact_number") or request.data.get("contact") or "").strip()

    if not username:
        return Response(
            {"detail": "Username or Email is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not password or len(password) < 6:
        return Response(
            {"detail": "Password must be at least 6 characters."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {"detail": "An account with this username or email already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )
    user.is_active = True
    user.save()

    profile = get_or_create_profile(user)
    profile.role = ROLE_TOURISM
    profile.save()

    token, _ = Token.objects.get_or_create(user=user)
    payload = serialize_auth_payload(user, token)
    payload["user"]["contact_number"] = contact_number
    payload["message"] = f"Account created successfully for {full_name or username}!"
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def current_user_view(request):
    return Response(serialize_auth_payload(request.user))


@api_view(["POST"])
def logout_view(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([AllowAny])
def establishment_register_view(request):
    """
    Register or claim an establishment account.
    """
    from .models import SanitaryEstablishment

    business_name = (request.data.get("business_name") or "").strip()
    owner_name = (request.data.get("owner_name") or request.data.get("full_name") or "").strip()
    permit_number = (request.data.get("permit_number") or "").strip()
    barangay = (request.data.get("barangay") or "").strip()
    contact_number = (request.data.get("contact_number") or request.data.get("contact") or "").strip()
    email = (request.data.get("email") or "").strip().lower()
    username = (request.data.get("username") or email or "").strip()
    password = request.data.get("password") or ""

    if not username:
        return Response(
            {"detail": "Username or Email is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not password or len(password) < 6:
        return Response(
            {"detail": "Password must be at least 6 characters."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {"detail": "An account with this username or email already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    parts = owner_name.split(" ", 1) if owner_name else ["Establishment", "Owner"]
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""

    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )
    user.is_active = True
    user.save()

    profile = get_or_create_profile(user)
    profile.role = ROLE_ESTABLISHMENT
    profile.save()

    # Link to existing establishment if matching permit or business name
    san_est = None
    if permit_number:
        san_est = SanitaryEstablishment.objects.filter(permit_number__iexact=permit_number).first()
    if not san_est and business_name:
        san_est = SanitaryEstablishment.objects.filter(business_name__iexact=business_name).first()

    if san_est:
        san_est.user = user
        if contact_number and not san_est.contact_number:
            san_est.contact_number = contact_number
        san_est.save()

    token, _ = Token.objects.get_or_create(user=user)
    payload = serialize_auth_payload(user, token)
    payload["message"] = f"Establishment account created successfully for {business_name or username}!"
    return Response(payload, status=status.HTTP_201_CREATED)

