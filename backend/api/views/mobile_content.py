"""The items of Mobile App Content an admin can manage: add, edit, deactivate, bring back.

An item is a pillar of "Why Visit" or a card of the Travel Guide (a tile, or a banner at
the bottom of the Home page). An item is NEVER deleted here (there is no DELETE endpoint)
and there is no reorder endpoint: its position is a number the admin sets when editing.

Nothing reads these items yet: the mobile bootstrap does not send them, so none of this
reaches a visitor until the later commit that does. What is decided here is what may be
stored, so that when it does reach them it cannot break what they see:

* every text is plain text, of a length the app can show;
* {placeholders} are only ones the server (or the app, for {name}) will fill in; a typo
  such as {fee_ofice}, a bracket left open, or a name the app does not know is refused,
  because a visitor would read it as it is written;
* the entrance fee amounts are not typed (they come from the one constant the reports
  use); taking a fee placeholder OUT of a text needs a confirmation, because the visitor
  would no longer be told that amount, or where to pay it;
* a full text may be written for a tile and for a banner alike (a banner is drawn as it always was; with a full text it opens when it is tapped);
* two items of a section cannot have the same position, and the refusal says who holds it
  and which numbers are free.

Every write is written to the ActivityLog inside the same transaction as the write itself,
through shorten_label (the column is 255). An edit that changes nothing writes nothing.
"""
import difflib
import re
from functools import wraps

from django.db import connection, transaction
from django.db.models import Max
from django.http import Http404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import ACTION_CREATE, ACTION_UPDATE, MODULE_TOURISM, ROLE_ADMIN, MobileContentBlock, MobileContentItem
from api.permissions import get_user_role
from api.services import tourism as tourism_services
from api.services.mobile_content import FEE_PLACEHOLDERS, PLACEHOLDER  # one definition, shared with what the bootstrap fills in
from api.services.activity import NAME_SHARE, count_of, log_activity, shorten_label
from api.views.reference_options import clean_name, name_key

LOCK_ID = 7100007
ORDER_STEP = 10
ORDER_MIN, ORDER_MAX = 1, 9999
MAX_ITEMS_PER_SECTION = 40  # inactive ones count: the bootstrap must not grow without bound

SECTIONS = {code: label for code, label in MobileContentItem.SECTION_CHOICES}
STYLES = {code for code, _label in MobileContentItem.STYLE_CHOICES}
ICONS = set(MobileContentItem.ICON_NAMES)
EDITABLE = ("title", "short_text", "full_text", "icon", "style", "display_order")  # (also the order of the log label)

# What the app can show. "hard" is refused; "advised" is accepted with a warning (the app cuts a title
# to one line with an ellipsis, which is ugly but does not break anything).
HARD = {
    "why_visit": {"title": 60, "short_text": 80, "full_text": 5000},
    "travel_guide": {"title": 160, "short_text": 400, "full_text": 5000},
}
ADVISED = {
    "why_visit": {"title": 24},
    "travel_guide": {"short_text": 300},
}
WORDS = {  # what the person sees, never the name of a field
    "title": "The title",
    "short_text": "The short line",
    "full_text": "The full text",
    "subtitle": "The subtitle",
    "body": "The text",
}

KNOWN_PLACEHOLDERS = FEE_PLACEHOLDERS + ("name",)
FEE_WORDS = {
    "fee_regular": "the regular fee amount",
    "fee_discounted": "the discounted fee amount",
    "fee_office": "the place where the fee is paid",
}
# The two entrance fee amounts typed by hand: P80, PHP 64, ₱80.00 ... but not ₱800, ₱80,000 or ₱80.50.
FEE_AMOUNT = re.compile(r"(?<![A-Za-z0-9])(?:₱|PHP|Php|php|P)\s?(?:80|64)(?:\.0+)?(?![\d,]|\.\d)")
ANY_PESO = re.compile(r"(?:₱|PHP|Php|php)\s?\d")
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def admin_required(view):
    """Only the system admin. Not the tourism role."""

    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            return Response(
                {"detail": "Only the system admin can manage the content of the mobile app."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return view(request, *args, **kwargs)

    return wrapped


def _error(detail, http_status=status.HTTP_400_BAD_REQUEST, **extra):
    return Response({"detail": detail, **extra}, status=http_status)


def _lock():
    """Put the admin writers in turn, so that two of them cannot both pass the same-title or
    same-position check. PostgreSQL only; SQLite already allows one writer at a time."""
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [LOCK_ID])


def _item(item):
    return {
        "id": item.id,
        "section": item.section,
        "icon": item.icon,
        "title": item.title,
        "short_text": item.short_text,
        "full_text": item.full_text,
        "style": item.style,
        "display_order": item.display_order,
        "is_active": item.is_active,
        "tappable": bool(item.full_text),  # the one rule: no full text, no tap, no arrow
    }


class _Refused(Exception):
    """A request that is refused: carries the response to send."""

    def __init__(self, response):
        self.response = response


def _refuse(detail, field=None, http_status=status.HTTP_400_BAD_REQUEST, **extra):
    extra = {field: [detail], **extra} if field else extra
    raise _Refused(_error(detail, http_status=http_status, **extra))


# -- the texts ---------------------------------------------------------------------------------


def _clean(value, field, word, limit, single_line, required):
    """-> one text, cleaned: plain text, one line or paragraphs, within `limit`; or raises _Refused."""
    if value is None:
        value = ""
    if not isinstance(value, str):
        _refuse(f"{word} must be text.", field)
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    if CONTROL.search(value):
        _refuse(f"{word} has a character that cannot be shown. Remove it and try again.", field)
    if single_line:
        value = clean_name(value)
    else:
        lines = [line.rstrip() for line in value.split("\n")]
        value = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    if required and not value:
        _refuse(f"{word} is required.", field)
    if len(value) > limit:
        _refuse(f"{word} is {len(value)} letters long. The most it can have here is {limit}.", field)
    return value


def _text(data, field, section, single_line, required):
    """-> the cleaned text of one text field of an item, or raises _Refused."""
    return _clean(data.get(field), field, WORDS[field], HARD[section][field], single_line, required)


def _check_placeholders(text, field, allowed, word=None):
    """Refuse a {placeholder} the server or the app will not fill in, and any bracket left over."""
    word = word or WORDS[field]
    for found in PLACEHOLDER.finditer(text):
        name = found.group()[1:-1]
        if name in allowed:
            continue
        if name in KNOWN_PLACEHOLDERS:  # {name} outside the welcome greeting
            _refuse(
                f"{word} uses {{{name}}}, which can only be used in the welcome greeting. "
                "Take it out of this text.",
                field,
            )
        near = difflib.get_close_matches(name.lower(), allowed, n=1, cutoff=0.7)
        hint = f" Did you mean {{{near[0]}}}?" if near else ""
        _refuse(
            f"{word} has {{{name}}}, which the app does not know how to fill in, so visitors "
            f"would see it as it is written.{hint}",
            field,
        )
    rest = PLACEHOLDER.sub("", text)
    if "{" in rest or "}" in rest:
        _refuse(
            f"{word} has a curly bracket that is not closed or has no partner, so visitors would "
            "see it as it is written. Write a placeholder in full, for example {fee_office}, or take the bracket out.",
            field,
        )
    if FEE_AMOUNT.search(text):
        _refuse(
            f"{word} has the entrance fee amount typed in. It cannot be typed, because it would go "
            "out of date when the fee changes. Write {fee_regular} for the regular amount or "
            "{fee_discounted} for the discounted one, and the app will show the current amount.",
            field,
        )


def _fee_placeholders(*texts):
    found = set()
    for text in texts:
        found |= {name[1:-1] for name in PLACEHOLDER.findall(text)} & set(FEE_PLACEHOLDERS)
    return found


# -- the position ----------------------------------------------------------------------------------


def _parse_position(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        number = value
    elif isinstance(value, str) and value.strip().isdigit():
        number = int(value.strip())
    else:
        return None
    return number if ORDER_MIN <= number <= ORDER_MAX else None


def _free_near(taken, wanted):
    """-> (just before, just after, end of the list): free position numbers near `wanted`, any of them None."""
    below = max((n for n in taken if n < wanted), default=None)
    above = min((n for n in taken if n > wanted), default=None)
    if below is None:
        before = wanted - ORDER_STEP if wanted - ORDER_STEP >= ORDER_MIN else None
    else:
        before = (below + wanted) // 2 if wanted - below >= 2 else None
    if above is None:
        after = wanted + ORDER_STEP if wanted + ORDER_STEP <= ORDER_MAX else None
    else:
        after = (wanted + above) // 2 if above - wanted >= 2 else None
    end = max(taken) + ORDER_STEP if taken and max(taken) + ORDER_STEP <= ORDER_MAX else None
    if end is None:  # the numbers are used up at the top: the first free one from the bottom
        end = next((n for n in range(ORDER_MIN, ORDER_MAX + 1) if n not in taken), None)
    return before, after, end


def _check_position(section, wanted, excluding):
    """Refuse a position that another item of the section already holds, and say who holds it and what is free."""
    holder = (
        MobileContentItem.objects.filter(section=section, display_order=wanted).exclude(pk=excluding).order_by("id").first()
    )
    if holder is None:
        return
    # Every number of the section counts as taken, the item's own current one too: advice that says
    # "40 is free" to the item that already sits at 40 is no advice.
    taken = set(MobileContentItem.objects.filter(section=section).values_list("display_order", flat=True))
    before, after, end = _free_near(taken, wanted)
    who = f"'{shorten_label(holder.title, NAME_SHARE)}'"
    if before and after:
        advice = f"Free positions next to it: {before} (just before it) and {after} (just after it)."
    elif after:
        advice = f"Position {after} is free and puts this item just after it."
    elif before:
        advice = f"Position {before} is free and puts this item just before it."
    else:
        advice = f"Position {end} is free (the end of the list)."
    _refuse(f"Position {wanted} is already used by {who}. {advice}", "display_order")


# -- the warnings (accepted, but the person is told) ------------------------------------------------


def _warnings(section, values):
    out = []
    advised = ADVISED.get(section, {})
    if "title" in advised and len(values["title"]) > advised["title"]:
        out.append(f"The title is longer than about {advised['title']} letters, so the app may cut it off with “…”.")
    if "short_text" in advised and len(values["short_text"]) > advised["short_text"]:
        out.append(f"The short line is long (over {advised['short_text']} letters). A shorter line reads better on the card.")
    for field in ("title", "short_text", "full_text"):
        if ANY_PESO.search(values[field]):
            out.append(
                f"{WORDS[field]} has a peso amount written in it. If it is the entrance fee, use {{fee_regular}} "
                "or {fee_discounted} instead, so it stays correct when the fee changes."
            )
            break
    return out


def _section_warning(section):
    if not MobileContentItem.objects.filter(section=section, is_active=True).exists():
        return [f"No item of “{SECTIONS[section]}” is shown now, so the app will leave that whole part out."]
    return []


# -- the log --------------------------------------------------------------------------------------------


def _log(request, item, action, text):
    label = f"Mobile content item ({SECTIONS[item.section]}) '{shorten_label(item.title, NAME_SHARE)}' {text}"
    log_activity(request, MODULE_TOURISM, action, item, label=shorten_label(label), record_id=item.pk)


CHANGE_WORDS = {"title": "title", "short_text": "short line", "full_text": "full text"}


def _edit_note(changes):
    parts = []
    for field, old, new in changes:
        if field in CHANGE_WORDS:
            parts.append(CHANGE_WORDS[field])
        elif field == "display_order":
            parts.append(f"position {old} to {new}")
        elif field == "style":
            parts.append(f"look {old} to {new}")
        else:
            parts.append(f"{field} {old} to {new}")
    return "edited: " + ", ".join(parts)


# -- the endpoints -----------------------------------------------------------------------------------------


def _body(request):
    data = request.data
    if not hasattr(data, "get"):
        _refuse("The request must be a set of values.")
    return data


@api_view(["GET", "POST"])
@admin_required
def mobile_content_item_list(request):
    if request.method == "GET":
        section = request.query_params.get("section")
        items = MobileContentItem.objects.all()
        if section:
            if section not in SECTIONS:
                return _error("That section does not exist.", section=["Not a section."])
            items = items.filter(section=section)
        return Response([_item(item) for item in items])

    try:
        data = _body(request)
        section = data.get("section")
        if not isinstance(section, str) or section not in SECTIONS:
            _refuse("Choose where the item goes: “Why Visit” or “Travel Guide & Tips”.", "section")
        style = data.get("style", MobileContentItem.STYLE_TILE)
        icon = data.get("icon", "info")
        if not isinstance(style, str) or style not in STYLES:
            _refuse("The look must be a tile or a banner.", "style")
        if style == MobileContentItem.STYLE_BANNER and section == "why_visit":
            _refuse("An item of “Why Visit” is always a tile.", "style")
        if not isinstance(icon, str) or icon not in ICONS:
            _refuse("Choose one of the icons in the list.", "icon")
        allowed = FEE_PLACEHOLDERS
        title = _text(data, "title", section, True, True)
        short_text = _text(data, "short_text", section, True, True)
        full_text = _text(data, "full_text", section, False, False)
        for field, value in (("title", title), ("short_text", short_text), ("full_text", full_text)):
            _check_placeholders(value, field, allowed)
        values = {"title": title, "short_text": short_text, "full_text": full_text}

        with transaction.atomic():
            _lock()
            existing = list(MobileContentItem.objects.filter(section=section))
            if len(existing) >= MAX_ITEMS_PER_SECTION:
                _refuse(
                    f"“{SECTIONS[section]}” already has the most items it can hold ({MAX_ITEMS_PER_SECTION}), "
                    "counting the ones that are switched off. Edit one of those instead of adding a new one."
                )
            if any(name_key(other.title) == name_key(title) for other in existing):
                _refuse(
                    f"Another item of “{SECTIONS[section]}” already has this title (capitals and spaces do not count).",
                    "title",
                )
            wanted = data.get("display_order")
            if wanted is None:
                top = MobileContentItem.objects.filter(section=section).aggregate(top=Max("display_order"))["top"]
                position = (top or 0) + ORDER_STEP
                if position > ORDER_MAX:
                    _refuse("There is no free position left at the end of the list. Give this item a position by hand.", "display_order")
            else:
                position = _parse_position(wanted)
                if position is None:
                    _refuse(f"The position must be a whole number from {ORDER_MIN} to {ORDER_MAX}.", "display_order")
                _check_position(section, position, excluding=None)
            item = MobileContentItem.objects.create(
                section=section, icon=icon, style=style, display_order=position, is_active=True, **values
            )
            _log(request, item, ACTION_CREATE, "added")
    except _Refused as refused:
        return refused.response
    body = _item(item)
    body["warnings"] = _warnings(section, values)
    return Response(body, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@admin_required
def mobile_content_item_detail(request, item_id):
    # Only the editable fields are read. The section never changes (a pillar is one line, a card is not),
    # and is_active has its own endpoints; a request that tries to change either is refused.
    try:
        data = _body(request)
        with transaction.atomic():
            _lock()
            try:
                item = MobileContentItem.objects.get(pk=item_id)
            except MobileContentItem.DoesNotExist:
                raise Http404("No such item.")
            section = item.section

            if "section" in data and data.get("section") != item.section:
                _refuse("An item cannot be moved to another section. Add it there and switch this one off.", "section")
            if "is_active" in data and data.get("is_active") is not item.is_active:
                _refuse("Use “Deactivate” or “Bring back” to switch an item off or on.", "is_active")

            new = {field: getattr(item, field) for field in EDITABLE}
            if "icon" in data:
                if not isinstance(data["icon"], str) or data["icon"] not in ICONS:
                    _refuse("Choose one of the icons in the list.", "icon")
                new["icon"] = data["icon"]
            if "style" in data:
                if not isinstance(data["style"], str) or data["style"] not in STYLES:
                    _refuse("The look must be a tile or a banner.", "style")
                if data["style"] == MobileContentItem.STYLE_BANNER and section == "why_visit":
                    _refuse("An item of “Why Visit” is always a tile.", "style")
                new["style"] = data["style"]
            if "title" in data:
                new["title"] = _text(data, "title", section, True, True)
            if "short_text" in data:
                new["short_text"] = _text(data, "short_text", section, True, True)
            if "full_text" in data:
                new["full_text"] = _text(data, "full_text", section, False, False)
            for field in ("title", "short_text", "full_text"):
                if field in data:
                    _check_placeholders(new[field], field, FEE_PLACEHOLDERS)
            if "title" in data and name_key(new["title"]) != name_key(item.title):
                taken = MobileContentItem.objects.filter(section=section).exclude(pk=item.pk)
                if any(name_key(other.title) == name_key(new["title"]) for other in taken):
                    _refuse(
                        f"Another item of “{SECTIONS[section]}” already has this title (capitals and spaces do not count).",
                        "title",
                    )
            if "display_order" in data:
                position = _parse_position(data["display_order"])
                if position is None:
                    _refuse(f"The position must be a whole number from {ORDER_MIN} to {ORDER_MAX}.", "display_order")
                if position != item.display_order:
                    _check_position(section, position, excluding=item.pk)
                new["display_order"] = position

            changes = [(field, getattr(item, field), new[field]) for field in EDITABLE if new[field] != getattr(item, field)]
            if not changes:
                body = _item(item)
                body["warnings"] = _warnings(section, new)
                return Response(body)

            # Taking a fee placeholder OUT of the text: the visitor would no longer be told that amount (or where to pay).
            dropped = sorted(
                _fee_placeholders(item.title, item.short_text, item.full_text)
                - _fee_placeholders(new["title"], new["short_text"], new["full_text"])
            )
            if dropped:
                confirmed = data.get("confirm_dropped")
                if not isinstance(confirmed, list) or sorted(str(name) for name in confirmed) != dropped:
                    what = " and ".join(FEE_WORDS[name] for name in dropped)
                    _refuse(
                        f"This change takes {what} out of the text, so visitors will no longer be told it here. "
                        "It needs a confirmation.",
                        http_status=status.HTTP_409_CONFLICT,
                        code="confirm_required",
                        dropped=dropped,
                    )

            for field, _old, value in changes:
                setattr(item, field, value)
            item.save(update_fields=[field for field, _old, _new in changes])
            _log(request, item, ACTION_UPDATE, _edit_note(changes))
    except _Refused as refused:
        return refused.response
    body = _item(item)
    body["warnings"] = _warnings(section, new)
    return Response(body)


def _set_active(request, item_id, active):
    with transaction.atomic():
        _lock()
        try:
            item = MobileContentItem.objects.get(pk=item_id)
        except MobileContentItem.DoesNotExist:
            raise Http404("No such item.")
        warnings = []
        if item.is_active != active:
            item.is_active = active
            item.save(update_fields=["is_active"])
            _log(request, item, ACTION_UPDATE, "brought back (active)" if active else "deactivated")
            if not active:
                warnings = _section_warning(item.section)
    body = _item(item)
    body["warnings"] = warnings
    return Response(body)


@api_view(["POST"])
@admin_required
def mobile_content_item_deactivate(request, item_id):
    return _set_active(request, item_id, False)


@api_view(["POST"])
@admin_required
def mobile_content_item_reactivate(request, item_id):
    return _set_active(request, item_id, True)


# =============================================================================================================
# The BLOCKS: five fixed texts. No create, no delete: the app asks for them by name.
# =============================================================================================================

BLOCK_ORDER = ["welcome", "why_visit", "travel_guide", "port_guide", "fee_office"]
BLOCK_FIELDS = ("title", "subtitle", "body")
NOUNS = {"title": "title", "subtitle": "subtitle", "body": "text"}  # what a person calls them
_FEE = FEE_PLACEHOLDERS
# kind: "line" (one line), "text" (paragraphs) or "lines" (a few lines, each one a bullet in the app)
BLOCKS = {
    "welcome": {
        "name": "Welcome banner",
        "fields": {
            "title": {"kind": "line", "max": 160, "placeholders": _FEE + ("name",)},
            "subtitle": {"kind": "line", "max": 300, "placeholders": _FEE + ("name",)},
        },
    },
    "why_visit": {
        "name": "Why Visit introduction",
        "fields": {
            "title": {"kind": "line", "max": 160, "placeholders": _FEE},
            "subtitle": {"kind": "line", "max": 300, "placeholders": _FEE},
            "body": {"kind": "text", "max": 600, "placeholders": _FEE},
        },
    },
    "travel_guide": {
        "name": "Travel Guide heading",
        "fields": {"title": {"kind": "line", "max": 160, "placeholders": _FEE}},
    },
    "port_guide": {
        "name": "Port & Boat Guide",
        "fields": {
            "title": {"kind": "line", "max": 160, "placeholders": _FEE},
            "body": {"kind": "lines", "max": 400, "max_lines": 8, "placeholders": _FEE},
        },
    },
    "fee_office": {  # put into the other texts in place of {fee_office}: so it holds no placeholder of its own
        "name": "Place where the fee is paid",
        "fields": {"body": {"kind": "line", "max": 120, "placeholders": ()}},
    },
}
PLACEHOLDER_NOTES = {
    "fee_regular": "The regular entrance fee. The server fills in the amount the reports use; it cannot be typed.",
    "fee_discounted": "The discounted entrance fee. The server fills in the amount the reports use; it cannot be typed.",
    "fee_office": "The place where the fee is paid. It is written once, in its own block, and filled in wherever this is used.",
    "name": "The visitor's name (a guest is called Explorer). The app fills it in; it belongs to the welcome banner only.",
}
BLOCK_CHANGE_WORDS = NOUNS


def _block_word(key, field):
    if key == "fee_office":
        return "The place"
    return WORDS[field]


def _block_item(block):
    spec = BLOCKS[block.key]
    fields = spec["fields"]
    return {
        "key": block.key,
        "name": spec["name"],
        "title": block.title,
        "subtitle": block.subtitle,
        "body": block.body,
        "fields": [field for field in BLOCK_FIELDS if field in fields],  # the ones the app shows; the others stay empty
        "limits": {
            field: {k: v for k, v in rules.items() if k in ("kind", "max", "max_lines")} | {"required": True}
            for field, rules in fields.items()
        },
        "allowed_placeholders": {field: list(rules["placeholders"]) for field, rules in fields.items()},
    }


def _fee_now():
    return {"regular": tourism_services.REGULAR_ENTRANCE_FEE, "discounted": tourism_services.DISCOUNTED_ENTRANCE_FEE}


def _clean_block_field(key, field, data):
    """-> the cleaned value of one field of a block, or raises _Refused."""
    rules = BLOCKS[key]["fields"].get(field)
    word = _block_word(key, field)
    if rules is None:  # a part the app does not show for this block: it must stay empty
        value = data.get(field)
        if value is not None and (not isinstance(value, str) or value.strip()):
            _refuse(f"The app shows no {NOUNS[field]} for “{BLOCKS[key]['name']}”, so it must stay empty.", field)
        return ""
    raw = data.get(field)
    if rules["kind"] == "lines":
        value = _clean_lines(raw, field, word, rules)
    else:
        value = _clean(raw, field, word, rules["max"], rules["kind"] == "line", True)
    if key == "fee_office" and ("{" in value or "}" in value):
        _refuse(
            "The place has to be plain words. It is put into the other texts where they say it should appear, "
            "so it cannot hold a bracket of its own.",
            field,
        )
    if rules["placeholders"] or key != "fee_office":
        _check_placeholders(value, field, rules["placeholders"], word)
    elif FEE_AMOUNT.search(value):
        _refuse(f"{word} has the entrance fee amount typed in. It cannot be typed here.", field)
    return value


def _clean_lines(raw, field, word, rules):
    """The text of a block that is a few lines, each one a bullet in the app: blank lines go, a bullet typed by hand is refused."""
    if raw is None:
        raw = ""
    if not isinstance(raw, str):
        _refuse(f"{word} must be text.", field)
    if CONTROL.search(raw.replace("\r\n", "\n").replace("\r", "\n")):
        _refuse(f"{word} has a character that cannot be shown. Remove it and try again.", field)
    lines = [clean_name(line) for line in raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    lines = [line for line in lines if line]
    if not lines:
        _refuse(f"{word} is required.", field)
    if len(lines) > rules["max_lines"]:
        _refuse(f"{word} has {len(lines)} lines. The most it can have here is {rules['max_lines']}.", field)
    for number, line in enumerate(lines, start=1):
        if line.startswith("\u2022"):
            _refuse(
                f"Line {number} starts with a bullet (•). The app puts the bullet in front of every line by itself, "
                "so write the line without it.",
                field,
            )
        if len(line) > rules["max"]:
            _refuse(f"Line {number} is {len(line)} letters long. The most a line can have here is {rules['max']}.", field)
    return "\n".join(lines)


def _all_fee_placeholders(values):
    return _fee_placeholders(*[values[field] for field in BLOCK_FIELDS])


def _uses_of_the_fee_office():
    """How many texts of the app say where the fee is paid (and so change when that place is edited)."""
    marker = "{fee_office}"
    items = sum(
        1 for i in MobileContentItem.objects.all() if marker in i.title + "\n" + i.short_text + "\n" + i.full_text
    )
    blocks = sum(
        1 for b in MobileContentBlock.objects.exclude(key="fee_office") if marker in b.title + "\n" + b.subtitle + "\n" + b.body
    )
    return items + blocks


def _block_log(request, block, changes):
    words = ", ".join(NOUNS[field] for field in changes)
    label = f"Mobile content block ({BLOCKS[block.key]['name']}) edited: {words}"
    log_activity(request, MODULE_TOURISM, ACTION_UPDATE, block, label=shorten_label(label), record_id=block.key)


@api_view(["GET"])
@admin_required
def mobile_content_block_list(request):
    """The five blocks in their fixed order, what each may hold, and the entrance fee as the reports know it (read-only)."""
    rows = {block.key: block for block in MobileContentBlock.objects.filter(key__in=BLOCK_ORDER)}
    fee = _fee_now()
    return Response(
        {
            "blocks": [_block_item(rows[key]) for key in BLOCK_ORDER if key in rows],
            "fee": fee,
            "placeholders": PLACEHOLDER_NOTES,
        }
    )


@api_view(["PATCH"])
@admin_required
def mobile_content_block_detail(request, key):
    if key not in BLOCKS:
        raise Http404("No such block.")
    try:
        data = _body(request)
        with transaction.atomic():
            _lock()
            try:
                block = MobileContentBlock.objects.get(key=key)
            except MobileContentBlock.DoesNotExist:
                raise Http404("No such block.")
            if "key" in data and data.get("key") != key:
                _refuse("The name of a block cannot be changed.", "key")

            new = {field: getattr(block, field) for field in BLOCK_FIELDS}
            for field in BLOCK_FIELDS:
                if field in data:
                    new[field] = _clean_block_field(key, field, data)

            changes = [field for field in BLOCK_FIELDS if new[field] != getattr(block, field)]
            if not changes:
                body = _block_item(block)
                body["warnings"] = []
                return Response(body)

            before = {field: getattr(block, field) for field in BLOCK_FIELDS}
            dropped = sorted(_all_fee_placeholders(before) - _all_fee_placeholders(new))
            if dropped:
                confirmed = data.get("confirm_dropped")
                if not isinstance(confirmed, list) or sorted(str(name) for name in confirmed) != dropped:
                    what = " and ".join(FEE_WORDS[name] for name in dropped)
                    _refuse(
                        f"This change takes {what} out of the text, so visitors will no longer be told it here. "
                        "It needs a confirmation.",
                        http_status=status.HTTP_409_CONFLICT,
                        code="confirm_required",
                        dropped=dropped,
                    )

            warnings = []
            if key == "welcome" and "{name}" in before["title"] + before["subtitle"] and "{name}" not in new["title"] + new["subtitle"]:
                warnings.append("The welcome banner no longer uses the visitor's name, so everyone is greeted the same way.")
            if key == "fee_office":
                used = _uses_of_the_fee_office()
                warnings.append(
                    f"The place where the fee is paid is used in {count_of(used, 'text')} of the app. "
                    + ("All of them change with this edit." if used != 1 else "It changes with this edit.")
                )

            for field in changes:
                setattr(block, field, new[field])
            block.save(update_fields=changes)
            _block_log(request, block, changes)
    except _Refused as refused:
        return refused.response
    body = _block_item(block)
    body["warnings"] = warnings
    return Response(body)
