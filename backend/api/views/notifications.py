from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.models import (
    NOTIFICATION_MODULE_CHOICES,
    Notification,
)
from api.serializers import NotificationSerializer

VALID_MODULES = {code for code, _ in NOTIFICATION_MODULE_CHOICES}


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

    # Total unread count for request.user regardless of filters/limits
    unread_count = Notification.objects.filter(
        recipient_user=user,
        is_read=False,
    ).count()

    queryset = Notification.objects.filter(recipient_user=user).order_by("-created_at", "-id")

    unread_only = request.query_params.get("unread_only", "").strip().lower()
    if unread_only in ("true", "1", "yes"):
        queryset = queryset.filter(is_read=False)

    module_filter = request.query_params.get("module", "").strip().lower()
    if module_filter in VALID_MODULES:
        queryset = queryset.filter(module=module_filter)

    limit_param = request.query_params.get("limit")
    try:
        limit = int(limit_param) if limit_param is not None else 20
        limit = max(1, min(limit, 100))
    except (ValueError, TypeError):
        limit = 20

    results = queryset[:limit]
    serializer = NotificationSerializer(results, many=True)

    return Response({
        "unread_count": unread_count,
        "results": serializer.data,
    })


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
    updated_count = Notification.objects.filter(
        recipient_user=request.user,
        is_read=False,
    ).update(
        is_read=True,
        read_at=now,
    )

    return Response({
        "updated_count": updated_count,
        "count": updated_count,
    })
