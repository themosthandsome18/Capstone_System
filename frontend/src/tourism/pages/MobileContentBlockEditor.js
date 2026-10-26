import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { blockConfirmRequired, tourismApi } from "../services/tourismApi";
import { countLetters, normalizeFor } from "../utils/mobileContentText";
import { insertAt, placeholderWarnings, previewContext, previewParts } from "../utils/mobileContentPreview";
import { NEXT_VERSION_NOTICE } from "./EmergencyHotlines";
import { DetailMock, MOCK_SUBTITLE, MOCK_TITLE, TileFoot, TileGrid } from "./MobileContentWhyVisitMocks";

// The editor of ONE block of Mobile App Content (the Welcome banner, and later the others). It shows the fields the server says the
// app shows for that block (so a field the app does not show is not on the page), counts and limits them the way the server does,
// and saves with one PATCH of only what changed. Beside the form: what the app will show (the typed text, with the placeholders filled
// in as the server fills them). Inside the form, a button puts the app's own (built-in) text into the form: it fills the form and sends nothing.

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
export const BUILT_IN_BUTTON = "Ibalik ang orihinal na teksto";
export const BUILT_IN_BUTTON_NOTE = "This only fills the form. Press Save to keep it.";

const LABELS = { title: "Title", subtitle: "Subtitle", body: "Text" };
// what the server calls each field in its own messages ("The title is required.")
const WORDS = { title: "The title", subtitle: "The subtitle", body: "The text" };

// A text of ONE line is held in a box that grows as the text gets longer and wraps it, so that a person can read all of what they wrote; but
// it stays ONE line: Enter does nothing in it, and a new line that comes in another way (a paste, a keyboard) becomes a space. What is sent
// is not changed by this: the server's cleaning (a new line is a space) is applied to the text before it is sent, as it always was.
const NEW_LINES = /\r\n|\r|\n/g;
const withoutNewLines = (value) => value.replace(NEW_LINES, " ");

// The box is as high as its text (and no higher). It is made small first so that it can also shrink.
function fit(control) {
  if (!control) return;
  control.style.height = "auto";
  if (control.scrollHeight > 0) {
    const border = Math.max(0, control.offsetHeight - control.clientHeight);
    control.style.height = `${control.scrollHeight + border}px`;
  }
}

const pick = (block, fields) => Object.fromEntries(fields.map((field) => [field, block[field] ?? ""]));
const plural = (number, one, many) => `${number} ${number === 1 ? one : many}`;

// The parts of a text, drawn: what was filled in has a soft tint behind it (it is not a link: it cannot be pressed), what could not be filled in
// or is not a placeholder is underlined with a wave.
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

// A note: a soft box with an icon on its left.
function Note({ children }) {
  return (
    <div className="mobile-content-note">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </svg>
      <p>{children}</p>
    </div>
  );
}

export const BANNER_NAME_NOTE = "Ang pangalan ay galing sa naka-login na bisita, hindi sa inyong isinulat.";

// The design of the page (5e) names some boxes differently from the server's words ("Greeting", "Paragraph"); `labels` says which, field by field.
// `banner` draws the preview as the banner of the app. `note` is a line under the form. Without them the editor looks and reads as it did.
export default function MobileContentBlockEditor({
  blockKey,
  heading,
  eyebrow,
  intro,
  hints = {},
  labels = {},
  note,
  banner = false,
  pillars,
  below,
  builtIn,
}) {
  // how the preview is drawn: as the banner of the app (Welcome), as the tiles and their page (Why Visit: given the pillars), or as plain text
  const mock = banner ? "banner" : pillars ? "sheet" : null;
  const labelOf = (field) => labels[field] || LABELS[field] || field;
  const wordOf = (field) => (labels[field] ? `The ${labels[field].toLowerCase()}` : WORDS[field] || "This");
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
  const uid = useId(); // the boxes are named by their <label for>, so each needs an id of its own (two editors may be on one page)

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

  // every box of one line fits its text after each draw, and again when the window changes its width (the text wraps differently)
  useLayoutEffect(() => {
    Object.values(controls.current).forEach((control) => control && control.dataset.line === "true" && fit(control));
  });
  useEffect(() => {
    const refit = () => Object.values(controls.current).forEach((control) => control && control.dataset.line === "true" && fit(control));
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, []);

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
  // The Save button is there, and open (while the server's question or the clash of two edits is shown, it is replaced by their buttons).
  const saveOpen = canSave && !ask && !conflict;

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
    if (saveOpen) send();
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

  // Each field of the preview. In a mock, the name of the field is only for a screen reader (the mock shows the text, as the app does).
  const previewFields = previews.map((item) => (
    <div
      key={item.field}
      className={`mobile-content-preview-field${mock ? ` mobile-content-${mock}-${item.field}` : ""}`}
      data-testid={`preview-${item.field}`}
    >
      <small className={mock ? "mobile-content-sr" : "options-hint"}>{labelOf(item.field)}</small>
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
  ));

  return (
    <div className="mobile-content-panel">
      <div className="hotlines-notices mobile-content-notices" role="note" aria-label="About these changes">
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
            <form className="settings-card options-form mobile-content-card" onSubmit={submit} aria-label={heading}>
              <div className="report-card-title">
                {eyebrow ? <p className="mobile-content-eyebrow">{eyebrow}</p> : null}
                <h2>{heading}</h2>
                {intro ? <p>{intro}</p> : null}
              </div>

              {fields.map((field) => {
                const limit = limits[field];
                const tooMany = over(field);
                const oneLine = limit.kind !== "text";
                const names = Array.isArray(allowed[field]) ? allowed[field] : [];
                const problems = placeholderWarnings(form[field], names);
                const id = `${uid}-${field}`;
                return (
                  <div key={field} className="settings-field settings-field-wide">
                    <label htmlFor={id}>
                      <span>{labelOf(field)}</span>
                    </label>
                    <textarea
                      id={id}
                      aria-describedby={`${id}-count`}
                      {...(oneLine
                        ? {
                            rows: 1,
                            className: "mobile-content-line",
                            "data-line": "true",
                            onKeyDown: (event) => {
                              // Enter does not start a new line here; it is the same as pressing Save, when Save is open (but not while a
                              // letter is still being composed: that Enter belongs to the keyboard)
                              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                if (saveOpen) send();
                              }
                            },
                          }
                        : { rows: 6 })}
                      ref={(element) => {
                        controls.current[field] = element;
                      }}
                      value={form[field] ?? ""}
                      disabled={working}
                      onChange={(event) => type(field, oneLine ? withoutNewLines(event.target.value) : event.target.value)}
                    />
                    {names.length ? (
                      <div className="mobile-content-insert" role="group" aria-label={`Placeholders for the ${labelOf(field).toLowerCase()}`}>
                        <small className="options-hint">Put in:</small>
                        {names.map((name) => (
                          <button
                            key={name}
                            type="button"
                            className="reply-btn"
                            title={notes[name] || undefined}
                            aria-label={`Put in {${name}} in the ${labelOf(field).toLowerCase()}`}
                            disabled={working}
                            onClick={() => insert(field, name)}
                          >
                            {`{${name}}`}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {hints[field] ? <small className="options-hint">{hints[field]}</small> : null}
                    <small className="options-hint" id={`${id}-count`} data-testid={`count-${field}`}>
                      {counts[field]} / {limit.max}
                    </small>
                    {tooMany ? (
                      <small className="options-reason" role="alert">
                        Too long by {plural(tooMany, "letter", "letters")}.
                      </small>
                    ) : empty(field) ? (
                      <small className="options-reason" role="alert">
                        {wordOf(field)} is required.
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
                  </div>
                );
              })}

              {builtIn ? (
                <div className="mobile-content-builtin-use">
                  <button type="button" className="reply-btn" onClick={useBuiltIn} disabled={working}>
                    {BUILT_IN_BUTTON}
                  </button>
                  <small className="options-hint">{BUILT_IN_BUTTON_NOTE}</small>
                </div>
              ) : null}

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
                      Someone else changed the {labelOf(field).toLowerCase()} since you opened it. It now says:{" "}
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
          {block && note ? <Note>{note}</Note> : null}
          {block ? <Note>{NEXT_VERSION_NOTICE}</Note> : null}
          {below}
        </div>

        <div className="mobile-content-side">
          {block ? (
            <section className="settings-card options-card mobile-content-card" aria-label="What the app will show">
              <div className="report-card-title">
                {mock ? <p className="mobile-content-eyebrow">Live preview</p> : null}
                {banner ? <h2>How it will look in the app</h2> : pillars ? <h2>{MOCK_TITLE}</h2> : <h3>What the app will show</h3>}
                {pillars && !banner ? <p>{MOCK_SUBTITLE}</p> : null}
              </div>
              {banner ? (
                <div className="mobile-content-phone">
                  <div className="mobile-content-banner">{previewFields}</div>
                </div>
              ) : pillars ? (
                <>
                  <div className="mobile-content-phone">
                    <div className="mobile-content-sheet">
                      {previewFields}
                      <TileGrid state={pillars} />
                    </div>
                    <TileFoot state={pillars} />
                  </div>
                  <div className="mobile-content-phone">
                    <DetailMock state={pillars} />
                  </div>
                </>
              ) : (
                previewFields
              )}
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
                  {banner ? BANNER_NAME_NOTE : NAME_NOTE}
                </p>
              ) : null}
              {anyFilled ? (
                <p className="options-hint" role="note">
                  {FILLED_NOTE}
                </p>
              ) : null}
            </section>
          ) : null}

        </div>
      </div>
    </div>
  );
}
