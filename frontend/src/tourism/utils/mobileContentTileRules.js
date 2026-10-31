// What the server lets an item of Mobile App Content (a pillar of Why Visit, a card of the Travel Guide) hold: the lengths, the names of the icons,
// the positions, the placeholders. It is a COPY, written here so that the page of a tile can count, limit and warn before the person presses Save
// (the server is still the one that refuses). The one source is backend/api/views/mobile_content.py (HARD, ADVISED, ORDER_*, MAX_ITEMS_PER_SECTION,
// EDITABLE, the calls of _text) and backend/api/models.py (ICON_NAMES, SECTION_CHOICES), and backend/api/services/mobile_content.py (FEE_PLACEHOLDERS).
// mobileContentTileRules.test.js reads those files and fails if this copy differs from them by one number or one name.
//
// The server counts letters (code points) and not UTF-16 units: count with Array.from(text).length (see mobileContentText.js).

export const ITEM_SECTIONS = Object.freeze({ why_visit: "Why Visit", travel_guide: "Travel Guide & Tips" });

// the names of the icons the server accepts, in its order; the page draws each one (see PILLAR_ICONS in MobileContentPillars.js)
export const ICON_NAMES = Object.freeze(["beach", "craft", "waterfall", "food", "boat", "festival", "receipt", "waste", "event", "eco", "info"]);

// a position is a whole number from ORDER_MIN to ORDER_MAX, and no two items of a section hold the same one; the server puts a new item
// ORDER_STEP after the last one
export const ORDER_MIN = 1;
export const ORDER_MAX = 9999;
export const ORDER_STEP = 10;

// the most items a section can hold, the ones deactivated counted
export const MAX_ITEMS_PER_SECTION = 40;

// "hard": the server refuses a longer text. "advised": the server accepts it and answers with a warning, because the app cuts it with "..."
export const HARD_LIMITS = Object.freeze({
  why_visit: Object.freeze({ title: 60, short_text: 80, full_text: 5000 }),
  travel_guide: Object.freeze({ title: 160, short_text: 400, full_text: 5000 }),
});
export const ADVISED_LIMITS = Object.freeze({
  why_visit: Object.freeze({ title: 24, short_text: 28 }),
  travel_guide: Object.freeze({ short_text: 300 }),
});

// "line": one line (any new line becomes a space); "text": paragraphs. `required`: the server refuses it empty.
export const FIELD_RULES = Object.freeze({
  title: Object.freeze({ kind: "line", required: true }),
  short_text: Object.freeze({ kind: "line", required: true }),
  full_text: Object.freeze({ kind: "text", required: false }),
});

// the fields a request may change (the section and "active" never change by an edit)
export const EDITABLE_FIELDS = Object.freeze(["title", "short_text", "full_text", "icon", "style", "display_order"]);

// the placeholders a text of an item may hold: the amounts of the entrance fee and the place where it is paid ({name} is for the Welcome only)
export const ITEM_PLACEHOLDERS = Object.freeze(["fee_regular", "fee_discounted", "fee_office"]);
