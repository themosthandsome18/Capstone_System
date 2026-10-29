"""Temporary blanket retention of Sanitation establishments."""

from django.db.models.deletion import ProtectedError
from django.db.models.signals import pre_delete

from api.models import SanitaryEstablishment


ESTABLISHMENT_RETENTION_CODE = "establishment_deletion_protected"
ESTABLISHMENT_RETENTION_MESSAGE = (
    "This establishment cannot be permanently deleted because establishment "
    "and compliance records must be retained."
)


class EstablishmentDeletionProtected(ProtectedError):
    pass


def protect_establishment_deletion(sender, instance, **kwargs):
    # The collector sends every pre_delete before deleting rows or applying
    # SET_NULL updates. This also covers QuerySet.delete(), base managers and
    # ordinary collector/bulk paths that do not call Model.delete().
    raise EstablishmentDeletionProtected(ESTABLISHMENT_RETENTION_MESSAGE, [instance])


def register_establishment_retention():
    pre_delete.connect(
        protect_establishment_deletion, sender=SanitaryEstablishment, weak=False,
        dispatch_uid="sanitation.establishment_retention",
    )
