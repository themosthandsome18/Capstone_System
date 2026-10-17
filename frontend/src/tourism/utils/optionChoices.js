// The choices offered by one dropdown of the record form.
//
// A retired (inactive) option is not offered for a NEW record. When an OLD
// record is edited and it already uses a retired option, that option stays in
// the list, marked, and stays selected: hiding it would show the dropdown as
// empty while the record still holds the old id, or tempt a quiet switch to
// another option, which is a change to the LGU's data that nobody asked for.
//
// `keepId` is the option the record had when it was opened (null for a new
// record). The API sends `is_active`; a list without it (older payload) is
// treated as all active.
export const RETIRED_MARK = " (retired)";

export function isRetired(option) {
  return option.is_active === false;
}

export function choicesFor(options = [], keepId = null) {
  const keep = keepId === null || keepId === undefined || keepId === "" ? null : String(keepId);
  return options
    .filter((option) => !isRetired(option) || (keep !== null && String(option.id) === keep))
    .map((option) => ({
      id: option.id,
      label: isRetired(option) ? `${option.name}${RETIRED_MARK}` : option.name,
    }));
}
