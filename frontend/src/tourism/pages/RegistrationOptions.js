import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiPlus } from "react-icons/fi";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";
import { canManageOptions } from "../optionsAccess";
import { tourismApi } from "../services/tourismApi";

// The four lists an admin can manage. `kind` is the word the API uses.
export const OPTION_TABS = [
  { kind: "itinerary", label: "Travel Itinerary" },
  { kind: "travel-mode", label: "Vehicle Classification" },
  { kind: "boat-type", label: "Boat Classification" },
  { kind: "visit-purpose", label: "Visit Purpose" },
];

export const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

// What a person is told when something is locked. They are shown next to the
// thing that is locked, never replaced by a hidden or missing button.
export const PROTECTED_REASON =
  "This name is created by the Excel import. If it were renamed, the next import would create a new option under the old name and the reports would be split between the two.";
export const STAY_NOT_SET_REASON =
  "The name cannot be changed yet. The reports still work out how long this stay is from its name, so renaming it would change the Same Day / Overnight and average-stay figures. Set the stay length first.";
export const LAST_ACTIVE_REASON =
  "This is the last active option in the list, so it cannot be deactivated: a new registration would have nothing to choose. Add or reactivate another option first.";

function stayLabel(value) {
  if (value === null || value === undefined) return "Not set";
  if (value === 0) return "Same day";
  return `${value} night${value === 1 ? "" : "s"}`;
}

function recordsLabel(count) {
  return `${count} record${count === 1 ? "" : "s"}`;
}

// "" (not set) or a whole number; anything else is reported by the server.
function parseStay(text) {
  const trimmed = String(text).trim();
  return trimmed === "" ? null : Number(trimmed);
}

function RegistrationOptionsPage() {
  const { refreshReferenceTables } = useTourismData();
  const [kind, setKind] = useState(OPTION_TABS[0].kind);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("all");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addStay, setAddStay] = useState("");
  const [addAsksFare, setAddAsksFare] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editStay, setEditStay] = useState("");
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (which) => {
    setLoading(true);
    setLoadError("");
    try {
      setRows(await tourismApi.getReferenceOptions(which));
    } catch (error) {
      setRows([]);
      setLoadError(error.message || "The options could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(kind);
  }, [kind, load]);

  function selectTab(next) {
    if (next === kind) return;
    setKind(next);
    setAdding(false);
    setEditingId(null);
    setConfirming(false);
    setActionError("");
    setNotice("");
  }

  // One way to write: run the call, show the server's own message if it
  // refuses, and after a success read the list again from the server (the new
  // state is never guessed from what was sent).
  async function write(call, successNotice) {
    setWorking(true);
    setActionError("");
    setNotice("");
    try {
      await call();
      await load(kind);
      if (refreshReferenceTables) refreshReferenceTables();
      setNotice(successNotice);
      return true;
    } catch (error) {
      setActionError(error.message || "The change could not be saved.");
      // A refused count means the number changed under us: read it again.
      if (error.status === 409) await load(kind);
      return false;
    } finally {
      setWorking(false);
    }
  }

  const activeCount = useMemo(() => rows.filter((row) => row.is_active).length, [rows]);

  const visibleRows = useMemo(() => {
    if (filter === "active") return rows.filter((row) => row.is_active);
    if (filter === "inactive") return rows.filter((row) => !row.is_active);
    return rows;
  }, [rows, filter]);

  const editing = rows.find((row) => row.id === editingId) || null;

  function startEdit(row) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditStay(row.stay_nights === null || row.stay_nights === undefined ? "" : String(row.stay_nights));
    setConfirming(false);
    setActionError("");
    setNotice("");
    setAdding(false);
  }

  function stopEdit() {
    setEditingId(null);
    setConfirming(false);
  }

  async function submitAdd(event) {
    event.preventDefault();
    const payload = { name: addName };
    if (kind === "itinerary" && addStay.trim() !== "") payload.stay_nights = parseStay(addStay);
    if (kind === "boat-type") payload.requires_capacity_fare = addAsksFare;
    const ok = await write(() => tourismApi.createReferenceOption(kind, payload), "The option was added.");
    if (ok) {
      setAdding(false);
      setAddName("");
      setAddStay("");
      setAddAsksFare(false);
    }
  }

  // What the edit panel would change, compared with what the server last said.
  const nameChanged = editing ? editName.trim() !== editing.name : false;
  const stayChanged =
    editing && kind === "itinerary"
      ? parseStay(editStay) !== (editing.stay_nights ?? null)
      : false;
  const hasChange = nameChanged || stayChanged;

  // The name is locked when the import makes it, or when the itinerary has no
  // stay length yet (the reports still read the length from the name). Setting
  // a stay length in the same edit unlocks the name, as the server allows.
  const protectedName = Boolean(editing && editing.rename_protected);
  const stayMissing = Boolean(editing && kind === "itinerary" && parseStay(editStay) === null);
  const nameLocked = protectedName || stayMissing;

  async function saveEdit() {
    const payload = {};
    if (nameChanged) payload.name = editName;
    if (stayChanged) payload.stay_nights = parseStay(editStay);
    // The number comes from the server's last answer, never from the person.
    payload.confirm_affected_records = editing.record_count;
    const ok = await write(
      () => tourismApi.updateReferenceOption(kind, editing.id, payload),
      "The change was saved."
    );
    if (ok) stopEdit();
    else setConfirming(false);
  }

  const tabLabel = OPTION_TABS.find((tab) => tab.kind === kind).label;

  return (
    <div className="reports-page settings-page options-page">
      <div className="reports-header">
        <div>
          <h1>Registration Options</h1>
          <p>The choices offered when a visit is registered</p>
        </div>

        <div className="reports-actions">
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
            Add option
          </button>
        </div>
      </div>

      <div className="report-tabs" role="tablist" aria-label="Registration option lists">
        {OPTION_TABS.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            role="tab"
            aria-selected={tab.kind === kind}
            className={tab.kind === kind ? "active" : ""}
            onClick={() => selectTab(tab.kind)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="options-intro">
        An option that is deactivated is no longer offered for new registrations. It stays on the records
        that already use it, and in the reports. Options are never deleted.
      </p>

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

      {adding ? (
        <form className="settings-card options-form" onSubmit={submitAdd} aria-label={`Add to ${tabLabel}`}>
          <div className="report-card-title">
            <h3>New option in {tabLabel}</h3>
          </div>
          <label className="settings-field">
            <span>Name</span>
            <input
              type="text"
              aria-label="New option name"
              value={addName}
              maxLength={120}
              onChange={(event) => setAddName(event.target.value)}
            />
          </label>
          {kind === "itinerary" ? (
            <label className="settings-field">
              <span>Stay length (nights)</span>
              <input
                type="number"
                aria-label="New option stay length in nights"
                min={0}
                max={60}
                value={addStay}
                onChange={(event) => setAddStay(event.target.value)}
              />
              <small className="options-hint">0 = same day. Leave empty if it is not decided yet.</small>
            </label>
          ) : null}
          {kind === "boat-type" ? (
            <label className="options-check">
              <input
                type="checkbox"
                checked={addAsksFare}
                onChange={(event) => setAddAsksFare(event.target.checked)}
              />
              <span>Asks for Boat Capacity and Fare</span>
            </label>
          ) : null}
          <div className="options-form-actions">
            <button type="button" className="tourist-record-cancel" onClick={() => setAdding(false)} disabled={working}>
              Cancel
            </button>
            <button type="submit" className="tourist-record-save" disabled={working || addName.trim() === ""}>
              {working ? "Saving..." : "Save new option"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="settings-card options-card" aria-label={`${tabLabel} options`}>
        <div className="options-toolbar">
          <div className="report-card-title">
            <h3>{tabLabel}</h3>
          </div>
          <label className="settings-field options-filter">
            <span>Show</span>
            <select aria-label="Filter by status" value={filter} onChange={(event) => setFilter(event.target.value)}>
              {FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? <p className="options-empty">Loading...</p> : null}
        {loadError ? (
          <p className="settings-status error" role="alert">
            {loadError}{" "}
            <button type="button" className="reply-btn" onClick={() => load(kind)}>
              Try again
            </button>
          </p>
        ) : null}

        {!loading && !loadError ? (
          <table className="options-table">
            <thead>
              <tr>
                <th>Name</th>
                {kind === "itinerary" ? <th>Stay length</th> : null}
                {kind === "boat-type" ? <th>Asks for fare</th> : null}
                <th>Used by</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? (
                visibleRows.map((row) => {
                  const lastActive = row.is_active && activeCount === 1;
                  return (
                    <tr
                      key={row.id}
                      className={row.is_active ? "" : "options-row-inactive"}
                      data-testid={`option-row-${row.id}`}
                    >
                      <td>
                        {row.name}
                        {row.rename_protected ? (
                          <span className="options-tag" title={PROTECTED_REASON}>
                            Name set by the import
                          </span>
                        ) : null}
                      </td>
                      {kind === "itinerary" ? <td>{stayLabel(row.stay_nights)}</td> : null}
                      {kind === "boat-type" ? <td>{row.requires_capacity_fare ? "Yes" : "No"}</td> : null}
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
                            aria-label={`Edit ${row.name}`}
                            onClick={() => startEdit(row)}
                            disabled={working}
                          >
                            Edit
                          </button>
                          {row.is_active ? (
                            <button
                              type="button"
                              className="reply-btn"
                              aria-label={`Deactivate ${row.name}`}
                              disabled={working || lastActive}
                              onClick={() =>
                                write(
                                  () => tourismApi.deactivateReferenceOption(kind, row.id),
                                  `${row.name} was deactivated.`
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
                                  () => tourismApi.reactivateReferenceOption(kind, row.id),
                                  `${row.name} was reactivated.`
                                )
                              }
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                        {lastActive ? <p className="options-reason">{LAST_ACTIVE_REASON}</p> : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="options-empty">
                    No options to show for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : null}
      </section>

      {editing ? (
        <section className="settings-card options-form" aria-label={`Edit ${editing.name}`}>
          <div className="report-card-title">
            <h3>Edit {editing.name}</h3>
            <p>Used by {recordsLabel(editing.record_count)}.</p>
          </div>

          <label className="settings-field">
            <span>Name</span>
            <input
              type="text"
              aria-label="Option name"
              value={editName}
              maxLength={120}
              disabled={nameLocked || working || confirming}
              onChange={(event) => setEditName(event.target.value)}
            />
          </label>
          {protectedName ? (
            <p className="options-reason" role="note">
              {PROTECTED_REASON}
            </p>
          ) : null}
          {!protectedName && stayMissing ? (
            <p className="options-reason" role="note">
              {STAY_NOT_SET_REASON}
            </p>
          ) : null}

          {kind === "itinerary" ? (
            <label className="settings-field">
              <span>Stay length (nights)</span>
              <input
                type="number"
                aria-label="Stay length in nights"
                min={0}
                max={60}
                value={editStay}
                disabled={working || confirming}
                onChange={(event) => setEditStay(event.target.value)}
              />
              <small className="options-hint">
                0 = same day. Empty = not set, and the reports read the length from the name.
              </small>
            </label>
          ) : null}

          {confirming ? (
            <div className="options-confirm" role="alertdialog" aria-label="Confirm the change">
              <p>
                This change applies to every record that uses this option and to every report.{" "}
                {editing.record_count === 0
                  ? "No record uses it yet."
                  : `It affects ${recordsLabel(editing.record_count)}.`}
              </p>
              <div className="options-form-actions">
                <button type="button" className="tourist-record-cancel" onClick={() => setConfirming(false)} disabled={working}>
                  Back
                </button>
                <button type="button" className="tourist-record-save" onClick={saveEdit} disabled={working}>
                  {working ? "Saving..." : "Confirm and save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="options-form-actions">
              <button type="button" className="tourist-record-cancel" onClick={stopEdit} disabled={working}>
                Cancel
              </button>
              <button
                type="button"
                className="tourist-record-save"
                onClick={() => setConfirming(true)}
                disabled={working || !hasChange}
              >
                Save changes
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

// The page itself refuses anyone but the admin (the route and the sidebar do
// too): a person who is sent here by a stale link is sent away.
export default function RegistrationOptions() {
  const { role } = useAuth();
  if (!canManageOptions(role)) {
    return <Navigate to="/" replace />;
  }
  return <RegistrationOptionsPage />;
}
