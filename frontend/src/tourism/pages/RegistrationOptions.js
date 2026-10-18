import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiPlus } from "react-icons/fi";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";
import { canManageOptions } from "../optionsAccess";
import { tourismApi } from "../services/tourismApi";
import BoatCapacityFarePanel from "./BoatCapacityFarePanel";

// The lists an admin can manage. `kind` is the word the API uses. The first
// four are reference options (records point at them by id). The fifth, the
// Boat Capacity and Fare tiers, is different: a record keeps the tier as TEXT,
// so it has its own panel and its own endpoints (BoatCapacityFarePanel).
export const FARE_KIND = "boat-capacity-fare";
export const OPTION_TABS = [
  { kind: "itinerary", label: "Travel Itinerary" },
  { kind: "travel-mode", label: "Vehicle Classification" },
  { kind: "boat-type", label: "Boat Classification" },
  { kind: "visit-purpose", label: "Visit Purpose" },
  { kind: FARE_KIND, label: "Boat Capacity and Fare" },
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
// What a rename means for the four reference lists: the records point at the option,
// so they all show the new name. (The fare tab says the OPPOSITE: its records keep
// the text they hold. Do not mix the two.)
export const REFERENCE_RENAME_EFFECT = "all records using this option will now show the new name";
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
  // The rows of each tab, by kind. A tab that has not been opened yet has no
  // entry (undefined): only then does the page say "Loading...".
  const [lists, setLists] = useState({});
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const [filter, setFilter] = useState("all");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  // The message of a form (add or edit) shown INSIDE that form: one message, where
  // the eye is, instead of a second one at the top of the page.
  const [formError, setFormError] = useState("");
  const editFormRef = useRef(null);
  const editNameRef = useRef(null);
  const [notice, setNotice] = useState("");

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addStay, setAddStay] = useState("");
  const [addAsksFare, setAddAsksFare] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editStay, setEditStay] = useState("");
  const [confirming, setConfirming] = useState(false);
  // The count the server named when it refused a confirmation because the
  // number had changed; it replaces the one on screen, the list stays as it is.
  const [countFromServer, setCountFromServer] = useState(null);

  // The list is fetched once per tab, the first time the tab is opened. After
  // that it is kept in step by the server's answer to each write, never by a
  // second fetch.
  useEffect(() => {
    // The fare tab fetches its own list (BoatCapacityFarePanel), not this one.
    if (kind === FARE_KIND) return undefined;
    if (listsRef.current[kind] !== undefined) return undefined;
    let cancelled = false;
    setLoadError("");
    tourismApi
      .getReferenceOptions(kind)
      .then((data) => {
        if (!cancelled) setLists((current) => ({ ...current, [kind]: data }));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || "The options could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [kind, retry]);

  const rows = lists[kind];
  const loading = rows === undefined && !loadError;
  const isFare = kind === FARE_KIND;
  // The fare panel is mounted the first time its tab is opened and then stays
  // mounted (hidden when another tab is open), so coming back to it shows the
  // list as it was: no second fetch, no "Loading...".
  const [fareOpened, setFareOpened] = useState(false);

  function selectTab(next) {
    if (next === kind) return;
    if (next === FARE_KIND) setFareOpened(true);
    setKind(next);
    setAdding(false);
    setEditingId(null);
    setConfirming(false);
    setCountFromServer(null);
    setLoadError("");
    setActionError("");
    setFormError("");
    setNotice("");
  }

  // The whole option as the server now holds it (every write answers with it)
  // goes in place of its row, or into its place by id when it is new. Nothing
  // is worked out here from what was sent.
  function putOption(which, option) {
    setLists((current) => {
      const list = current[which] || [];
      if (list.some((item) => item.id === option.id)) {
        return { ...current, [which]: list.map((item) => (item.id === option.id ? option : item)) };
      }
      const at = list.findIndex((item) => item.id > option.id);
      const next = at === -1 ? [...list, option] : [...list.slice(0, at), option, ...list.slice(at)];
      return { ...current, [which]: next };
    });
  }

  // One way to write: send the request, show the server's own message if it
  // refuses (and then change nothing in the list), and after a success put the
  // server's answer in the list. There is no second fetch. The other pages'
  // reference tables are refreshed in the background; this page does not wait
  // for them and does not show them.
  async function write(call, successNotice, inForm = false) {
    const which = kind;
    setWorking(true);
    setActionError("");
    setFormError("");
    setNotice("");
    try {
      const option = await call();
      putOption(which, option);
      if (refreshReferenceTables) {
        Promise.resolve(refreshReferenceTables()).catch(() => {});
      }
      setNotice(successNotice);
      return true;
    } catch (error) {
      (inForm ? setFormError : setActionError)(error.message || "The change could not be saved.");
      if (
        error.status === 409 &&
        error.details &&
        error.details.code === "confirmation_required" &&
        Number.isInteger(error.details.record_count)
      ) {
        setCountFromServer(error.details.record_count);
      }
      return false;
    } finally {
      setWorking(false);
    }
  }

  const activeCount = useMemo(() => (rows || []).filter((row) => row.is_active).length, [rows]);

  const visibleRows = useMemo(() => {
    const list = rows || [];
    if (filter === "active") return list.filter((row) => row.is_active);
    if (filter === "inactive") return list.filter((row) => !row.is_active);
    return list;
  }, [rows, filter]);

  const editing = (rows || []).find((row) => row.id === editingId) || null;
  // The number shown and sent: what the server last said for this option.
  const affectedCount = countFromServer !== null ? countFromServer : editing ? editing.record_count : 0;

  function startEdit(row) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditStay(row.stay_nights === null || row.stay_nights === undefined ? "" : String(row.stay_nights));
    setConfirming(false);
    setCountFromServer(null);
    setActionError("");
    setFormError("");
    setNotice("");
    setAdding(false);
  }

  function stopEdit() {
    setEditingId(null);
    setConfirming(false);
    setCountFromServer(null);
    setFormError("");
  }

  // When Edit is pressed the form is at the TOP of the list: bring it into view
  // and put the cursor in the name field (or, if the name is locked, in the first
  // field that can be typed in). The same in all five tabs.
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
    const payload = { name: addName };
    if (kind === "itinerary" && addStay.trim() !== "") payload.stay_nights = parseStay(addStay);
    if (kind === "boat-type") payload.requires_capacity_fare = addAsksFare;
    const ok = await write(() => tourismApi.createReferenceOption(kind, payload), "The option was added.", true);
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
    payload.confirm_affected_records = affectedCount;
    const ok = await write(
      () => tourismApi.updateReferenceOption(kind, editing.id, payload),
      "The change was saved.",
      true
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
          {isFare ? null : (
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
          )}
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

      {fareOpened ? (
        <div hidden={!isFare}>
          <BoatCapacityFarePanel />
        </div>
      ) : null}

      {!isFare ? (
        <>
            <p className="options-intro">
              An option that is deactivated is no longer offered for new registrations. It stays on the records
              that already use it, and in the reports. Options are never deleted.
            </p>

            {/* Always the same height, so a message appearing does not move the page. */}
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
              <form className="settings-card options-form" onSubmit={submitAdd} aria-label={`Add to ${tabLabel}`}>
                <div className="report-card-title">
                  <h3>New option in {tabLabel}</h3>
                </div>
                <label className="settings-field settings-field-wide">
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
                    {working ? "Saving..." : "Save new option"}
                  </button>
                </div>
              </form>
            ) : null}

            {editing ? (
              <section
                className="settings-card options-form options-edit-form"
                aria-label={`Edit ${editing.name}`}
                ref={editFormRef}
                tabIndex={-1}
              >
                <div className="report-card-title">
                  <h3>Edit {editing.name}</h3>
                  <p>Used by {recordsLabel(affectedCount)}.</p>
                </div>

                <label className="settings-field settings-field-wide">
                  <span>Name</span>
                  <input
                    type="text"
                    aria-label="Option name"
                    ref={editNameRef}
                    value={editName}
                    maxLength={120}
                    disabled={nameLocked || working || confirming}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                </label>
                {!formError && protectedName ? (
                  <p className="options-reason" role="note">
                    {PROTECTED_REASON}
                  </p>
                ) : null}
                {!formError && !protectedName && stayMissing ? (
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

                {formError ? (
                  <p className="options-reason" role="alert">
                    {formError}
                  </p>
                ) : null}

                {confirming ? (
                  <div className="options-confirm" role="alertdialog" aria-label="Confirm the change">
                    <p>
                      This change applies to every record that uses this option and to every report:{" "}
                      {REFERENCE_RENAME_EFFECT}.{" "}
                      {affectedCount === 0
                        ? "No record uses it yet."
                        : `It affects ${recordsLabel(affectedCount)}.`}
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
                  <button type="button" className="reply-btn" onClick={() => setRetry((count) => count + 1)}>
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
        </>
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
