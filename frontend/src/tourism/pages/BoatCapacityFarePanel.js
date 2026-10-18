import { useEffect, useMemo, useRef, useState } from "react";
import { FiArrowDown, FiArrowUp, FiPlus } from "react-icons/fi";
import { useTourismData } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";

// The fifth tab of Registration Options: the tiers of the "Boat Capacity and
// Fare" dropdown. It is its own component inside the same shell, and it works
// the way the other tabs do: the list is fetched once, the first time the tab is
// opened, and after that each write puts the server's own ANSWER in place of the
// row. There is no second fetch and no "Loading..." after the first open.

export const FARE_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

// Always on screen.
export const TEXT_NOTE =
  "The chosen tier is saved as text on each record. Renaming or retiring a tier does NOT change old records — they keep the text they already hold, and that text will appear in the record's own dropdown marked (inactive) or (not in the list).";
export const OLD_APP_NOTE =
  "Visitors using an older version of the app may still send the old wording until a new app version is released.";

// Only when no tier is active and a boat type still asks for the field.
export const NO_ACTIVE_WARNING =
  "No tier is active, but at least one boat type still asks for Boat Capacity and Fare. Staff will see an empty dropdown for those boats. Reactivate a tier or add a new one.";

// In the edit form, before anything has been asked: what a rename does here. For
// the fare tiers a rename does NOT change the records that hold the old text (the
// four other lists say the opposite: there the records show the new name).
export const RENAME_NOTE =
  "If records hold the old text of this tier, they keep it when the tier is renamed, and you will be asked to confirm before the rename is made.";

// What the server's own count is asked about. N is the number the SERVER named,
// never the one written in the "Used by" column of this page.
export function renameQuestion(count) {
  return `${count} record(s) hold the old text. They will keep it, and it will show as (not in the list). The tier itself will be renamed. Continue?`;
}

function inOrder(list) {
  return [...list].sort((a, b) => a.display_order - b.display_order || a.id - b.id);
}

function recordsLabel(count) {
  return `${count} record${count === 1 ? "" : "s"}`;
}

// The server's number when it asks for a confirmation of a rename, else null.
function confirmationCount(error) {
  const details = error.details || {};
  if (error.status === 409 && details.code === "confirm_required" && Number.isInteger(details.record_count)) {
    return details.record_count;
  }
  return null;
}

export default function BoatCapacityFarePanel() {
  const { referenceTables, refreshReferenceTables } = useTourismData();
  // undefined until the first load: only then does the panel say "Loading...".
  const [rows, setRows] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState("all");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  // The message of the add / edit form, shown INSIDE that form: one message, where
  // the eye is, and not a second one at the top of the page.
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  // Set when the server asked for a confirmation of a rename: { count } is the
  // number the SERVER named. That number, and no other, is what is confirmed.
  const [ask, setAsk] = useState(null);
  const editFormRef = useRef(null);
  const editNameRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    tourismApi
      .getBoatCapacityFares()
      .then((data) => {
        if (!cancelled) setRows(inOrder(data));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || "The tiers could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  const loading = rows === undefined && !loadError;

  // The tier as the server now holds it goes in place of its row, or into its
  // place by order when it is new. Nothing is worked out here from what was sent.
  function putRow(tier) {
    setRows((current) => {
      const list = current || [];
      if (list.some((item) => item.id === tier.id)) {
        return list.map((item) => (item.id === tier.id ? tier : item));
      }
      return inOrder([...list, tier]);
    });
  }

  // One way to write: send, and on a refusal show the server's own words and
  // change nothing in the list; on success take the server's answer. No refetch.
  // The other pages' reference tables (the record form) are refreshed in the
  // background; this panel neither waits for that nor shows it.
  // A refused rename that asks for a confirmation is not an error: it opens the
  // question, with the number the server named.
  async function write(call, apply, successNotice, inForm = false) {
    setWorking(true);
    setActionError("");
    setFormError("");
    setNotice("");
    try {
      const answer = await call();
      apply(answer);
      if (refreshReferenceTables) {
        Promise.resolve(refreshReferenceTables()).catch(() => {});
      }
      setNotice(successNotice);
      return true;
    } catch (error) {
      const asked = inForm ? confirmationCount(error) : null;
      if (asked !== null) {
        setAsk({ count: asked });
        // the number the server has NOW, for that row too
        setRows((current) => (current || []).map((r) => (r.id === editingId ? { ...r, record_count: asked } : r)));
      } else {
        setAsk(null);
        (inForm ? setFormError : setActionError)(error.message || "The change could not be saved.");
      }
      return false;
    } finally {
      setWorking(false);
    }
  }

  const activeCount = useMemo(() => (rows || []).filter((row) => row.is_active).length, [rows]);
  // A boat type that is still in use (not retired) and asks for the field.
  const someBoatAsksForIt = useMemo(
    () =>
      ((referenceTables && referenceTables.boatTypes) || []).some(
        (boat) => boat.requires_capacity_fare === true && boat.is_active !== false
      ),
    [referenceTables]
  );
  const showNoActiveWarning = rows !== undefined && activeCount === 0 && someBoatAsksForIt;

  const visibleRows = useMemo(() => {
    const list = rows || [];
    if (filter === "active") return list.filter((row) => row.is_active);
    if (filter === "inactive") return list.filter((row) => !row.is_active);
    return list;
  }, [rows, filter]);

  const editing = (rows || []).find((row) => row.id === editingId) || null;
  const canReorder = filter === "all";

  function startEdit(row) {
    setEditingId(row.id);
    setEditName(row.name);
    setAdding(false);
    setAsk(null);
    setActionError("");
    setFormError("");
    setNotice("");
  }

  function stopEdit() {
    setEditingId(null);
    setAsk(null);
    setFormError("");
  }

  // When Edit is pressed the form is at the TOP of the list: bring it into view
  // and put the cursor in the name field. The same in all five tabs.
  useEffect(() => {
    if (editingId === null) return;
    const form = editFormRef.current;
    if (!form) return;
    if (typeof form.scrollIntoView === "function") form.scrollIntoView({ block: "start", behavior: "smooth" });
    const name = editNameRef.current;
    const target = name && !name.disabled ? name : form.querySelector("input:not(:disabled)");
    (target || form).focus();
  }, [editingId]);

  async function submitAdd(event) {
    event.preventDefault();
    const ok = await write(
      () => tourismApi.createBoatCapacityFare({ name: addName }),
      putRow,
      "The tier was added.",
      true
    );
    if (ok) {
      setAdding(false);
      setAddName("");
    }
  }

  // The first try is sent WITHOUT a confirmation: the server alone says whether
  // records hold the old text and how many. When confirmedCount is given it is the
  // number the server named in its last refusal, not the one shown in the table.
  async function sendRename(confirmedCount) {
    const payload = { name: editName };
    if (confirmedCount !== undefined) payload.confirm_affected_records = confirmedCount;
    const ok = await write(
      () => tourismApi.updateBoatCapacityFare(editing.id, payload),
      putRow,
      "The tier was renamed.",
      true
    );
    if (ok) stopEdit();
  }

  function submitEdit(event) {
    event.preventDefault();
    sendRename();
  }

  // The whole list of ids in the new order; the server answers with the list.
  function move(index, step) {
    const ids = rows.map((row) => row.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    write(
      () => tourismApi.reorderBoatCapacityFares(ids),
      (answer) => setRows(inOrder(answer)),
      "The order was changed."
    );
  }

  return (
    <div className="boat-fare-panel" aria-label="Boat Capacity and Fare tiers">
      <div className="options-form-actions">
        <button
          type="button"
          className="green"
          onClick={() => {
            setAdding((open) => !open);
            stopEdit();
            setActionError("");
            setNotice("");
          }}
          disabled={working}
        >
          <FiPlus />
          Add tier
        </button>
      </div>

      <div className="hotlines-notices" role="note" aria-label="About the Boat Capacity and Fare tiers">
        <p>{TEXT_NOTE}</p>
        <p>{OLD_APP_NOTE}</p>
      </div>

      {showNoActiveWarning ? (
        <p className="options-reason" role="alert">
          {NO_ACTIVE_WARNING}
        </p>
      ) : null}

      <p className="options-intro">
        A tier that is deactivated is no longer offered for new records. It stays on the records that already hold
        it. Tiers are never deleted.
      </p>

      <div className="options-message-area">
        {notice ? (
          <p className="settings-status success" role="status">
            {notice}
          </p>
        ) : null}
        {actionError ? (
          <p className="settings-status error" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>

      {adding ? (
        <form className="settings-card options-form" onSubmit={submitAdd} aria-label="Add a tier">
          <div className="report-card-title">
            <h3>New tier</h3>
          </div>
          <label className="settings-field">
            <span>Tier text</span>
            <input
              type="text"
              aria-label="New tier text"
              value={addName}
              maxLength={160}
              onChange={(event) => setAddName(event.target.value)}
            />
          </label>
          {formError ? (
            <p className="options-reason" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="options-form-actions">
            <button type="button" className="tourist-record-cancel" onClick={() => setAdding(false)} disabled={working}>
              Cancel
            </button>
            <button type="submit" className="tourist-record-save" disabled={working || addName.trim() === ""}>
              {working ? "Saving..." : "Save new tier"}
            </button>
          </div>
        </form>
      ) : null}

      {editing ? (
        <form
          className="settings-card options-form"
          onSubmit={submitEdit}
          aria-label={`Edit ${editing.name}`}
          ref={editFormRef}
          tabIndex={-1}
        >
          <div className="report-card-title">
            <h3>Rename a tier</h3>
            <p>Used by {recordsLabel(editing.record_count)}.</p>
          </div>
          <label className="settings-field">
            <span>Tier text</span>
            <input
              type="text"
              aria-label="Tier text"
              ref={editNameRef}
              value={editName}
              maxLength={160}
              disabled={working || Boolean(ask)}
              onChange={(event) => setEditName(event.target.value)}
            />
          </label>

          {/* ONE message at a time: the question, else the refusal, else the note. */}
          {ask ? (
            <div className="options-confirm" role="alertdialog" aria-label="Confirm the rename">
              <p>{renameQuestion(ask.count)}</p>
              <div className="options-form-actions">
                <button type="button" className="tourist-record-cancel" onClick={() => setAsk(null)} disabled={working}>
                  Back
                </button>
                <button
                  type="button"
                  className="tourist-record-save"
                  onClick={() => sendRename(ask.count)}
                  disabled={working}
                >
                  {working ? "Saving..." : "Yes, rename"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {formError ? (
                <p className="options-reason" role="alert">
                  {formError}
                </p>
              ) : editing.record_count > 0 ? (
                <p className="options-reason" role="note">
                  {RENAME_NOTE}
                </p>
              ) : null}
              <div className="options-form-actions">
                <button type="button" className="tourist-record-cancel" onClick={stopEdit} disabled={working}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tourist-record-save"
                  disabled={working || editName.trim() === "" || editName === editing.name}
                >
                  {working ? "Saving..." : "Save"}
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}

      <section className="settings-card options-card" aria-label="Boat Capacity and Fare tiers">
        <div className="options-toolbar">
          <div className="report-card-title">
            <h3>Boat Capacity and Fare</h3>
          </div>
          <label className="settings-field options-filter">
            <span>Show</span>
            <select aria-label="Filter tiers by status" value={filter} onChange={(event) => setFilter(event.target.value)}>
              {FARE_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!canReorder ? <p className="options-hint">The order can only be changed while all tiers are shown.</p> : null}

        {loading ? <p className="options-empty">Loading...</p> : null}
        {loadError ? (
          <p className="settings-status error" role="alert">
            {loadError}{" "}
            <button type="button" className="reply-btn" onClick={() => setRetry((count) => count + 1)}>
              Try again
            </button>
          </p>
        ) : null}

        {!loading && !loadError ? (
          <table className="options-table">
            <thead>
              <tr>
                <th>Tier text</th>
                <th>Order</th>
                <th>Used by</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? (
                visibleRows.map((row) => {
                  const index = rows.findIndex((item) => item.id === row.id);
                  return (
                    <tr
                      key={row.id}
                      className={row.is_active ? "" : "options-row-inactive"}
                      data-testid={`fare-row-${row.id}`}
                    >
                      <td>{row.name}</td>
                      <td>{row.display_order}</td>
                      <td>{recordsLabel(row.record_count)}</td>
                      <td>
                        <span className={`options-status ${row.is_active ? "active" : "inactive"}`}>
                          {row.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <div className="options-actions">
                          <button
                            type="button"
                            className="reply-btn"
                            aria-label={`Move ${row.name} up`}
                            disabled={working || !canReorder || index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <FiArrowUp />
                          </button>
                          <button
                            type="button"
                            className="reply-btn"
                            aria-label={`Move ${row.name} down`}
                            disabled={working || !canReorder || index === rows.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <FiArrowDown />
                          </button>
                          <button
                            type="button"
                            className="reply-btn"
                            aria-label={`Edit ${row.name}`}
                            disabled={working}
                            onClick={() => startEdit(row)}
                          >
                            Edit
                          </button>
                          {row.is_active ? (
                            <button
                              type="button"
                              className="reply-btn"
                              aria-label={`Deactivate ${row.name}`}
                              disabled={working}
                              onClick={() =>
                                write(
                                  () => tourismApi.deactivateBoatCapacityFare(row.id),
                                  putRow,
                                  "The tier was deactivated."
                                )
                              }
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="reply-btn"
                              aria-label={`Reactivate ${row.name}`}
                              disabled={working}
                              onClick={() =>
                                write(
                                  () => tourismApi.reactivateBoatCapacityFare(row.id),
                                  putRow,
                                  "The tier was reactivated."
                                )
                              }
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="options-empty">
                    No tiers to show for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  );
}
