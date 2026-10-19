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
* a banner has no full text yet (only a tile opens a page when it is tapped);
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

from api.models import ACTION_CREATE, ACTION_UPDATE, MODULE_TOURISM, ROLE_ADMIN, MobileContentItem
from api.permissions import get_user_role
from api.services.activity import NAME_SHARE, log_activity, shorten_label
from api.views.reference_options import clean_name, name_key

LOCK_ID = 7100007
ORDER_STEP = 10
ORDER_MIN, ORDER_MAX = 1, 9999
MAX_ITEMS_PER_SECTION = 40  # inactive ones count: the bootstrap must not grow without bound

SECTIONS = {code: label for code, label in MobileContentItem.SECTION_CHOICES}
STYLES = {code for code, _label in MobileContentItem.STYLE_CHOICES}
ICONS = set(MobileContentItem.ICON_NAMES)
EDITABLE = ("title", "short_text", "full_text", "icon", "style", "display_order")  # (also the order of the log label)

# What the app can show. "hard" is refused; "advised" is accepted with a warning (the app cuts
# a pillar to one line with an ellipsis, which is ugly but does not break anything).
HARD = {
    "why_visit": {"title": 60, "short_text": 80, "full_text": 5000},
    "travel_guide": {"title": 160, "short_text": 400, "full_text": 5000},
}
ADVISED = {
    "why_visit": {"title": 24, "short_text": 28},
    "travel_guide": {"short_text": 300},
}
WORDS = {  # what the person sees, never the name of a field
    "title": "The title",
    "short_text": "The short line",
    "full_text": "The full text",
}

FEE_PLACEHOLDERS = ("fee_regular", "fee_discounted", "fee_office")
KNOWN_PLACEHOLDERS = FEE_PLACEHOLDERS + ("name",)
FEE_WORDS = {
    "fee_regular": "the regular fee amount",
    "fee_discounted": "the discounted fee amount",
    "fee_office": "the place where the fee is paid",
}
PLACEHOLDER = re.compile(r"\{[^{}]*\}")
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


def _text(data, field, section, single_line, required):
    """-> the cleaned text of one text field, or raises _Refused."""
    value = data.get(field)
    if value is None:
        value = ""
    if not isinstance(value, str):
        _refuse(f"{WORDS[field]} must be text.", field)
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    if CONTROL.search(value):
        _refuse(f"{WORDS[field]} has a character that cannot be shown. Remove it and try again.", field)
    if single_line:
        value = clean_name(value)
    else:
        lines = [line.rstrip() for line in value.split("\n")]
        value = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    if required and not value:
        _refuse(f"{WORDS[field]} is required.", field)
    limit = HARD[section][field]
    if len(value) > limit:
        _refuse(f"{WORDS[field]} is {len(value)} letters long. The most it can have here is {limit}.", field)
    return value


def _check_placeholders(text, field, allowed):
    """Refuse a {placeholder} the server or the app will not fill in, and any bracket left over."""
    for found in PLACEHOLDER.finditer(text):
        name = found.group()[1:-1]
        if name in allowed:
            continue
        if name in KNOWN_PLACEHOLDERS:  # {name} outside the welcome greeting
            _refuse(
                f"{WORDS[field]} uses {{{name}}}, which can only be used in the welcome greeting. "
                "Take it out of this text.",
                field,
            )
        near = difflib.get_close_matches(name.lower(), allowed, n=1, cutoff=0.7)
        hint = f" Did you mean {{{near[0]}}}?" if near else ""
        _refuse(
            f"{WORDS[field]} has {{{name}}}, which the app does not know how to fill in, so visitors "
            f"would see it as it is written.{hint}",
            field,
        )
    rest = PLACEHOLDER.sub("", text)
    if "{" in rest or "}" in rest:
        _refuse(
            f"{WORDS[field]} has a curly bracket that is not closed or has no partner, so visitors would "
            "see it as it is written. Write a placeholder in full, for example {fee_office}, or take the bracket out.",
            field,
        )
    if FEE_AMOUNT.search(text):
        _refuse(
            f"{WORDS[field]} has the entrance fee amount typed in. It cannot be typed, because it would go "
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
        if section == "why_visit":
            out.append(f"The short line is longer than about {advised['short_text']} letters, so the app may cut it off with “…”.")
        else:
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
        if style == MobileContentItem.STYLE_BANNER and full_text:
            _refuse(
                "A banner has no full text yet: only a tile opens a page when it is tapped. "
                "Clear the full text, or make this item a tile.",
                "full_text",
            )
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
            if new["style"] == MobileContentItem.STYLE_BANNER and new["full_text"]:
                _refuse(
                    "A banner has no full text yet: only a tile opens a page when it is tapped. "
                    "Clear the full text, or make this item a tile.",
                    "full_text",
                )
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
