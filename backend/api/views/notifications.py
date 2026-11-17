import hmac
from decouple import config
from django.core.management import call_command
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from api.models import (
    NOTIFICATION_AUDIENCE_PUBLIC,
    NOTIFICATION_AUDIENCE_USER,
    NOTIFICATION_MODULE_CHOICES,
    NOTIFICATION_MODULE_GENERAL,
    NOTIFICATION_MODULE_SANITATION,
    NOTIFICATION_MODULE_TOURISM,
    NOTIFICATION_SEVERITY_INFO,
    NOTIFICATION_TYPE_PUBLIC_ADVISORY,
    ROLE_ADMIN,
    ROLE_SANITATION,
    ROLE_TOURISM,
    Notification,
)
from django.core.exceptions import ObjectDoesNotExist
from api.serializers import NotificationPublicSerializer, NotificationSerializer
from api.services.notifications import TOURISM_NOTICE_ROLES

VALID_MODULES = {code for code, _ in NOTIFICATION_MODULE_CHOICES}
STAFF_ADVISORY_ROLES = {ROLE_ADMIN, ROLE_TOURISM, ROLE_SANITATION}

# Which module's advisories each role may write (create, edit, move). "general" is only for the admin: it reaches the users of BOTH apps (it is in
# the tourism bootstrap and in the sanitation one), so letting one office write it would let that office reach the other's users.
ADVISORY_MODULES_BY_ROLE = {
    ROLE_ADMIN: {NOTIFICATION_MODULE_TOURISM, NOTIFICATION_MODULE_SANITATION, NOTIFICATION_MODULE_GENERAL},
    ROLE_TOURISM: {NOTIFICATION_MODULE_TOURISM},
    ROLE_SANITATION: {NOTIFICATION_MODULE_SANITATION},
}


def is_advisory_staff(user):
    """Returns True if the user is authenticated and has an admin, tourism, or sanitation role."""
    if not user or not user.is_authenticated:
        return False
    try:
        profile = user.profile
    except ObjectDoesNotExist:
        return False
    return getattr(profile, "role", "") in STAFF_ADVISORY_ROLES


def reads_tourism_notices(user):
    """The Tourism module's notifications (a visit was registered, a review was sent) are for the system admin and the Tourism Office, equally.
    Anyone else (sanitation, a resort's staff, a tourist, an account with no profile) is refused when they ask for that module."""
    if not user or not user.is_authenticated:
        return False
    try:
        return user.profile.role in TOURISM_NOTICE_ROLES
    except ObjectDoesNotExist:
        return False


def tourism_notices_refused():
    return Response(
        {"detail": "Only the system admin and the Tourism Office can read the Tourism notifications."},
        status=status.HTTP_403_FORBIDDEN,
    )


def advisory_modules_for(user):
    """The modules whose advisories this user may write: empty for anyone who is not advisory staff."""
    if not is_advisory_staff(user):
        return set()
    return ADVISORY_MODULES_BY_ROLE.get(getattr(user.profile, "role", ""), set())


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_list(request):
    """
    Returns notifications for the authenticated user ordered by -created_at.
    Supports query parameters:
      - ?unread_only=true (filters is_read=False)
      - ?module=sanitation|tourism|general
      - ?limit=N (default 20, max 100)
    unread_count is the total unread count for request.user regardless of filters.
    """
    user = request.user

    module_filter = request.query_params.get("module", "").strip().lower()
    if module_filter == NOTIFICATION_MODULE_TOURISM and not reads_tourism_notices(user):
        return tourism_notices_refused()

    # Total unread count for request.user regardless of filters/limits
    unread_count = Notification.objects.filter(
        recipient_user=user,
        is_read=False,
    ).count()

    queryset = Notification.objects.filter(recipient_user=user).order_by("-created_at", "-id")

    unread_only = request.query_params.get("unread_only", "").strip().lower()
    if unread_only in ("true", "1", "yes"):
        queryset = queryset.filter(is_read=False)

    module_unread_count = None
    if module_filter in VALID_MODULES:
        queryset = queryset.filter(module=module_filter)
        # What a screen of ONE module (the Tourism bell) needs for its red dot: the unread of that module, not of the user's other modules.
        module_unread_count = Notification.objects.filter(
            recipient_user=user,
            is_read=False,
            module=module_filter,
        ).count()

    limit_param = request.query_params.get("limit")
    try:
        limit = int(limit_param) if limit_param is not None else 20
        limit = max(1, min(limit, 100))
    except (ValueError, TypeError):
        limit = 20

    results = queryset[:limit]
    serializer = NotificationSerializer(results, many=True)

    payload = {
        "unread_count": unread_count,
        "results": serializer.data,
    }
    if module_unread_count is not None:
        payload["module_unread_count"] = module_unread_count
    return Response(payload)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def notification_mark_read(request, notification_id):
    """
    Marks a single notification as read for the authenticated user.
    Returns 404 if the notification does not exist or does not belong to request.user.
    """
    try:
        notification = Notification.objects.get(
            id=notification_id,
            recipient_user=request.user,
        )
    except Notification.DoesNotExist:
        return Response(
            {"detail": "Notification not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save(update_fields=["is_read", "read_at"])

    return Response(NotificationSerializer(notification).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notification_mark_all_read(request):
    """
    Marks all unread notifications belonging to the authenticated user as read.
    Returns the count of notifications updated.
    """
    now = timezone.now()
    queryset = Notification.objects.filter(recipient_user=request.user, is_read=False)

    # ?module=tourism marks only that module's notifications (the Tourism bell must not read the sanitation ones that an admin also has).
    module_filter = request.query_params.get("module", "").strip().lower()
    if module_filter == NOTIFICATION_MODULE_TOURISM and not reads_tourism_notices(request.user):
        return tourism_notices_refused()
    if module_filter in VALID_MODULES:
        queryset = queryset.filter(module=module_filter)

    updated_count = queryset.update(
        is_read=True,
        read_at=now,
    )

    return Response({
        "updated_count": updated_count,
        "count": updated_count,
    })


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def notification_delete(request, notification_id):
    """
    Deletes ONE notification: the row that belongs to request.user, and only that row. Each person who is told has a row of their own, so taking
    it off one person's list takes nothing off anybody else's. Returns 404 if the notification does not exist or is somebody else's (the same
    answer for both: a person is not told which ids exist).
    """
    try:
        notification = Notification.objects.get(
            id=notification_id,
            recipient_user=request.user,
        )
    except Notification.DoesNotExist:
        return Response(
            {"detail": "Notification not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if notification.module == NOTIFICATION_MODULE_TOURISM and not reads_tourism_notices(request.user):
        return tourism_notices_refused()

    notification.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def public_notification_list(request):
    """
    GET: Returns public advisories.
      - If authenticated staff (admin/tourism/sanitation): returns all advisories (active & inactive).
      - If unauthenticated / other roles: returns only active and unexpired advisories.
      - Supports ?module=sanitation|tourism|general in both cases.
    POST: Creates a public advisory.
      - Requires authentication with role in {admin, tourism, sanitation}. Returns 403 otherwise.
    """
    if request.method == "POST":
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not is_advisory_staff(request.user):
            return Response(
                {"detail": "You do not have permission to author public advisories."},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data.copy()
        if not data.get("severity"):
            data["severity"] = NOTIFICATION_SEVERITY_INFO

        serializer = NotificationPublicSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if serializer.validated_data.get("module") not in advisory_modules_for(request.user):
            return Response(
                {"detail": "You can only publish advisories for your own section."},
                status=status.HTTP_403_FORBIDDEN,
            )

        notification = serializer.save(
            audience_type=NOTIFICATION_AUDIENCE_PUBLIC,
            notification_type=NOTIFICATION_TYPE_PUBLIC_ADVISORY,
            recipient_user=None,
            target_role="",
            is_active=True,
        )
        return Response(
            NotificationPublicSerializer(notification).data,
            status=status.HTTP_201_CREATED,
        )

    # GET request
    is_staff = is_advisory_staff(request.user)
    queryset = Notification.objects.filter(
        audience_type=NOTIFICATION_AUDIENCE_PUBLIC,
        notification_type=NOTIFICATION_TYPE_PUBLIC_ADVISORY,
    ).order_by("-created_at", "-id")

    if not is_staff:
        now = timezone.now()
        queryset = queryset.filter(
            is_active=True,
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gte=now)
        )

    module_filter = request.query_params.get("module", "").strip().lower()
    if module_filter in VALID_MODULES:
        queryset = queryset.filter(module=module_filter)

    serializer = NotificationPublicSerializer(queryset, many=True)
    return Response({"results": serializer.data})


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def public_notification_detail(request, notification_id):
    """
    PATCH: Allows updating title/message/severity/module/expires_at and is_active.
    - Requires role in {admin, tourism, sanitation}. Returns 403 otherwise.
    - Returns 404 if the notification doesn't exist or is not a public_advisory.
    """
    if not is_advisory_staff(request.user):
        return Response(
            {"detail": "You do not have permission to edit public advisories."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        notification = Notification.objects.get(
            id=notification_id,
            audience_type=NOTIFICATION_AUDIENCE_PUBLIC,
            notification_type=NOTIFICATION_TYPE_PUBLIC_ADVISORY,
        )
    except Notification.DoesNotExist:
        return Response(
            {"detail": "Public advisory not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    allowed = advisory_modules_for(request.user)
    if notification.module not in allowed:
        # Not found, not forbidden: an office is not told that the other office has such an advisory.
        return Response(
            {"detail": "Public advisory not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = NotificationPublicSerializer(
        notification,
        data=request.data,
        partial=True,
    )
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    if serializer.validated_data.get("module", notification.module) not in allowed:
        return Response(
            {"detail": "You can only keep an advisory in your own section."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer.save()
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([AllowAny])
def trigger_due_notifications_scan(request):
    """
    Authenticated webhook endpoint for triggering evaluate_due_notifications.
    Gated by CRON_SECRET_KEY via 'X-Cron-Key' header or 'Authorization: Bearer <key>'.
    """
    cron_secret = config("CRON_SECRET_KEY", default="").strip()
    if not cron_secret:
        return Response(
            {"detail": "Cron trigger is not configured on this server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    provided_key = request.headers.get("X-Cron-Key", "").strip()
    if not provided_key:
        auth_header = request.headers.get("Authorization", "").strip()
        if auth_header.startswith("Bearer "):
            provided_key = auth_header[7:].strip()

    if not provided_key or not hmac.compare_digest(provided_key, cron_secret):
        return Response(
            {"detail": "Invalid or missing cron key."},
            status=status.HTTP_403_FORBIDDEN,
        )

    call_command("evaluate_due_notifications")
    return Response(
        {"status": "success", "message": "Due notifications evaluated."},
        status=status.HTTP_200_OK,
    )
