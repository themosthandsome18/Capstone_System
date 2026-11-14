"""Development-only native uploads and database-only, non-destructive review.

No provider reads/listings/deletes. Unknown outcomes stay unresolved. The existing
ActivityLog retains sanitized transition/review history alongside the current row.
"""
from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import DatabaseError, IntegrityError, connection, connections, transaction
from django.utils import timezone

from api.models import ACTION_CREATE, ACTION_UPDATE, ROLE_ADMIN, ROLE_SANITATION, ActivityLog, NativePhotoAttempt, UserProfile
from api.services.front_photos import NativeFrontPhotoUpdateFailed
from api.services.native_private_photos import (
    CreateDiagnostic, CreateOutcome, CreateResult, NativeCreateOnlyStore, NativePhotoConfigurationError,
    get_native_create_only_store,
)

State = NativePhotoAttempt.State
TRANSITIONS = {
    State.PREPARED: {State.IN_FLIGHT, State.CONFLICT, State.SAFETY_FAILURE},
    State.IN_FLIGHT: {State.CREATED_UNLINKED, State.CONFLICT, State.AMBIGUOUS, State.UNAVAILABLE,
                      State.AUTHORIZATION_FAILURE, State.SAFETY_FAILURE},
    State.CREATED_UNLINKED: {State.LINKED},
    State.LINKED: {State.RETIRED_HELD},
}
AUDIT_TYPE = 'NativePhotoAttemptTransition'
REVIEW_TYPE = 'NativePhotoAttemptReview'


class NativeTransitionRejected(Exception):
    """No caller/provider content in errors."""


def _authorize(user, *, operator=False):
    if user is None or not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Native photo access denied.')
    roles = (ROLE_ADMIN,) if operator else (ROLE_ADMIN, ROLE_SANITATION)
    if not user.is_superuser and not UserProfile.objects.filter(user=user, role__in=roles).exists():
        raise PermissionDenied('Native photo access denied.')


def _audit(row, before, actor, *, review_revision=None):
    review = review_revision is not None
    ActivityLog.objects.using(row._state.db).create(
        user=actor, module='sanitation', action=ACTION_CREATE if before is None else ACTION_UPDATE,
        record_type=REVIEW_TYPE if review else AUDIT_TYPE,
        record_id=f'{row.pk}:review:{review_revision}' if review else str(row.pk),
        record_label=(f'review-held; state={row.state}; revision={row.revision}' if review else
                      f'{before or "NEW"}->{row.state}; revision={row.revision}; diagnostic={row.diagnostic}'))


def _advance_locked(row, expected_revision, state, diagnostic, actor=None):
    if (type(expected_revision) is not int or expected_revision < 0 or row.revision != expected_revision
            or state not in State.values or diagnostic not in [''] + NativePhotoAttempt.Diagnostic.values):
        raise NativeTransitionRejected('Invalid or stale native photo transition.')
    annotation = state == row.state == State.CREATED_UNLINKED and diagnostic == 'LINK_FAILED'
    if not annotation and state not in TRANSITIONS.get(row.state, set()):
        raise NativeTransitionRejected('Invalid or stale native photo transition.')
    before = row.state
    row.state, row.diagnostic = state, diagnostic
    row.revision += 1
    row.reviewed_by, row.reviewed_at = None, None
    row.save(update_fields=['state', 'diagnostic', 'revision', 'reviewed_by', 'reviewed_at', 'updated_at'])
    _audit(row, before, actor)
    return row


def _transition(attempt_id, expected_revision, state, diagnostic='', actor=None):
    with transaction.atomic():
        row = NativePhotoAttempt.objects.select_for_update().get(pk=attempt_id)
        return _advance_locked(row, expected_revision, state, diagnostic, actor)


def native_key_is_held(key, *, using='default'):
    # Legacy links/receipts lack storage-target provenance. Any journal match must
    # therefore hold, even if its relative key could also exist in an S3 bucket.
    return NativePhotoAttempt.objects.using(using).filter(object_key=key).exists()


def lock_native_key(key, *, using='default'):
    """Fence native registration against legacy writes/deletes on the same key.

    Must span the legacy provider operation or native journal commit. A hash
    collision can only add serialization; it never grants deletion ownership.
    """
    database = connections[using]
    if database.vendor == 'postgresql':
        if not database.in_atomic_block:
            raise NativeTransitionRejected('Native key fence requires a transaction.')
        with database.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', ['native-photo-key:' + key])


def hold_deleted_owner(kind, owner_id, key, *, using='default'):
    if not native_key_is_held(key, using=using):
        return False
    with transaction.atomic(using=using):
        rows = NativePhotoAttempt.objects.using(using).select_for_update().filter(
            owner_kind=kind.owner_field, owner_record_id=owner_id, object_key=key, state=State.LINKED).order_by('id')
        for row in rows:
            _advance_locked(row, row.revision, State.RETIRED_HELD, 'AWAITING_REVIEW')
    return True


def replace_native_front_photo(kind, owner_id, data, extension, *, actor, explicitly_selected=False):
    _authorize(actor)
    if (explicitly_selected is not True or getattr(settings, 'SANITATION_NATIVE_PHOTO_DEVELOPMENT', False) is not True
            or connection.vendor != 'postgresql' or not connection.get_autocommit() or connection.in_atomic_block):
        raise NativeFrontPhotoUpdateFailed('SAFETY_FAILURE')
    try:
        store = get_native_create_only_store()
    except NativePhotoConfigurationError:
        raise NativeFrontPhotoUpdateFailed('UNAVAILABLE') from None
    if not isinstance(store, NativeCreateOnlyStore):
        raise NativeFrontPhotoUpdateFailed('SAFETY_FAILURE')
    if not kind.owner_model.objects.filter(pk=owner_id).exists():
        raise NativeFrontPhotoUpdateFailed('UNAVAILABLE')
    key = store.new_key(kind.key_folder, owner_id, extension)
    attempt = NativePhotoAttempt(owner_kind=kind.owner_field, owner_record_id=owner_id,
        project_ref=store.project_ref, bucket=store.bucket, object_key=key)
    try:
        attempt.full_clean()
        with transaction.atomic():
            lock_native_key(key)
            attempt.save(force_insert=True)
            _audit(attempt, None, actor)
    except (ValidationError, IntegrityError):
        # No provider call occurred; an existing target receipt is never removed.
        raise NativeFrontPhotoUpdateFailed('SAFETY_FAILURE') from None
    try:
        if kind.photo_model.objects.filter(object_key=key).exists():
            _transition(attempt.pk, 0, State.CONFLICT, 'EXISTING_PATH', actor)
            raise NativeFrontPhotoUpdateFailed('CONFLICT', attempt.pk)
        attempt = _transition(attempt.pk, 0, State.IN_FLIGHT, actor=actor)
    except DatabaseError:
        raise NativeFrontPhotoUpdateFailed('AMBIGUOUS', attempt.pk) from None
    # PREPARED and IN_FLIGHT are committed before reaching the adapter. Interrupts
    # deliberately leave IN_FLIGHT; no retry, absence inference or compensation.
    try:
        result = store.create(key, data, upsert=False)
    except Exception:
        result = CreateResult(CreateOutcome.AMBIGUOUS, CreateDiagnostic.TRANSPORT_UNCERTAIN)
    if (not isinstance(result, CreateResult) or type(result.outcome) is not CreateOutcome
            or type(result.diagnostic) is not CreateDiagnostic):
        result = CreateResult(CreateOutcome.SAFETY_FAILURE, CreateDiagnostic.PROVIDER_UNCERTAIN)
    outcome_state = State.CREATED_UNLINKED if result.outcome == CreateOutcome.CREATED else State(result.outcome.value)
    try:
        attempt = _transition(attempt.pk, attempt.revision, outcome_state, result.diagnostic.value, actor)
    except (DatabaseError, NativeTransitionRejected):
        raise NativeFrontPhotoUpdateFailed('AMBIGUOUS', attempt.pk) from None
    if outcome_state != State.CREATED_UNLINKED:
        raise NativeFrontPhotoUpdateFailed(result.outcome.value, attempt.pk)
    try:
        with transaction.atomic():
            kind.owner_model.objects.select_for_update().only('pk').get(pk=owner_id)
            row = NativePhotoAttempt.objects.select_for_update().get(pk=attempt.pk)
            photo = kind.photo_model.objects.filter(**{f'{kind.owner_field}_id': owner_id}).first()
            previous = photo.object_key if photo else None
            if previous == key:
                raise NativeTransitionRejected('Native target is already linked.')
            if previous:
                if photo.storage_provider == 'NATIVE':
                    photo._native_binding(using=photo._state.db, lock=True)
                    old = NativePhotoAttempt.objects.select_for_update().get(pk=photo.native_attempt_id)
                    _advance_locked(old, old.revision, State.RETIRED_HELD, 'AWAITING_REVIEW', actor)
                else:
                    receipt, _ = kind.cleanup_model.objects.get_or_create(object_key=previous, defaults={'ready': False})
                    kind.cleanup_model.objects.filter(pk=receipt.pk).update(ready=False)
            if photo is None:
                photo = kind.photo_model(**{f'{kind.owner_field}_id': owner_id})
            # State and linkage commit together. Model validation requires LINKED;
            # a failed save rolls this transition and its audit entry back too.
            _advance_locked(row, attempt.revision, State.LINKED, 'ACKNOWLEDGED', actor)
            photo.object_key = key
            photo.storage_provider = 'NATIVE'
            photo.native_attempt = row
            photo.s3_endpoint = photo.s3_bucket = photo.s3_region = None
            photo.save()
    except (DatabaseError, ValidationError, kind.owner_model.DoesNotExist, NativeTransitionRejected):
        try:
            _transition(attempt.pk, attempt.revision, State.CREATED_UNLINKED, 'LINK_FAILED', actor)
        except (DatabaseError, NativeTransitionRejected):
            pass  # Committed CREATED_UNLINKED/IN_FLIGHT evidence is never discarded.
        raise NativeFrontPhotoUpdateFailed('CREATED_UNLINKED', attempt.pk) from None
    return bool(previous)


def _report(row):
    uncertain = row.state in (State.PREPARED, State.IN_FLIGHT, State.CREATED_UNLINKED, State.AMBIGUOUS, State.SAFETY_FAILURE)
    assessment = ('CREATE_REJECTED_EXISTING_PATH' if row.state == State.CONFLICT else
                  'PROVIDER_REPORTED_FAILURE' if row.state in (State.UNAVAILABLE, State.AUTHORIZATION_FAILURE) else
                  'RETAINED' if row.state == State.RETIRED_HELD else 'UNCERTAIN_OR_UNLINKED')
    return {'attempt_id': str(row.pk), 'state': row.state, 'revision': row.revision,
            'owner_kind': row.owner_kind, 'owner_record_id': row.owner_record_id,
            'age_seconds': max(0, int((timezone.now() - row.created_at).total_seconds())),
            'diagnostic': row.diagnostic, 'upload_assessment': assessment, 'provider_confirmation_required': uncertain,
            'object_presence': 'UNVERIFIED', 'deletion_authorized': False}


def list_unresolved_attempts(user, *, limit=50, after_id=None):
    _authorize(user, operator=True)
    if type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError('Review limit must be between 1 and 100.')
    rows = NativePhotoAttempt.objects.exclude(state__in=[State.LINKED, State.CLOSED_WITHOUT_DELETION]).order_by('id')
    if after_id is not None:
        from uuid import UUID
        try:
            cursor = UUID(str(after_id))
        except (ValueError, TypeError):
            raise ValueError('Invalid review cursor.') from None
        rows = rows.filter(id__gt=cursor)
    return [_report(row) for row in rows[:limit]]


def review_attempt(user, attempt_id, *, expected_revision):
    """Acknowledge review only. No state resolution, provider calls or deletion.

    An exact retry by the same reviewer/revision is idempotent via the committed
    audit event. Any intervening transition invalidates that retry.
    """
    _authorize(user, operator=True)
    if type(expected_revision) is not int or expected_revision < 0:
        raise NativeTransitionRejected('Invalid or stale native photo review.')
    with transaction.atomic():
        row = NativePhotoAttempt.objects.select_for_update().get(pk=attempt_id)
        if row.revision != expected_revision:
            if (row.revision == expected_revision + 1 and row.reviewed_by_id == user.pk
                    and ActivityLog.objects.filter(record_type=REVIEW_TYPE, user=user,
                        record_id=f'{row.pk}:review:{expected_revision}').exists()):
                return _report(row)
            raise NativeTransitionRejected('Invalid or stale native photo review.')
        if row.state in (State.LINKED, State.CLOSED_WITHOUT_DELETION):
            raise NativeTransitionRejected('Attempt is not unresolved.')
        if row.reviewed_by_id == user.pk and row.reviewed_at is not None:
            return _report(row)
        row.reviewed_by, row.reviewed_at = user, timezone.now()
        row.revision += 1
        row.save(update_fields=['reviewed_by', 'reviewed_at', 'revision', 'updated_at'])
        _audit(row, row.state, user, review_revision=expected_revision)
        return _report(row)
