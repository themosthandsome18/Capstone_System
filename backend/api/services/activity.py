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


NAME_SHARE = 60  # how much of a name (a tier, a contact, a title: up to 160) a label carries


def count_of(number, singular, plural=None):
    """'1 tier', '8 tiers': the right form for a person to read (no "(s)")."""
    return f"{number} {singular if number == 1 else (plural or singular + 's')}"


def moved_ids(old_ids, new_ids):
    """The ids that MOVED, in the new order: the fewest whose move explains the new order.
    The ones that did not move are a longest run that was already in the same relative
    order before (a longest increasing subsequence of their old positions), so putting the
    first one last is ONE move, not nine that changed place. At least one never moves (the
    one the others are measured against). When two answers are equally short, the first
    one found is used: swapping two neighbours is one move, and which of the two is called
    the mover is not meaningful but it is always the same one."""
    old_position = {item_id: index for index, item_id in enumerate(old_ids)}
    sequence = [old_position[item_id] for item_id in new_ids]
    length = [1] * len(sequence)
    previous = [-1] * len(sequence)
    for i in range(len(sequence)):
        for j in range(i):
            if sequence[j] < sequence[i] and length[j] + 1 > length[i]:
                length[i], previous[i] = length[j] + 1, j
    stay = set()
    if sequence:
        i = max(range(len(sequence)), key=lambda k: length[k])
        while i != -1:
            stay.add(i)
            i = previous[i]
    return [item_id for index, item_id in enumerate(new_ids) if index not in stay]


def reorder_note(moved_names, noun, prefix=""):
    """The part of a reorder's log label from "reordered:" on: HOW MANY moved, and which
    ones while that fits in the column; when it does not fit, only the number. `prefix` is
    what the label already has in front (it counts toward the 255). A list of every item
    (what these labels used to be) is 439 characters for the nine real boat fare tiers and
    says less than a short summary does."""
    if not moved_names:
        return f"reordered: no {noun} moved"
    count = f"reordered: {count_of(len(moved_names), noun)} moved"
    named = count + ": " + ", ".join(f"'{shorten_label(name, NAME_SHARE)}'" for name in moved_names)
    return named if len(prefix + named) <= LABEL_MAX else count


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
