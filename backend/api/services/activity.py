from ..models import ActivityLog

# The column is varchar(255). SQLite does not enforce a length, so a test cannot find
# a label that is too long by saving it; PostgreSQL refuses it (DataError, a 500, and
# the write that was being logged is rolled back). So any label that holds text an
# admin typed is passed through shorten_label() first.
LABEL_MAX = ActivityLog._meta.get_field("record_label").max_length
ELLIPSIS = "\u2026"


def shorten_label(text, limit=LABEL_MAX):
    """`text` as it is when it fits in `limit` characters, and otherwise cut so that it
    does, ending in an ellipsis (so a reader can see it was cut). The cut is made at a
    space rather than in the middle of a word, unless the last space is so far back that
    half the room would be lost. Used for a whole label, and for a part of one (a name
    inside a sentence whose end must stay readable): the result is never longer than
    `limit`."""
    if not isinstance(text, str):
        text = str(text)
    if len(text) <= limit:
        return text
    if limit <= len(ELLIPSIS):
        return ELLIPSIS[: max(limit, 0)]
    room = limit - len(ELLIPSIS)
    cut = text[:room]
    if not text[room].isspace():  # the cut falls inside a word
        space = cut.rfind(" ")
        if space >= room // 2:
            cut = cut[:space]
    return cut.rstrip(" ,;:") + ELLIPSIS


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
