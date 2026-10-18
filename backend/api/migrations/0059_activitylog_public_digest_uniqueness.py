import json
import re

from django.db import migrations, models


def validate_existing_digests(apps, schema_editor):
    """Read-only preflight: report safe identifiers, never repair old records."""
    alias = schema_editor.connection.alias
    logs = apps.get_model("api", "ActivityLog").objects.using(alias)
    complaints = apps.get_model("api", "SanitaryComplaint").objects.using(alias)
    seen, bad_events, complaint_pks, reasons = {}, set(), set(), set()
    for event in logs.filter(module="sanitation", record_type="SanitationPublicSubmission").iterator():
        valid = True
        prior = seen.get(event.record_id)
        if prior is not None:
            bad_events.update((prior, event.pk))
            reasons.add("duplicate_identity")
            valid = False
        seen[event.record_id] = event.pk
        if not re.fullmatch(r"[1-9][0-9]{0,18}", event.record_id or "") or int(event.record_id) > 2**63 - 1:
            reasons.add("malformed_record_id")
            valid = False
        else:
            pk = int(event.record_id)
            complaint = complaints.filter(pk=pk).first()
            if complaint is None:
                reasons.add("orphaned_digest")
                valid = False
            elif not (complaint.client_submission_id or "").strip():
                reasons.add("missing_submission_identity")
                valid = False
            if not valid:
                complaint_pks.add(pk)
        if event.action != "create":
            reasons.add("invalid_action")
            valid = False
        try:
            proof = json.loads(event.record_label)
            well_formed = (
                isinstance(proof, dict) and set(proof) == {"v", "sha256", "priority"}
                and type(proof["v"]) is int and proof["v"] == 1
                and isinstance(proof["sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", proof["sha256"])
                and proof["priority"] in ("high", "medium", "low")
            )
        except (ValueError, TypeError):
            well_formed = False
        if not well_formed:
            reasons.add("malformed_digest_payload")
            valid = False
        if not valid:
            bad_events.add(event.pk)
    if bad_events:
        # Never echo record_label, raw record_id, submission IDs or reporter data.
        raise RuntimeError(
            "Sanitation digest preflight failed; no records changed. "
            f"event_pks={sorted(bad_events)}; complaint_pks={sorted(complaint_pks)}; "
            f"reasons={sorted(reasons)}"
        )


class Migration(migrations.Migration):
    atomic = True
    dependencies = [("api", "0058_sanitaryestablishment_enforcement_stage")]
    operations = [
        migrations.RunPython(validate_existing_digests, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="activitylog",
            constraint=models.UniqueConstraint(
                fields=["record_id"],
                condition=models.Q(module="sanitation", record_type="SanitationPublicSubmission"),
                name="uniq_sanitation_public_digest",
            ),
        ),
    ]
