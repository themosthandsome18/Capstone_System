import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiArrowDown, FiArrowUp, FiPlus } from "react-icons/fi";
import { useAuth } from "../../auth/AuthContext";
import { canManageHotlines } from "../hotlinesAccess";
import { tourismApi } from "../services/tourismApi";

// The five categories the server accepts (EmergencyContact.CATEGORY_CHOICES).
// The app decides the icon and colour of each; only the code is stored.
export const CATEGORIES = [
  { value: "rescue", label: "Rescue" },
  { value: "police", label: "Police" },
  { value: "coast_guard", label: "Coast Guard" },
  { value: "desk", label: "Help desk" },
  { value: "other", label: "Other" },
];

export const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

// Always on screen. The first one stops an admin from thinking that visitors
// see a change at once; the second says why an empty list is safe.
export const NEXT_VERSION_NOTICE =
  "Changes here reach the mobile app only when the next version of the app is released.";
export const EMPTY_LIST_NOTICE =
  "If no contact is active, the app falls back to its own built-in list, so the emergency numbers are never missing — even with no internet.";

const BLANK = { name: "", category: "other", contact_numbers: "", email: "", hours: "", description: "" };
const FIELDS = ["name", "category", "contact_numbers", "email", "hours", "description"];

const categoryLabel = (code) => (CATEGORIES.find((item) => item.value === code) || { label: code }).label;

// Where a contact the server just made belongs: by its display_order, then id.
function inOrder(list) {
  return [...list].sort((a, b) => a.display_order - b.display_order || a.id - b.id);
}

function EmergencyHotlinesPage() {
  // undefined until the first load: only then does the page say "Loading...".
  const [rows, setRows] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState("all");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  // null = no form; "new" = adding; a number = the id being edited.
  const [formFor, setFormFor] = useState(null);
  const [form, setForm] = useState(BLANK);

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    tourismApi
      .getEmergencyContacts()
      .then((data) => {
        if (!cancelled) setRows(inOrder(data));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || "The contacts could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  const loading = rows === undefined && !loadError;

  // The contact as the server now holds it goes in place of its row (or into
  // its place when new). Nothing is worked out here from what was sent.
  function putContact(contact) {
    setRows((current) => {
      const list = current || [];
      if (list.some((item) => item.id === contact.id)) {
        return list.map((item) => (item.id === contact.id ? contact : item));
      }
      return inOrder([...list, contact]);
    });
  }

  // One way to write: send, and on a refusal show the server's own message and
  // change nothing; on success take the server's answer. No second fetch.
  async function write(call, apply, successNotice) {
    setWorking(true);
    setActionError("");
    setNotice("");
    try {
      const answer = await call();
      apply(answer);
      setNotice(successNotice);
      return true;
    } catch (error) {
      setActionError(error.message || "The change could not be saved.");
      return false;
    } finally {
      setWorking(false);
    }
  }

  const visibleRows = useMemo(() => {
    const list = rows || [];
    if (filter === "active") return list.filter((row) => row.is_active);
    if (filter === "inactive") return list.filter((row) => !row.is_active);
    return list;
  }, [rows, filter]);

  const editing = typeof formFor === "number" ? (rows || []).find((row) => row.id === formFor) : null;
  const changedFields = editing ? FIELDS.filter((field) => form[field] !== editing[field]) : [];
  const canSave =
    form.name.trim() !== "" &&
    form.contact_numbers.trim() !== "" &&
    (formFor === "new" || changedFields.length > 0);

  function openAdd() {
    setFormFor(formFor === "new" ? null : "new");
    setForm(BLANK);
    setActionError("");
    setNotice("");
  }

  function openEdit(row) {
    setFormFor(row.id);
    setForm(FIELDS.reduce((acc, field) => ({ ...acc, [field]: row[field] ?? "" }), {}));
    setActionError("");
    setNotice("");
  }

  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submitForm(event) {
    event.preventDefault();
    let ok;
    if (formFor === "new") {
      ok = await write(() => tourismApi.createEmergencyContact(form), putContact, "The contact was added.");
    } else {
      const payload = {};
      changedFields.forEach((field) => {
        payload[field] = form[field];
      });
      ok = await write(
        () => tourismApi.updateEmergencyContact(formFor, payload),
        putContact,
        "The change was saved."
      );
    }
    if (ok) setFormFor(null);
  }

  // The whole list of ids in the new order; the server answers with the list.
  function move(index, step) {
    const ids = rows.map((row) => row.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    write(
      () => tourismApi.reorderEmergencyContacts(ids),
      (answer) => setRows(inOrder(answer)),
      "The order was changed."
    );
  }

  const canReorder = filter === "all";

  return (
    <div className="reports-page settings-page options-page hotlines-page">
      <div className="reports-header">
        <div>
          <h1>Emergency Hotlines</h1>
          <p>The hotlines and help desks the mobile app lists for visitors</p>
        </div>

        <div className="reports-actions">
          <button type="button" className="green" onClick={openAdd} disabled={working}>
            <FiPlus />
            Add contact
          </button>
        </div>
      </div>

      <div className="hotlines-notices" role="note" aria-label="About these changes">
        <p>{NEXT_VERSION_NOTICE}</p>
        <p>{EMPTY_LIST_NOTICE}</p>
      </div>

      <p className="options-intro">
        A contact that is deactivated is no longer sent to the app. Contacts are never deleted.
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

      {formFor !== null ? (
        <form
          className="settings-card options-form"
          onSubmit={submitForm}
          aria-label={formFor === "new" ? "Add contact" : `Edit ${editing ? editing.name : ""}`}
        >
          <div className="report-card-title">
            <h3>{formFor === "new" ? "New contact" : `Edit ${editing ? editing.name : ""}`}</h3>
          </div>
          <label className="settings-field">
            <span>Name</span>
            <input type="text" aria-label="Contact name" value={form.name} maxLength={160} onChange={setField("name")} />
          </label>
          <label className="settings-field">
            <span>Category</span>
            <select aria-label="Contact category" value={form.category} onChange={setField("category")}>
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span>Numbers</span>
            <input
              type="text"
              aria-label="Contact numbers"
              value={form.contact_numbers}
              maxLength={300}
              onChange={setField("contact_numbers")}
            />
            <small className="options-hint">More than one number can be written, e.g. 0998-000-0000 / (042) 000-0000.</small>
          </label>
          <label className="settings-field">
            <span>Email (optional)</span>
            <input type="text" aria-label="Contact email" value={form.email} maxLength={254} onChange={setField("email")} />
          </label>
          <label className="settings-field">
            <span>Hours (optional)</span>
            <input type="text" aria-label="Contact hours" value={form.hours} maxLength={80} onChange={setField("hours")} />
          </label>
          <label className="settings-field">
            <span>Description (optional)</span>
            <textarea
              aria-label="Contact description"
              rows={3}
              value={form.description}
              onChange={setField("description")}
            />
          </label>
          <div className="options-form-actions">
            <button type="button" className="tourist-record-cancel" onClick={() => setFormFor(null)} disabled={working}>
              Cancel
            </button>
            <button type="submit" className="tourist-record-save" disabled={working || !canSave}>
              {working ? "Saving..." : formFor === "new" ? "Save new contact" : "Save changes"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="settings-card options-card" aria-label="Emergency contacts">
        <div className="options-toolbar">
          <div className="report-card-title">
            <h3>Contacts, in the order the app shows them</h3>
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
        {!canReorder ? (
          <p className="options-hint">The order can only be changed while all contacts are shown.</p>
        ) : null}

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
                <th>Category</th>
                <th>Numbers</th>
                <th>Email</th>
                <th>Hours</th>
                <th>Description</th>
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
                      data-testid={`hotline-row-${row.id}`}
                    >
                      <td>{row.name}</td>
                      <td>{categoryLabel(row.category)}</td>
                      <td>{row.contact_numbers}</td>
                      <td>{row.email}</td>
                      <td>{row.hours}</td>
                      <td>{row.description}</td>
                      <td>
                        <span className={`options-status ${row.is_active ? "active" : "inactive"}`}>
                          {row.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <div className="options-actions">
                          {canReorder && index > 0 ? (
                            <button
                              type="button"
                              className="reply-btn"
                              aria-label={`Move ${row.name} up`}
                              disabled={working}
                              onClick={() => move(index, -1)}
                            >
                              <FiArrowUp />
                            </button>
                          ) : null}
                          {canReorder && index < rows.length - 1 ? (
                            <button
                              type="button"
                              className="reply-btn"
                              aria-label={`Move ${row.name} down`}
                              disabled={working}
                              onClick={() => move(index, 1)}
                            >
                              <FiArrowDown />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="reply-btn"
                            aria-label={`Edit ${row.name}`}
                            disabled={working}
                            onClick={() => openEdit(row)}
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
                                  () => tourismApi.deactivateEmergencyContact(row.id),
                                  putContact,
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
                                  () => tourismApi.reactivateEmergencyContact(row.id),
                                  putContact,
                                  `${row.name} was reactivated.`
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
                  <td colSpan={8} className="options-empty">
                    No contacts to show for this filter.
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

// The page itself refuses anyone but the admin (the route and the sidebar do
// too): a person who is sent here by a stale link is sent away.
export default function EmergencyHotlines() {
  const { role } = useAuth();
  if (!canManageHotlines(role)) {
    return <Navigate to="/" replace />;
  }
  return <EmergencyHotlinesPage />;
}
