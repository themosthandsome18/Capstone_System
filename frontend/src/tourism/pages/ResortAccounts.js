import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiHome, FiUserPlus, FiUsers } from "react-icons/fi";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";
import { canManageResortAccounts } from "../resortAccountsAccess";
import { tourismApi } from "../services/tourismApi";
import PasswordBox from "./PasswordBox";
import ResortStaffDetail from "./ResortStaffDetail";
import ResortStaffLimit from "./ResortStaffLimit";
import { countStaff, groupByResort, lastSeenText, openResorts, payloadOf, problemWith, resortsWithoutOpenStaff } from "../utils/resortAccounts";

// Administration > Resort Accounts: one account for each staff member of a resort (the scanner of the app). The list and the adding use /resort-staff/;
// the resorts come from the Destination Management list. Nothing is ever deleted here, and the page of one staff member is not built yet.

export const PAGE_LEAD =
  "One account per staff member, not per resort. Each has a name of their own, so the record shows who took the visitor in, and when someone leaves only that one account is closed.";
export const ADD_HEADING = "Add a staff member";
export const ADD_NOTE = "Give the username and the first password to them in person. It is not sent anywhere.";
export const LIST_HEADING = "Staff";
export const LIST_NOTE = "Grouped by resort";
export const LIST_FOOT =
  "Tap a name for the details: their scans, a new password, and closing the account. There is no Delete here — a closed account cannot sign in, but every scan it made stays on record.";
export const NONE_HEADING = "No one can scan";
export const NONE_NOTE = "These resorts have no open account";
export const NONE_FOOT = "Choose the resort above to add someone.";
export const FORM_FOOT = "This account opens the scanner and nothing else.";
export const LOAD_ERROR = "The staff could not be loaded.";
export const EMPTY_LIST = "No staff yet.";

const BLANK = { resortId: "", name: "", username: "", password: "", again: "" };

function CardHead({ icon, title, note, aside }) {
  return (
    <header className="mobile-content-staff-head">
      <span className="mobile-content-staff-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="mobile-content-staff-head-text">
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      {aside || null}
    </header>
  );
}

export default function ResortAccounts() {
  const { role } = useAuth();
  const { referenceTables } = useTourismData();
  const uid = useId();
  const [staff, setStaff] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [problem, setProblem] = useState("");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const allowed = canManageResortAccounts(role);

  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    setLoadError("");
    tourismApi
      .getResortStaff()
      .then((answer) => {
        if (!cancelled) setStaff(Array.isArray(answer) ? answer : []);
      })
      .catch((failure) => {
        if (!cancelled) setLoadError(failure.message || LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, retry]);

  const resorts = referenceTables && referenceTables.resorts;
  const choices = useMemo(() => openResorts(resorts), [resorts]);
  const groups = useMemo(() => groupByResort(staff), [staff]);
  const counts = useMemo(() => countStaff(staff), [staff]);
  const withoutStaff = useMemo(() => resortsWithoutOpenStaff(resorts, staff), [resorts, staff]);

  const closeDetail = useCallback(() => setOpenId(null), []);

  if (!allowed) return <Navigate to="/" replace />;

  // Every answer on the form (the server's, the form's own, the "done") is out of date the moment the person changes a box or sends again.
  const forgetAnswers = () => {
    setProblem("");
    setActionError("");
    setNotice("");
  };

  const type = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    forgetAnswers();
  };

  async function submit(event) {
    event.preventDefault();
    forgetAnswers(); // first of all: before the form is checked, so an old answer cannot stay beside the new one
    const found = problemWith(form);
    if (found) {
      setProblem(found);
      return;
    }
    setWorking(true);
    try {
      const created = await tourismApi.createResortStaff(payloadOf(form));
      setStaff((current) => [...(current || []), created]);
      setForm(BLANK);
      setNotice(`Account created for ${created.name}.`);
    } catch (failure) {
      setActionError(failure.message || "The account could not be created.");
    } finally {
      setWorking(false);
    }
  }

  const chooseResort = (id) => {
    setForm((current) => ({ ...current, resortId: String(id) }));
    forgetAnswers();
  };
  const clearForm = () => {
    setForm(BLANK);
    forgetAnswers();
  };
  // The details changed an account: the row is replaced at once, and the whole list is asked again so the tag and the counts match the server.
  const changed = (row) => {
    setStaff((current) => (current || []).map((person) => (person.id === row.id ? row : person)));
    setRetry((count) => count + 1);
  };
  const openPerson = (staff || []).find((person) => person.id === openId) || null;
  const drafting = Object.values(form).some((value) => value !== "");

  return (
    <div className="reports-page settings-page options-page mobile-content-page">
      <div className="reports-header">
        <div>
          <p className="mobile-content-eyebrow">Administration</p>
          <h1>Resort Accounts</h1>
          <p className="mobile-content-lead">{PAGE_LEAD}</p>
        </div>
      </div>

      <div className="mobile-content-staff-layout">
      <div className="mobile-content-staff-main">
        <form className="mobile-content-staff-card is-add" onSubmit={submit} noValidate aria-label={ADD_HEADING}>
          <CardHead icon={<FiUserPlus size={19} />} title={ADD_HEADING} note={ADD_NOTE} />
          <div className="mobile-content-staff-body">
            <div className="mobile-content-staff-grid">
              <div className="mobile-content-staff-field">
                <label htmlFor={`${uid}-resort`}>Resort</label>
                <select id={`${uid}-resort`} value={form.resortId} onChange={type("resortId")}>
                  <option value="">Choose a resort…</option>
                  {choices.map((resort) => (
                    <option key={resort.resort_id} value={resort.resort_id}>
                      {resort.resort_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mobile-content-staff-field">
                <label htmlFor={`${uid}-name`}>Staff name</label>
                <input id={`${uid}-name`} type="text" value={form.name} maxLength={150} onChange={type("name")} />
                <small>This is the name the check-in record will show.</small>
              </div>
              <div className="mobile-content-staff-field">
                <label htmlFor={`${uid}-username`}>Username</label>
                <input
                  id={`${uid}-username`}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  value={form.username}
                  maxLength={150}
                  onChange={type("username")}
                />
                <small>Lowercase letters, numbers, dots and hyphens only.</small>
              </div>
              <div className="mobile-content-staff-field">
                <label htmlFor={`${uid}-password`}>First password</label>
                <PasswordBox id={`${uid}-password`} value={form.password} onChange={type("password")} />
                <small>Eight characters or more.</small>
              </div>
              <div className="mobile-content-staff-field mobile-content-staff-spacer" aria-hidden="true" data-testid="form-spacer" />
              <div className="mobile-content-staff-field">
                <label htmlFor={`${uid}-again`}>Repeat password</label>
                <PasswordBox id={`${uid}-again`} value={form.again} onChange={type("again")} />
                <small>The two must match. The password cannot be shown again — if it is forgotten, a new one is made.</small>
              </div>
            </div>
          </div>
          <div className="mobile-content-staff-message" data-testid="form-message">
            {problem ? (
              <p className="settings-status error" role="alert" data-testid="form-problem">
                {problem}
              </p>
            ) : null}
            {actionError ? (
              <p className="settings-status error" role="alert" data-testid="form-error">
                {actionError}
              </p>
            ) : null}
            {notice ? (
              <p className="settings-status success" role="status">
                {notice}
              </p>
            ) : null}
          </div>
          <footer className="mobile-content-staff-foot">
            <span>{FORM_FOOT}</span>
            <div className="mobile-content-staff-actions">
              <button type="button" className="mobile-content-staff-btn" disabled={working || !drafting} onClick={clearForm}>
                Clear
              </button>
              <button type="submit" className="mobile-content-staff-btn is-primary" disabled={working}>
                {working ? "Creating..." : "Create account"}
              </button>
            </div>
          </footer>
        </form>

        {loadError ? (
          <p className="settings-status error" role="alert">
            {loadError}{" "}
            <button type="button" className="reply-btn" onClick={() => setRetry((count) => count + 1)}>
              Try again
            </button>
          </p>
        ) : null}
        {staff === undefined && !loadError ? <p className="options-empty">Loading...</p> : null}

        {staff !== undefined ? (
          <section className="mobile-content-staff-card" aria-label={LIST_HEADING}>
            <CardHead
              icon={<FiUsers size={19} />}
              title={LIST_HEADING}
              note={LIST_NOTE}
              aside={
                <span className="mobile-content-staff-count" data-testid="staff-count">
                  {counts.open} open · {counts.closed} closed
                </span>
              }
            />
            <div className="mobile-content-staff-body">
              {groups.length === 0 ? <p className="options-empty">{EMPTY_LIST}</p> : null}
              {groups.map((group) => (
                <section key={group.id} className="mobile-content-staff-group" aria-label={group.name} data-testid="staff-group">
                  <div className="mobile-content-staff-group-head">
                    <strong>{group.name}</strong>
                    <span className="mobile-content-staff-tag">{group.people.length} staff</span>
                    {group.id !== "none" ? (
                      <button type="button" className="mobile-content-staff-btn is-small" onClick={() => chooseResort(group.id)}>
                        Add
                      </button>
                    ) : null}
                  </div>
                  <ul className="mobile-content-staff-rows">
                    {group.people.map((person) => (
                      <li
                        key={person.id}
                        className="mobile-content-staff-row"
                        data-testid="staff-row"
                        tabIndex={0}
                        onClick={() => setOpenId(person.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") setOpenId(person.id);
                        }}
                      >
                        <div className="mobile-content-staff-row-text">
                          <strong>{person.name}</strong>
                          <span>{lastSeenText(person)}</span>
                        </div>
                        <span className="mobile-content-staff-tag" data-status={person.is_active ? "open" : "closed"}>
                          {person.is_active ? "Open" : "Closed"}
                        </span>
                        <span className="mobile-content-staff-chevron" aria-hidden="true">
                          ›
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <footer className="mobile-content-staff-foot">
              <span>{LIST_FOOT}</span>
            </footer>
          </section>
        ) : null}

        {staff !== undefined && withoutStaff.length > 0 ? (
          <section className="mobile-content-staff-card" aria-label={NONE_HEADING}>
            <CardHead
              icon={<FiHome size={19} />}
              title={NONE_HEADING}
              note={NONE_NOTE}
              aside={<span className="mobile-content-staff-count">{withoutStaff.length} {withoutStaff.length === 1 ? "resort" : "resorts"}</span>}
            />
            <div className="mobile-content-staff-body">
              <ul className="mobile-content-staff-chips">
                {withoutStaff.map((resort) => (
                  <li key={resort.resort_id} className="mobile-content-staff-chip" data-testid="no-staff-chip">
                    {resort.resort_name}
                  </li>
                ))}
              </ul>
            </div>
            <footer className="mobile-content-staff-foot">
              <span>{NONE_FOOT}</span>
            </footer>
          </section>
        ) : null}
      </div>
      <ResortStaffLimit />
      </div>
      {openPerson ? <ResortStaffDetail person={openPerson} onClose={closeDetail} onChanged={changed} /> : null}
    </div>
  );
}
