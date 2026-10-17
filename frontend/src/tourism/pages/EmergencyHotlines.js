import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiArrowDown, FiArrowUp, FiMail, FiPlus } from "react-icons/fi";
import { useAuth } from "../../auth/AuthContext";
import { canManageHotlines } from "../hotlinesAccess";
import { tourismApi } from "../services/tourismApi";
import { CONTACT_ICONS, ContactIcon, contactIcon, contactStyle } from "../utils/contactIcons";

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

export const ICON_NOTE = "Only these twelve exist in the app — a new one needs a new release.";
export const SAVE_NOTE = "Saved changes reach the app with its next release.";
export const NUMBERS_HINT =
  "To give more than one number, separate them with a slash ( / ). The app shows the line exactly as it is written here.";
export const OPTIONAL_HINT = "Leave it empty and it will not appear in the app.";

const BLANK = { name: "", icon: "other", contact_numbers: "", email: "", description: "" };
const FIELDS = ["name", "icon", "contact_numbers", "email", "description"];

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
  // An icon name the page does not know is shown (and compared) as "other".
  const savedValue = (field) => (field === "icon" ? contactIcon(editing.icon).name : editing[field]);
  const changedFields = editing ? FIELDS.filter((field) => form[field] !== savedValue(field)) : [];
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
    setForm(
      FIELDS.reduce(
        (acc, field) => ({ ...acc, [field]: field === "icon" ? contactIcon(row.icon).name : row[field] ?? "" }),
        {}
      )
    );
    setActionError("");
    setNotice("");
  }

  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const chooseIcon = (name) => setForm((current) => ({ ...current, icon: name }));

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

          <p className="hotline-preview-label">How it will look in the app</p>
          <div className="hotline-preview hotline-body" role="group" aria-label="Preview" style={contactStyle(form.icon)}>
            <ContactIcon name={form.icon} />
            <div className="hotline-main">
              <div className={`hotline-name ${form.name.trim() ? "" : "is-empty"}`} data-testid="preview-name">
                {form.name.trim() || "Contact name"}
              </div>
              <div
                className={`hotline-number ${form.contact_numbers.trim() ? "" : "is-empty"}`}
                data-testid="preview-number"
              >
                {form.contact_numbers.trim() || "Numbers"}
              </div>
            </div>
          </div>

          <div className="settings-field" role="group" aria-label="Icon">
            <span>Icon</span>
            <div className="hotline-icon-grid">
              {CONTACT_ICONS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="hotline-icon-choice"
                  aria-label={item.label}
                  aria-pressed={form.icon === item.name}
                  style={contactStyle(item.name)}
                  onClick={() => chooseIcon(item.name)}
                >
                  <ContactIcon name={item.name} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            <small className="options-hint">{ICON_NOTE}</small>
          </div>

          <label className="settings-field">
            <span>Name</span>
            <input type="text" aria-label="Contact name" value={form.name} maxLength={160} onChange={setField("name")} />
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
            <small className="options-hint">{NUMBERS_HINT}</small>
          </label>
          <label className="settings-field">
            <span>Email — optional</span>
            <input type="text" aria-label="Contact email" value={form.email} maxLength={254} onChange={setField("email")} />
            <small className="options-hint">{OPTIONAL_HINT}</small>
          </label>
          <label className="settings-field">
            <span>Description — optional</span>
            <textarea
              aria-label="Contact description"
              rows={3}
              value={form.description}
              onChange={setField("description")}
            />
            <small className="options-hint">{OPTIONAL_HINT}</small>
          </label>
          <div className="options-form-actions">
            <button type="button" className="tourist-record-cancel" onClick={() => setFormFor(null)} disabled={working}>
              Cancel
            </button>
            <button type="submit" className="tourist-record-save" disabled={working || !canSave}>
              {working ? "Saving..." : formFor === "new" ? "Save new contact" : "Save changes"}
            </button>
            <p className="hotline-save-note">{SAVE_NOTE}</p>
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
          <>
            {visibleRows.length ? (
              <ul className="hotline-list">
                {visibleRows.map((row) => {
                  const index = rows.findIndex((item) => item.id === row.id);
                  return (
                    <li
                      key={row.id}
                      className={`hotline-row ${row.is_active ? "" : "is-inactive"}`}
                      style={contactStyle(row.icon)}
                      data-testid={`hotline-row-${row.id}`}
                    >
                      <div className="hotline-body">
                        <ContactIcon name={row.icon} />
                        <div className="hotline-main">
                          <div className="hotline-name">{row.name}</div>
                          <div className="hotline-number">{row.contact_numbers}</div>
                          {row.email || row.description ? (
                            <div className="hotline-chips">
                              {row.email ? (
                                <span className="hotline-chip" title={row.email}>
                                  <FiMail aria-hidden="true" /> {row.email}
                                </span>
                              ) : null}
                              {row.description ? (
                                <span className="hotline-chip" title={row.description}>
                                  {row.description}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <span className={`options-status ${row.is_active ? "active" : "inactive"}`}>
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                      <div className="hotline-actions">
                        <div className="hotline-move" role="group" aria-label={`Order of ${row.name}`}>
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
                        </div>
                        <div className="hotline-manage">
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
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="options-empty">No contacts to show for this filter.</p>
            )}
            <p className="hotline-footnote">
              A contact that is deactivated is no longer sent to the app. Contacts are never deleted.
            </p>
          </>
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
