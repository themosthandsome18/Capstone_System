// Arrival Monitoring's three views: one Day, one Month, or a whole Year.
// The backend already understands all three (services/tourism.py
// filter_arrival_records): `date` for a day, `date=all` for a year, and
// `from`/`to` for a range, which it also limits to `year`.
export const VIEW_DAY = "day";
export const VIEW_MONTH = "month";
export const VIEW_YEAR = "year";

function pad(number) {
  return String(number).padStart(2, "0");
}

// First and last day of a month, as YYYY-MM-DD. `month` is "01".."12".
export function monthRange(year, month) {
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export function monthLabel(year, month) {
  const name = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${name} ${year}`;
}

// The query for a view. A month sends `from`/`to` built from the same year it
// sends as `year`, so the backend's year filter can never exclude the range.
export function arrivalRequestParams({ view, date, month, year, resortId }) {
  if (view === VIEW_MONTH) {
    return { year, ...monthRange(year, month), resort_id: resortId };
  }
  if (view === VIEW_YEAR) {
    return { year, date: "all", resort_id: resortId };
  }
  // A day is filtered by its date alone; its own year is sent for consistency.
  return { year: String(date).slice(0, 4), date, resort_id: resortId };
}

// The view a stored response was for, from the filters the backend echoes back:
// `date=all` was a year, a `from` was a month, a date was a day.
export function viewFromFilters(filters = {}, today) {
  const date = filters.date || "";
  if (date === "all") {
    return { view: VIEW_YEAR, date: today, month: today.slice(5, 7), year: filters.year || today.slice(0, 4) };
  }
  if (filters.from) {
    return {
      view: VIEW_MONTH,
      date: today,
      month: filters.from.slice(5, 7),
      year: filters.from.slice(0, 4),
    };
  }
  const day = date || today;
  return { view: VIEW_DAY, date: day, month: day.slice(5, 7), year: day.slice(0, 4) };
}

// The part of the export filename that names the view.
export function exportDateSlug({ view, date, month, year }) {
  if (view === VIEW_MONTH) {
    return `month-${year}-${month}`;
  }
  if (view === VIEW_YEAR) {
    return `all-dates-${year}`;
  }
  return date;
}

export const ARRIVAL_EXPORT_HEADERS = [
  "Date",
  "Group/Guest",
  "Male",
  "Female",
  "Travel Itinerary",
  "Overnight",
  "Same Day",
  "Resort",
  "Fee Paid",
];

export function arrivalExportRows(rows = []) {
  return rows.map((row) => [
    row.date,
    row.group,
    row.male,
    row.female,
    row.itinerary,
    row.overnight,
    row.sameDay,
    row.resort,
    row.feePaid,
  ]);
}
