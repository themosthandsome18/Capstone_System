// What the Record Management table does the moment a button is pressed, before the server has answered, and how it undoes it when the server
// says no. Every function takes the table's state (`bookingManagement`: filters, summary, archivedCount, pagination, rows) and returns a new one.
//
// The rule: the screen never lies. A change is shown at once, settled on the server's answer when it comes, and taken back (the row where it
// was, the numbers as they were) when the server refuses.

export const bookingSummaryKeysByStatus = {
  pending: "pending",
  arrived: "arrived",
  no_show: "noShow",
};

export function adjustBookingSummary(summary, previousStatus, nextStatus) {
  if (!previousStatus || !nextStatus || previousStatus === nextStatus) {
    return summary;
  }

  const previousKey = bookingSummaryKeysByStatus[previousStatus];
  const nextKey = bookingSummaryKeysByStatus[nextStatus];
  const nextSummary = { ...summary };

  if (previousKey) {
    nextSummary[previousKey] = Math.max((nextSummary[previousKey] || 0) - 1, 0);
  }

  if (nextKey) {
    nextSummary[nextKey] = (nextSummary[nextKey] || 0) + 1;
  }

  return nextSummary;
}

// Where the table is, after `total` changed: the page count and the "Showing a-b of n" numbers follow the rows that are on the page.
function withTotal(pagination = {}, total, rowsOnPage) {
  const pageSize = pagination.pageSize || 10;
  const page = pagination.page || 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingStart = total ? (page - 1) * pageSize + 1 : 0;
  return {
    ...pagination,
    total,
    totalPages,
    hasNext: page < totalPages,
    showingStart,
    showingEnd: total ? Math.min(showingStart - 1 + rowsOnPage, total) : 0,
  };
}

export function updateBookingManagementRecord(bookingManagement, surveyId, updatedRecord) {
  const currentRows = bookingManagement.rows || [];
  const previousRow = currentRows.find((record) => record.survey_id === surveyId);

  if (!previousRow) {
    return bookingManagement;
  }

  const nextRow = { ...previousRow, ...updatedRecord };
  const statusFilter = bookingManagement.filters?.status || "";
  const previousStatus = previousRow.status;
  const nextStatus = nextRow.status;
  const rows = currentRows
    .map((record) => (record.survey_id === surveyId ? nextRow : record))
    .filter((record) => !statusFilter || record.status === statusFilter);
  const summary = adjustBookingSummary(bookingManagement.summary, previousStatus, nextStatus);
  const rowWasRemoved = rows.length < currentRows.length;

  return {
    ...bookingManagement,
    rows,
    summary,
    pagination: {
      ...bookingManagement.pagination,
      total: rowWasRemoved
        ? Math.max((bookingManagement.pagination.total || 0) - 1, 0)
        : bookingManagement.pagination.total,
    },
  };
}

// ---- mark as arrived / mark as cancelled -------------------------------------------------------------------------------------------------

// The status changed at once. Returns { next, undo }: `undo(current)` puts the row, the three cards and the page numbers back as they were.
export function applyStatus(bookingManagement, surveyId, nextStatus) {
  const rows = bookingManagement.rows || [];
  const index = rows.findIndex((record) => record.survey_id === surveyId);
  if (index < 0) {
    return { next: bookingManagement, undo: (current) => current };
  }
  const previousRow = rows[index];
  const next = updateBookingManagementRecord(bookingManagement, surveyId, { status: nextStatus });
  const removed = next.rows.length < rows.length;

  return {
    next,
    undo(current) {
      const currentRows = current.rows || [];
      const shown = currentRows.find((record) => record.survey_id === surveyId);
      if (shown) {
        // Still on the page. Take it back only if it still shows OUR change; if a newer list from the server replaced it, that list is the truth.
        if (shown.status !== nextStatus) return current;
        return {
          ...current,
          rows: currentRows.map((record) => (record.survey_id === surveyId ? previousRow : record)),
          summary: adjustBookingSummary(current.summary, nextStatus, previousRow.status),
        };
      }
      if (!removed) return current;
      const restored = [...currentRows];
      restored.splice(Math.min(index, restored.length), 0, previousRow);
      return {
        ...current,
        rows: restored,
        summary: adjustBookingSummary(current.summary, nextStatus, previousRow.status),
        pagination: withTotal(current.pagination, (current.pagination?.total || 0) + 1, restored.length),
      };
    },
  };
}

// ---- archive / unarchive ------------------------------------------------------------------------------------------------------------------

// Archiving takes the row off the table when the table lists Active ones, and unarchiving does when it lists Archived ones; in "All" the row
// stays and only its mark changes. The "N archived" follows at once. No other number moves: the three cards count the archived too.
// Returns { next, undo }.
export function applyArchive(bookingManagement, surveyId, archived, nowIso = new Date().toISOString()) {
  const rows = bookingManagement.rows || [];
  const index = rows.findIndex((record) => record.survey_id === surveyId);
  const previousRow = index < 0 ? null : rows[index];
  const unchanged = { next: bookingManagement, undo: (current) => current };
  if (!previousRow || Boolean(previousRow.is_archived) === archived) {
    return unchanged;
  }

  const view = bookingManagement.filters?.archived || "active";
  const removed = (view === "active" && archived) || (view === "archived" && !archived);
  const delta = archived ? 1 : -1;
  const nextRows = removed
    ? rows.filter((record) => record.survey_id !== surveyId)
    : rows.map((record) =>
        record.survey_id === surveyId
          ? { ...record, is_archived: archived, archived_at: archived ? nowIso : null }
          : record
      );
  const total = Math.max((bookingManagement.pagination?.total || 0) - (removed ? 1 : 0), 0);

  const next = {
    ...bookingManagement,
    rows: nextRows,
    archivedCount: Math.max((Number(bookingManagement.archivedCount) || 0) + delta, 0),
    pagination: removed ? withTotal(bookingManagement.pagination, total, nextRows.length) : bookingManagement.pagination,
  };

  return {
    next,
    undo(current) {
      const currentRows = current.rows || [];
      const shown = currentRows.find((record) => record.survey_id === surveyId);
      if (shown) {
        // Still on the page (the "All" view). Take it back only if it still shows OUR change; a newer list from the server is the truth.
        if (Boolean(shown.is_archived) !== archived) return current;
        return {
          ...current,
          rows: currentRows.map((record) => (record.survey_id === surveyId ? previousRow : record)),
          archivedCount: Math.max((Number(current.archivedCount) || 0) - delta, 0),
        };
      }
      if (!removed) return current;
      const restored = [...currentRows];
      restored.splice(Math.min(index, restored.length), 0, previousRow);
      return {
        ...current,
        rows: restored,
        archivedCount: Math.max((Number(current.archivedCount) || 0) - delta, 0),
        pagination: withTotal(current.pagination, (current.pagination?.total || 0) + 1, restored.length),
      };
    },
  };
}

// The server answered: settle on its word. It sends the record's archive state and the "N archived" for the year asked, so no list is read.
export function settleArchive(bookingManagement, answer = {}) {
  const count = Number(answer.archivedCount);
  return {
    ...bookingManagement,
    archivedCount: Number.isFinite(count) ? count : bookingManagement.archivedCount,
    rows: (bookingManagement.rows || []).map((record) =>
      record.survey_id === answer.survey_id && typeof answer.is_archived === "boolean"
        ? { ...record, is_archived: answer.is_archived, archived_at: answer.archived_at || null }
        : record
    ),
  };
}
