import { useEffect, useId, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiHome, FiUserPlus, FiUsers } from "react-icons/fi";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";
import { canManageResortAccounts } from "../resortAccountsAccess";
import { tourismApi } from "../services/tourismApi";
import { countStaff, groupByResort, lastSeenText, openResorts, payloadOf, problemWith, resortsWithoutOpenStaff } from "../utils/resortAccounts";

// Administration > Resort Accounts: one account for each staff member of a resort (the scanner of the app). The list and the adding use /resort-staff/;
// the resorts come from the Destination Management list. Nothing is ever deleted here, and the page of one staff member is not built yet.

export const PAGE_LEAD =
  "Isang account bawat KAWANI, hindi bawat resort. Bawat isa ay may sariling pangalan, kaya makikita sa talaan kung sino ang tumanggap sa bisita, at kapag may umalis ay siya lang ang isasara.";
export const ADD_HEADING = "Magdagdag ng kawani";
export const ADD_NOTE = "Ibigay ang username at ang unang password nang personal sa kawani. Hindi ito ipinapadala kahit saan.";
export const LIST_HEADING = "Mga kawani";
export const LIST_NOTE = "Nakagrupo ayon sa resort";
export const LIST_FOOT =
  "Pindutin ang pangalan para sa detalye: ang pag-scan niya, ang pagpapalit ng password, at ang pagsasara. Walang Delete dito — ang sinarado ay hindi na makakapasok, pero nananatili ang tala ng mga pag-scan niya.";
export const NONE_HEADING = "Walang makakapag-scan";
export const NONE_NOTE = "Walang bukas na account ang mga resort na ito";
export const NONE_FOOT = "Piliin ang resort sa itaas para makapagdagdag.";
export const FORM_FOOT = "Ang scanner lang ang maibubukas nito.";
export const LOAD_ERROR = "Hindi ma-load ang mga kawani.";
export const EMPTY_LIST = "Wala pang kawani.";

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
      setNotice(`Nagawa na ang account ni ${created.name}.`);
    } catch (failure) {
      setActionError(failure.message || "Hindi nagawa ang account.");
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

      <div className="mobile-content-staff-main">
        <form className="mobile-content-staff-card is-add" onSubmit={submit} noValidate aria-label={ADD_HEADING}>
          <CardHead icon={<FiUserPlus size={19} />} title={ADD_HEADING} note={ADD_NOTE} />
          <div className="mobile-content-staff-body">
            <div className="mobile-content-staff-grid">
              <div className="mobile-content-staff-field">
                <label htmlFor={`${uid}-resort`}>Resort</label>
                <select id={`${uid}-resort`} value={form.resortId} onChange={type("resortId")}>
                  <option value="">Pumili ng resort</option>
                  {choices.map((resort) => (
                    <option key={resort.resort_id} value={resort.resort_id}>
                      {resort.resort_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mobile-content-staff-field">
                <label htmlFor={`${uid}-name`}>Pangalan ng kawani</label>
                <input id={`${uid}-name`} type="text" value={form.name} maxLength={150} onChange={type("name")} />
                <small>Ito ang lalabas sa talaan ng pag-scan.</small>
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
                <small>Maliliit na titik, numero, tuldok, at gitling lang.</small>
              </div>
              <div className="mobile-content-staff-field">
                <label htmlFor={`${uid}-password`}>Unang password</label>
                <input id={`${uid}-password`} type="password" autoComplete="new-password" value={form.password} onChange={type("password")} />
                <small>Walong karakter pataas.</small>
              </div>
              <div className="mobile-content-staff-field">
                <label htmlFor={`${uid}-again`}>Ulitin ang password</label>
                <input id={`${uid}-again`} type="password" autoComplete="new-password" value={form.again} onChange={type("again")} />
                <small>Dapat pareho ang dalawa. Hindi na maipapakita ulit ang password — kapag nakalimutan, bago ang gagawin.</small>
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
                Burahin ang nasulat
              </button>
              <button type="submit" className="mobile-content-staff-btn is-primary" disabled={working}>
                {working ? "Ginagawa..." : "Gumawa ng account"}
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
                  {counts.open} bukas · {counts.closed} sarado
                </span>
              }
            />
            <div className="mobile-content-staff-body">
              {groups.length === 0 ? <p className="options-empty">{EMPTY_LIST}</p> : null}
              {groups.map((group) => (
                <section key={group.id} className="mobile-content-staff-group" aria-label={group.name} data-testid="staff-group">
                  <div className="mobile-content-staff-group-head">
                    <strong>{group.name}</strong>
                    <span className="mobile-content-staff-tag">{group.people.length} kawani</span>
                    {group.id !== "none" ? (
                      <button type="button" className="mobile-content-staff-btn is-small" onClick={() => chooseResort(group.id)}>
                        Magdagdag
                      </button>
                    ) : null}
                  </div>
                  <ul className="mobile-content-staff-rows">
                    {group.people.map((person) => (
                      <li key={person.id} className="mobile-content-staff-row" data-testid="staff-row">
                        <div className="mobile-content-staff-row-text">
                          <strong>{person.name}</strong>
                          <span>{lastSeenText(person)}</span>
                        </div>
                        <span className="mobile-content-staff-tag" data-status={person.is_active ? "open" : "closed"}>
                          {person.is_active ? "Bukas" : "Sarado"}
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
              aside={<span className="mobile-content-staff-count">{withoutStaff.length} resort</span>}
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
    </div>
  );
}
