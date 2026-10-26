import { useEffect, useRef, useState } from "react";
import { blockConfirmRequired, tourismApi } from "../services/tourismApi";
import { countLetters, normalizeFor } from "../utils/mobileContentText";
import { NEXT_VERSION_NOTICE } from "./EmergencyHotlines";

// The editor of ONE block of Mobile App Content (the Welcome banner, and later the others). It shows the fields the server says the
// app shows for that block (so a field the app does not show is not on the page), counts and limits them the way the server does,
// and saves with one PATCH of only what changed.

export { NEXT_VERSION_NOTICE };
export const CHECK_NOTICE =
  "Before it saves, this page checks whether someone else has changed the text you changed since you opened it. " +
  "This check is not a guarantee: if two people save at the very same moment, the last save wins.";
export const SAVED_NOTICE = "The change was saved.";
export const LOAD_ERROR_FALLBACK = "The content could not be loaded.";
export const NO_BLOCK_NOTICE = "This text is not available.";

const LABELS = { title: "Title", subtitle: "Subtitle", body: "Text" };
// what the server calls each field in its own messages ("The title is required.")
const WORDS = { title: "The title", subtitle: "The subtitle", body: "The text" };

const pick = (block, fields) => Object.fromEntries(fields.map((field) => [field, block[field] ?? ""]));
const plural = (number, one, many) => `${number} ${number === 1 ? one : many}`;

export default function MobileContentBlockEditor({ blockKey, heading, intro, hints = {} }) {
  // undefined until the first load: only then the page says "Loading...".
  const [block, setBlock] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  // `baseline` is what the server held when this page last looked; `form` is what is typed.
  const [baseline, setBaseline] = useState({});
  const [form, setForm] = useState({});
  const [working, setWorking] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [ask, setAsk] = useState(null); // the server asks for a confirmation: { dropped, message }
  const [conflict, setConflict] = useState(null); // someone else changed what I changed: { latest, fields }
  const inFlight = useRef(false); // a second press in the same moment must not send a second request

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    tourismApi
      .getMobileContentBlocks()
      .then((data) => {
        if (cancelled) return;
        const found = (data.blocks || []).find((item) => item.key === blockKey);
        if (!found) {
          setLoadError(NO_BLOCK_NOTICE);
          return;
        }
        const values = pick(found, found.fields);
        setBlock(found);
        setBaseline(values);
        setForm(values);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || LOAD_ERROR_FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, [blockKey, retry]);

  const loading = block === undefined && !loadError;
  const fields = block ? block.fields : [];
  const limits = block ? block.limits : {};

  // What the server will find: the typed text, cleaned the way it cleans it.
  const cleaned = Object.fromEntries(fields.map((field) => [field, normalizeFor(limits[field].kind, form[field])]));
  const counts = Object.fromEntries(fields.map((field) => [field, countLetters(cleaned[field])]));
  const over = (field) => Math.max(0, counts[field] - limits[field].max);
  const empty = (field) => limits[field].required && cleaned[field] === "";
  const changed = fields.filter((field) => cleaned[field] !== baseline[field]);
  const canSave = !working && changed.length > 0 && fields.every((field) => !over(field) && !empty(field));

  function type(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setAsk(null);
    setConflict(null);
    setNotice("");
  }

  // The values of the block as the server holds them become both what is known and what is typed.
  function adopt(values) {
    setBaseline(values);
    setForm(values);
  }

  async function send({ force = false, confirm } = {}) {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setFieldErrors({});
    setActionError("");
    setNotice("");
    setWarnings([]);
    setAsk(null);
    setConflict(null);
    try {
      const changes = Object.fromEntries(changed.map((field) => [field, cleaned[field]]));
      if (!force) {
        // Has someone else changed what I changed, since I opened it? Look again, now.
        let latest;
        try {
          latest = (await tourismApi.getMobileContentBlocks()).blocks.find((item) => item.key === blockKey);
        } catch (error) {
          setActionError(
            "Your change was not saved, because this page could not check whether someone else changed the text. " +
              (error.message || "")
          );
          return;
        }
        if (!latest) {
          setActionError(NO_BLOCK_NOTICE);
          return;
        }
        const clashes = changed.filter((field) => latest[field] !== baseline[field]);
        if (clashes.length) {
          setConflict({ latest: pick(latest, fields), fields: clashes });
          return;
        }
      }
      const answer = await tourismApi.updateMobileContentBlock(blockKey, changes, confirm);
      adopt(pick(answer, fields)); // what the server answered, not what was typed
      setNotice(SAVED_NOTICE);
      setWarnings(Array.isArray(answer.warnings) ? answer.warnings : []);
    } catch (error) {
      const asked = blockConfirmRequired(error);
      if (asked) {
        setAsk(asked);
        return;
      }
      const details = error.details && typeof error.details === "object" ? error.details : {};
      const byField = {};
      fields.forEach((field) => {
        if (Array.isArray(details[field]) && details[field].length) byField[field] = String(details[field][0]);
      });
      if (Object.keys(byField).length) setFieldErrors(byField);
      else setActionError(error.message || "The change could not be saved.");
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }

  // "Keep editing": what I typed stays; the rest of the form is brought up to what the server holds now.
  function keepEditing() {
    const latest = conflict.latest;
    setForm((current) =>
      Object.fromEntries(
        fields.map((field) => [field, normalizeFor(limits[field].kind, current[field]) === baseline[field] ? latest[field] : current[field]])
      )
    );
    setBaseline(latest);
    setConflict(null);
  }

  function submit(event) {
    event.preventDefault();
    if (canSave) send();
  }

  return (
    <div className="mobile-content-panel">
      <div className="hotlines-notices" role="note" aria-label="About these changes">
        <p>{NEXT_VERSION_NOTICE}</p>
        <p>{CHECK_NOTICE}</p>
      </div>

      <div className="options-message-area">
        {notice ? (
          <p className="settings-status success" role="status">
            {notice}
          </p>
        ) : null}
        {warnings.map((warning) => (
          <p key={warning} className="settings-status" role="status">
            {warning}
          </p>
        ))}
        {actionError ? (
          <p className="settings-status error" role="alert">
            {actionError}
          </p>
        ) : null}
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

      {block ? (
        <form className="settings-card options-form" onSubmit={submit} aria-label={heading}>
          <div className="report-card-title">
            <h3>{heading}</h3>
            {intro ? <p>{intro}</p> : null}
          </div>

          {fields.map((field) => {
            const limit = limits[field];
            const tooMany = over(field);
            const Control = limit.kind === "text" ? "textarea" : "input";
            return (
              <label key={field} className="settings-field settings-field-wide">
                <span>{LABELS[field] || field}</span>
                <Control
                  {...(Control === "input" ? { type: "text" } : { rows: 6 })}
                  aria-label={LABELS[field] || field}
                  value={form[field] ?? ""}
                  disabled={working}
                  onChange={(event) => type(field, event.target.value)}
                />
                {hints[field] ? <small className="options-hint">{hints[field]}</small> : null}
                <small className="options-hint" data-testid={`count-${field}`}>
                  {counts[field]} / {limit.max}
                </small>
                {tooMany ? (
                  <small className="options-reason" role="alert">
                    Too long by {plural(tooMany, "letter", "letters")}.
                  </small>
                ) : empty(field) ? (
                  <small className="options-reason" role="alert">
                    {WORDS[field] || "This"} is required.
                  </small>
                ) : null}
                {fieldErrors[field] ? (
                  <small className="options-reason" role="alert" data-testid={`error-${field}`}>
                    {fieldErrors[field]}
                  </small>
                ) : null}
              </label>
            );
          })}

          {ask ? (
            <div className="options-confirm" role="alertdialog" aria-label="Confirm the change">
              <p>{ask.message}</p>
              <div className="options-form-actions">
                <button type="button" className="tourist-record-cancel" onClick={() => setAsk(null)} disabled={working}>
                  Cancel
                </button>
                <button type="button" className="tourist-record-save" onClick={() => send({ confirm: ask.dropped })} disabled={working}>
                  {working ? "Saving..." : "Confirm"}
                </button>
              </div>
            </div>
          ) : conflict ? (
            <div className="options-confirm" role="alertdialog" aria-label="Someone else changed this text">
              {conflict.fields.map((field) => (
                <p key={field}>
                  Someone else changed the {(LABELS[field] || field).toLowerCase()} since you opened it. It now says:{" "}
                  {"“"}{conflict.latest[field]}{"”"} Yours says: {"“"}{cleaned[field]}{"”"}
                </p>
              ))}
              <p>This check is not a guarantee: it cannot see a change made at the very moment you save.</p>
              <div className="options-form-actions">
                <button type="button" className="tourist-record-cancel" onClick={keepEditing} disabled={working}>
                  Keep editing
                </button>
                <button type="button" className="tourist-record-save" onClick={() => send({ force: true })} disabled={working}>
                  {working ? "Saving..." : "Save my text anyway"}
                </button>
              </div>
            </div>
          ) : (
            <div className="options-form-actions">
              <button type="submit" className="tourist-record-save" disabled={!canSave}>
                {working ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </form>
      ) : null}
    </div>
  );
}
