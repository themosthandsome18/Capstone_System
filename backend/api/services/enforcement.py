import json

from django.db import OperationalError, connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from api.models import ACTION_UPDATE, MODULE_SANITATION, ActivityLog, SanitaryEstablishment


class StaleEnforcementStage(APIException):
    status_code = 409
    default_detail = {
        "code": "stale_enforcement_stage",
        "detail": "The enforcement stage changed. Refresh before issuing another stage.",
    }


NEXT_STAGE = {"": "warning", "warning": "nov_1", "nov_1": "nov_2", "nov_2": "nov_3", "nov_3": "suspension"}


def issue_enforcement_stage(establishment_id, actor, stage, expected_previous_stage):
    try:
        with transaction.atomic():
            establishment = get_object_or_404(
                SanitaryEstablishment.objects.select_for_update(), pk=establishment_id,
            )
            previous = establishment.enforcement_stage
            if previous != expected_previous_stage:
                raise StaleEnforcementStage()
            if previous == stage:
                return establishment, None
            if NEXT_STAGE.get(previous) != stage:
                raise ValidationError({"stage": "Only the next manual enforcement stage may be issued."})

            # Conditional update is a second database-level guard. PostgreSQL
            # serializes issuers on the row lock; SQLite may instead reject a
            # competing writer with SQLITE_BUSY, handled after atomic rollback.
            changed_at = timezone.now()
            updates = {"enforcement_stage": stage, "updated_at": changed_at}
            if stage == "suspension":
                updates["permit_status"] = "suspended"
            changed = SanitaryEstablishment.objects.filter(
                pk=establishment.pk, enforcement_stage=previous,
            ).update(**updates)
            if changed != 1:
                raise StaleEnforcementStage()
            event = ActivityLog.objects.create(
                user=actor, module=MODULE_SANITATION, action=ACTION_UPDATE,
                record_type="SanitaryEnforcementStage", record_id=str(establishment.pk),
                record_label=json.dumps({
                    "previous_stage": previous, "new_stage": stage, "actor_id": actor.pk,
                }, separators=(",", ":")),
            )
            establishment.enforcement_stage = stage
            if stage == "suspension":
                establishment.permit_status = "suspended"
            establishment.updated_at = changed_at
            return establishment, event
    except OperationalError as exc:
        if connection.vendor == "sqlite" and "locked" in str(exc).lower():
            raise StaleEnforcementStage() from exc
        raise
