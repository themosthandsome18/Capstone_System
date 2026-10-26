import { Fragment, useEffect, useRef, useState } from "react";
import { blockConfirmRequired, tourismApi } from "../services/tourismApi";
import { countLetters, normalizeFor } from "../utils/mobileContentText";
import { insertAt, placeholderWarnings, previewContext, previewParts } from "../utils/mobileContentPreview";
import { NEXT_VERSION_NOTICE } from "./EmergencyHotlines";

// The editor of ONE block of Mobile App Content (the Welcome banner, and later the others). It shows the fields the server says the
// app shows for that block (so a field the app does not show is not on the page), counts and limits them the way the server does,
// and saves with one PATCH of only what changed. Beside the form: what the app will show (the typed text, with the placeholders filled
// in as the server fills them) and what the app shows now (its built-in text), with a button that puts that text into the form.

export { NEXT_VERSION_NOTICE };
export const CHECK_NOTICE =
  "Before it saves, this page checks whether someone else has changed the text you changed since you opened it. " +
  "This check is not a guarantee: if two people save at the very same moment, the last save wins.";
export const SAVED_NOTICE = "The change was saved.";
export const LOAD_ERROR_FALLBACK = "The content could not be loaded.";
export const NO_BLOCK_NOTICE = "This text is not available.";

// the words of the preview (the exact texts the owner agreed)
export const PREVIEW_EMPTY = "Nothing to show yet: this field is required.";
export const PREVIEW_INSTEAD = "What the app will show instead (its built-in text)";
export const OFFICE_NOTE =
  "The place where the fee is paid is not filled in yet (Port & Boat Guide tab), so the app cannot show this text. " +
  "Until it is, the app keeps using its built-in text. You can still save this text.";
export const FEE_NOTE =
  "The current entrance fee could not be loaded, so [fee not available] stands where the amount will be. " +
  "The app will show the real amount. You can still save.";
export const NAME_NOTE =
  "Explorer is only what a visitor who is not logged in is called. A visitor who is logged in sees their own name here.";
export const FILLED_NOTE = "The amounts and the place where the fee is paid are filled in from the system. They are not typed here.";
export const BUILT_IN_ONLY = "Showing the app's built-in text only.";
export const BUILT_IN_BUTTON = "Use the app's built-in text";
export const BUILT_IN_BUTTON_NOTE = "This only fills the form. Press Save to keep it.";

const LABELS = { title: "Title", subtitle: "Subtitle", body: "Text" };
// what the server calls each field in its own messages ("The title is required.")
const WORDS = { title: "The title", subtitle: "The subtitle", body: "The text" };

const pick = (block, fields) => Object.fromEntries(fields.map((field) => [field, block[field] ?? ""]));
const plural = (number, one, many) => `${number} ${number === 1 ? one : many}`;

// The parts of a text, drawn: what was filled in is underlined, what could not be filled in or is not a placeholder is marked.
function Parts({ parts }) {
  return parts.map((part, index) => {
    if (part.kind === "text") return <Fragment key={index}>{part.text}</Fragment>;
    if (part.kind === "missing" || part.kind === "unknown") {
      return (
        <span key={index} className="mobile-content-missing" title={part.token} data-kind={part.kind}>
          {part.text}
        </span>
      );
    }
    return (
      <span key={index} className="mobile-content-filled" title={part.token} data-kind={part.kind}>
        {part.text}
      </span>
    );
  });
}

export default function MobileContentBlockEditor({ blockKey, heading, intro, hints = {}, builtIn }) {
  // undefined until the first load: only then the page says "Loading...".
  const [block, setBlock] = useState(undefined);
  const [context, setContext] = useState(previewContext(null));
  const [notes, setNotes] = useState({});
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
  const controls = useRef({});
  const caret = useRef(null);

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
        setContext(previewContext(data));
        setNotes(data.placeholders && typeof data.placeholders === "object" ? data.placeholders : {});
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

  // after a placeholder was put in, the caret goes after it
  useEffect(() => {
    if (!caret.current) return;
    const { field, position } = caret.current;
    caret.current = null;
    const control = controls.current[field];
    if (control && control.setSelectionRange) {
      control.focus();
      control.setSelectionRange(position, position);
    }
  });

  const loading = block === undefined && !loadError;
  const fields = block ? block.fields : [];
  const limits = block ? block.limits : {};
  const allowed = block ? block.allowed_placeholders || {} : {};

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

  function insert(field, name) {
    const control = controls.current[field];
    const put = insertAt(form[field] ?? "", `{${name}}`, control && control.selectionStart, control && control.selectionEnd);
    caret.current = { field, position: put.caret };
    type(field, put.value);
  }

  // The app's own text goes into the form. Nothing is sent: it has to be saved like any other change.
  function useBuiltIn() {
    setForm((current) => Object.fromEntries(fields.map((field) => [field, builtIn[field] ?? current[field]])));
    setFieldErrors({});
    setActionError("");
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
          const looked = await tourismApi.getMobileContentBlocks();
          latest = looked.blocks.find((item) => item.key === blockKey);
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

  // ---- the preview: what the typed text becomes ----
  const previews = fields.map((field) => {
    if (empty(field)) return { field, empty: true };
    const shown = previewParts(cleaned[field], context, allowed[field] || []);
    if (shown.officeMissing) {
      const instead = builtIn && builtIn[field] != null ? previewParts(builtIn[field], context) : null;
      return { field, instead, officeMissing: true, usesName: Boolean(instead && instead.usesName) };
    }
    return { field, shown, feeMissing: shown.feeMissing, usesName: shown.usesName };
  });
  const anyOfficeMissing = previews.some((item) => item.officeMissing);
  const anyFeeMissing = previews.some((item) => item.feeMissing);
  const anyName = previews.some((item) => item.usesName);
  const anyFilled = previews.some((item) => item.shown && item.shown.parts.some((part) => part.kind === "filled"));

  // ---- the built-in text, shown as a guest would read it ----
  const builtInFields = builtIn ? (block ? fields : Object.keys(builtIn)) : [];
  const builtInShown = builtInFields.map((field) => ({ field, shown: previewParts(builtIn[field], context) }));

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

      <div className="mobile-content-editor">
        <div className="mobile-content-main">
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
                const names = Array.isArray(allowed[field]) ? allowed[field] : [];
                const problems = placeholderWarnings(form[field], names);
                return (
                  <label key={field} className="settings-field settings-field-wide">
                    <span>{LABELS[field] || field}</span>
                    <Control
                      {...(Control === "input" ? { type: "text" } : { rows: 6 })}
                      aria-label={LABELS[field] || field}
                      ref={(element) => {
                        controls.current[field] = element;
                      }}
                      value={form[field] ?? ""}
                      disabled={working}
                      onChange={(event) => type(field, event.target.value)}
                    />
                    {names.length ? (
                      <span className="mobile-content-insert" role="group" aria-label={`Placeholders for the ${(LABELS[field] || field).toLowerCase()}`}>
                        <small className="options-hint">Put in:</small>
                        {names.map((name) => (
                          <button
                            key={name}
                            type="button"
                            className="reply-btn"
                            title={notes[name] || undefined}
                            aria-label={`Put in {${name}} in the ${(LABELS[field] || field).toLowerCase()}`}
                            disabled={working}
                            onClick={() => insert(field, name)}
                          >
                            {`{${name}}`}
                          </button>
                        ))}
                      </span>
                    ) : null}
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
                    {problems.map((problem) => (
                      <small key={problem} className="options-reason" role="note" data-testid={`warning-${field}`}>
                        {problem}
                      </small>
                    ))}
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
                      {"“"}
                      {conflict.latest[field]}
                      {"”"} Yours says: {"“"}
                      {cleaned[field]}
                      {"”"}
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

        <div className="mobile-content-side">
          {block ? (
            <section className="settings-card options-card" aria-label="What the app will show">
              <div className="report-card-title">
                <h3>What the app will show</h3>
              </div>
              {previews.map((item) => (
                <div key={item.field} className="mobile-content-preview-field" data-testid={`preview-${item.field}`}>
                  <small className="options-hint">{LABELS[item.field] || item.field}</small>
                  {item.empty ? (
                    <p className="mobile-content-muted">{PREVIEW_EMPTY}</p>
                  ) : item.officeMissing ? (
                    <>
                      <small className="options-hint">{PREVIEW_INSTEAD}</small>
                      <p className="mobile-content-muted">{item.instead ? <Parts parts={item.instead.parts} /> : null}</p>
                    </>
                  ) : (
                    <p>
                      <Parts parts={item.shown.parts} />
                    </p>
                  )}
                </div>
              ))}
              {anyOfficeMissing ? (
                <p className="options-reason" role="note">
                  {OFFICE_NOTE}
                </p>
              ) : null}
              {anyFeeMissing ? (
                <p className="options-reason" role="note">
                  {FEE_NOTE}
                </p>
              ) : null}
              {anyName ? (
                <p className="options-hint" role="note">
                  {NAME_NOTE}
                </p>
              ) : null}
              {anyFilled ? (
                <p className="options-hint" role="note">
                  {FILLED_NOTE}
                </p>
              ) : null}
            </section>
          ) : null}

          {builtIn ? (
            <section className="settings-card options-card" aria-label="What the app shows now (built-in text)">
              <div className="report-card-title">
                <h3>What the app shows now (built-in text)</h3>
              </div>
              <p className="options-hint">
                The text the app has written in its own code. It is what a visitor reads until the app is changed to read the text from here.
              </p>
              {loadError ? <p className="options-hint">{BUILT_IN_ONLY}</p> : null}
              {builtInShown.map((item) => (
                <div key={item.field} className="mobile-content-builtin-field" data-testid={`builtin-${item.field}`}>
                  <small className="options-hint">{LABELS[item.field] || item.field}</small>
                  <p>
                    <Parts parts={item.shown.parts} />
                  </p>
                </div>
              ))}
              {builtInShown.some((item) => item.shown.usesName) ? (
                <p className="options-hint" role="note">
                  {NAME_NOTE}
                </p>
              ) : null}
              {block ? (
                <div className="mobile-content-builtin-use">
                  <button type="button" className="reply-btn" onClick={useBuiltIn} disabled={working}>
                    {BUILT_IN_BUTTON}
                  </button>
                  <small className="options-hint">{BUILT_IN_BUTTON_NOTE}</small>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
