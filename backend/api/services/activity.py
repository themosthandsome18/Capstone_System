from ..models import ActivityLog


def log_activity(request, module, action, instance, label=None, record_id=None):
    user = request.user if request.user.is_authenticated else None

    ActivityLog.objects.create(
        user=user,
        module=module,
        action=action,
        record_type=instance.__class__.__name__,
        record_id=str(record_id if record_id is not None else get_instance_id(instance)),
        record_label=label or str(instance),
    )


def get_instance_id(instance):
    primary_key = getattr(instance, "pk", "")
    return primary_key or ""
