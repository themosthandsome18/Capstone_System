/**
 * Display-only mapping from the real SanitaryBusinessType names stored in the
 * database to the smaller set of client-facing category labels.
 *
 * PRESENTATION ONLY. The underlying SanitaryBusinessType records, their
 * requirement checklists, inspections, permits and every API payload continue
 * to use the real names and ids unchanged. Nothing here is persisted, and
 * nothing here should be used for filtering, exporting, aggregating or saving.
 *
 * Several real types intentionally collapse onto one label (for example both
 * "Restaurant / Food Establishment" and "Public Market Stall" display as
 * "Food Establishment"), so this mapping is one-way: a display label cannot be
 * turned back into a single real business type.
 *
 * All 15 real business types are currently mapped. Any type added to the
 * database later is not an error: it falls through to its own name unchanged
 * until it is given a label here.
 */

/** Real business type name -> client-facing display label. */
export const BUSINESS_TYPE_DISPLAY_LABELS = {
  "Water Refilling Station": "Water Refilling Station",
  "Agro-industrial Establishment (Poultry / Piggery Farm)":
    "Agro-Industrial Establishment",
  "Sub-contractor": "Industrial Establishment",
  "Restaurant / Food Establishment": "Food Establishment",
  "Massage / Physical Therapy": "Commercial / NF",
  "Public Market Stall": "Food Establishment",
  "Food Establishment": "Food Establishment",
  "Commercial Non Food": "Commercial / NF",
  "Drug Store": "Institutional Establishment",
  "Resort / Picnic Ground": "Public Places",
  "Boatman": "Public Transport",
  "Funeral Parlor": "Public Places",
  "Burial Ground": "Public Places",
  "Private Laboratory & Clinic": "Institutional Establishment",
  "Karaoke / Video Bar / CSW": "Public Places",
};

/**
 * Names come from the database, so tolerate minor casing and spacing drift
 * (leading/trailing spaces, doubled spaces, different casing).
 */
function normalizeBusinessTypeName(name) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const LABEL_BY_NORMALIZED_NAME = new Map(
  Object.entries(BUSINESS_TYPE_DISPLAY_LABELS).map(([realName, label]) => [
    normalizeBusinessTypeName(realName),
    label,
  ])
);

/**
 * Returns the client-facing label for a real business type name.
 *
 * Any type that is not mapped (none today, but any type added to the database
 * later) falls back to its original name unchanged, never blank and never a
 * placeholder such as "Other".
 */
export function businessTypeDisplayLabel(realBusinessTypeName) {
  if (typeof realBusinessTypeName !== "string") {
    return realBusinessTypeName;
  }

  return (
    LABEL_BY_NORMALIZED_NAME.get(
      normalizeBusinessTypeName(realBusinessTypeName)
    ) || realBusinessTypeName
  );
}

export default businessTypeDisplayLabel;
