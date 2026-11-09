import { useEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import { tourismApi } from "../services/tourismApi";
import { MESSAGES, PASSWORD_MIN } from "../utils/resortAccounts";
import PasswordBox from "./PasswordBox";

// The details of ONE staff member, in a modal: what they have received, the account, a new password, and closing (or reopening) the account.
// It changes only through PATCH /resort-staff/<id>/ and tells the page behind (onChanged) so the list matches. Nothing is ever deleted.

export const NOT_YET = "Not yet";
export const PASSWORD_NOTE = "The password cannot be shown. Give the new one to them in person.";
export const PASSWORD_HINT = "The two must match. Eight characters or more.";
export const PASSWORD_AFTER = "They will be signed out of the app and will need to sign in again with the new one.";
export const CLOSE_TEXT = "They will not be able to sign in, but every scan they made stays on record. It can be reopened at any time.";
export const REOPEN_TEXT = "They can sign in again once this is reopened.";
export const NO_DELETE = "There is no Delete here, as with the hotlines and the advisories.";

export function firstNameOf(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

export function initialOf(name) {
  const first = String(name || "").trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

export function dateText(value) {
  if (!value) return NOT_YET;
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return NOT_YET;
  return when.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}

function scansText(count) {
  const n = Number(count) || 0;
  return `in ${n} ${n === 1 ? "scan" : "scans"}`;
}

function Fact({ label, value }) {
  return (
    <div className="mobile-content-staff-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function ResortStaffDetail({ person, onClose, onChanged }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const closeRef = useRef(null);
  const first = firstNameOf(person.name);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Every answer on the modal is out of date the moment something is typed or something is sent again.
  const forget = () => {
    setProblem("");
    setError("");
    setNotice("");
  };

  async function send(payload, done) {
    setWorking(true);
    try {
      const saved = await tourismApi.updateResortStaff(person.id, payload);
      setNotice(done);
      onChanged(saved);
      return true;
    } catch (failure) {
      setError(failure.message || "The change could not be saved.");
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    forget();
    if (password.length < PASSWORD_MIN) {
      setProblem(MESSAGES.password);
      return;
    }
    if (password !== again) {
      setProblem(MESSAGES.mismatch);
      return;
    }
    if (await send({ password }, `Password changed for ${first}.`)) {
      setPassword("");
      setAgain("");
    }
  }

  async function switchAccount() {
    forget();
    const reopen = !person.is_active;
    await send({ is_active: reopen }, reopen ? `${first}'s account is open again.` : `${first}'s account is closed.`);
  }

  const open = person.is_active;

  return (
    <div className="mobile-content-staff-backdrop" onClick={onClose}>
      <div className="mobile-content-staff-modal" role="dialog" aria-modal="true" aria-labelledby="staff-detail-title" onClick={(event) => event.stopPropagation()}>
        <header className="mobile-content-staff-modal-head">
          <span className="mobile-content-staff-initial" aria-hidden="true" data-testid="staff-initial">
            {initialOf(person.name)}
          </span>
          <div className="mobile-content-staff-modal-who">
            <h2 id="staff-detail-title">{person.name}</h2>
            <p>{person.resort ? person.resort.name : "No resort"}</p>
            <div className="mobile-content-staff-chips-row">
              <span className="mobile-content-staff-tag" data-status={open ? "open" : "closed"}>
                {open ? "Open" : "Closed"}
              </span>
              <span className="mobile-content-staff-tag">Resort staff</span>
              <span className="mobile-content-staff-tag">{person.username}</span>
            </div>
          </div>
          <button type="button" className="mobile-content-staff-x" aria-label="Close" ref={closeRef} onClick={onClose}>
            <FiX size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="mobile-content-staff-modal-body">
          <div className="mobile-content-staff-numbers">
            <div className="mobile-content-staff-number" data-testid="number-all">
              <span>Visitors taken in</span>
              <strong>{person.visitor_count ?? 0}</strong>
              <small>{scansText(person.scan_count)}</small>
            </div>
            <div className="mobile-content-staff-number" data-testid="number-month">
              <span>This month</span>
              <strong>{person.visitor_count_month ?? 0}</strong>
              <small>{scansText(person.scan_count_month)}</small>
            </div>
          </div>

          <section className="mobile-content-staff-section" aria-label="The account">
            <h3>The account</h3>
            <dl className="mobile-content-staff-facts">
              <Fact label="Username" value={person.username} />
              <Fact label="Resort" value={person.resort ? person.resort.name : NOT_YET} />
              <Fact label="Created on" value={dateText(person.date_joined)} />
              <Fact label="Created by" value={person.created_by || NOT_YET} />
              <Fact label="Last signed in" value={dateText(person.last_login)} />
              <Fact label="Last scan" value={dateText(person.last_scan_at)} />
            </dl>
          </section>

          <form className="mobile-content-staff-section" aria-label="New password" onSubmit={changePassword} noValidate>
            <h3>New password</h3>
            <p className="mobile-content-staff-section-note">{PASSWORD_NOTE}</p>
            <div className="mobile-content-staff-stack">
              <div className="mobile-content-staff-field">
                <label htmlFor="staff-detail-password">New password</label>
                <PasswordBox
                  id="staff-detail-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    forget();
                  }}
                />
              </div>
              <div className="mobile-content-staff-field">
                <label htmlFor="staff-detail-again">Repeat password</label>
                <PasswordBox
                  id="staff-detail-again"
                  value={again}
                  onChange={(event) => {
                    setAgain(event.target.value);
                    forget();
                  }}
                />
                <small>{PASSWORD_HINT}</small>
              </div>
            </div>
            <button type="submit" className="mobile-content-staff-btn is-primary" disabled={working}>
              Change password
            </button>
            <p className="mobile-content-staff-section-note">{PASSWORD_AFTER}</p>
          </form>

          <section className="mobile-content-staff-section" aria-label="Close the account">
            <h3>Close the account</h3>
            <p className="mobile-content-staff-section-note">{open ? CLOSE_TEXT : REOPEN_TEXT}</p>
            <button type="button" className="mobile-content-staff-btn is-danger" disabled={working} onClick={switchAccount}>
              {open ? `Close ${first}'s account` : `Reopen ${first}'s account`}
            </button>
            <p className="mobile-content-staff-section-note">{NO_DELETE}</p>
          </section>

          <div className="mobile-content-staff-message" data-testid="detail-message">
            {problem ? (
              <p className="settings-status error" role="alert" data-testid="detail-problem">
                {problem}
              </p>
            ) : null}
            {error ? (
              <p className="settings-status error" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="settings-status success" role="status">
                {notice}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
