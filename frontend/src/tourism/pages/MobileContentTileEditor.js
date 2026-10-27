import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { DEFAULT_MOBILE_CONTENT_TAB, canManageMobileContent, sectionTabPath, tabPath } from "../mobileContentAccess";
import { blockConfirmRequired, tourismApi } from "../services/tourismApi";
import { fitBox, withoutNewLines } from "../utils/mobileContentLineBox";
import { insertAt, placeholderWarnings } from "../utils/mobileContentPreview";
import {
  FIELD_RULES,
  HARD_LIMITS,
  ICON_NAMES,
  ITEM_PLACEHOLDERS,
  ITEM_SECTIONS,
  ORDER_MAX,
  ORDER_MIN,
  ORDER_STEP,
} from "../utils/mobileContentTileRules";
import { countLetters, normalizeFor } from "../utils/mobileContentText";
import { ICON_TONES, PILLAR_ICONS } from "./MobileContentPillars";

// The page of ONE tile (a pillar of Why Visit, a card of the Travel Guide): /mobile-content/tile?id=12 to edit it, ?section=why_visit to add one
// (Commit 6b). A page, not a pop-up. It is a FORM: the title, the icon, the short line (one line, like a title), the full text (paragraphs), and the
// position. It reads the items and the blocks once (the blocks only for the explanations of the placeholders), and it sends ONE request when the
// person saves: a PATCH of what changed, or a POST for a new tile. It counts, limits and warns as the server does (mobileContentTileRules.js is a
// copy of the server's numbers, held to it by a test), and the server stays the authority: what it refuses is shown under the field it names.

export const SAVED_NOTICE = "The change was saved.";
export const ADDED_NOTICE = "The tile was added.";
export const LOAD_ERROR_FALLBACK = "The tile could not be loaded.";
export const NOT_FOUND = "This tile does not exist.";
export const BAD_ADDRESS = "This address does not name a tile or a section.";
export const BANNER_NOTE = "A banner has no full text: only a tile opens a page when it is tapped.";
export const SHORT_HINT = "Ito ang nakikita agad sa Home. Panatilihing maikli — pinuputol ito ng app kapag masyadong mahaba.";
export const FULL_HINT =
  "Kapag blangko ito, hindi napipindot ang tile — teksto lang, gaya ng dati. Lumalabas lang ang arrow kapag may laman.";
export const BADGE_FILLED = "May laman";
export const BADGE_EMPTY = "Walang laman";

const WORDS = { title: "The title", short_text: "The short line", full_text: "The full text" };
// the browser must not check the number itself: with min 1 and step 10 it would call 10 and 20 "not valid" (its steps start at the minimum).
// The page says what is wrong with the position, and the server decides.
const SHOWN_FIELDS = ["title", "short_text", "full_text", "icon", "display_order"]; // the fields that have a place on the page to show an error
const plural = (number, one, many) => `${number} ${number === 1 ? one : many}`;
const FEE_NAMES = ITEM_PLACEHOLDERS;
const orderMessage = `The position must be a whole number from ${ORDER_MIN} to ${ORDER_MAX}.`;

function Chevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A5A33" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

// The drawing of an icon: the one of the pillars (MobileContentPillars.js), in the colour of its tone, drawn bigger for a button.
function IconDrawing({ name }) {
  const icon = PILLAR_ICONS[name] || PILLAR_ICONS.info;
  const tone = ICON_TONES[icon.tone];
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tone.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icon.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const asValues = (item) => ({
  title: item.title ?? "",
  short_text: item.short_text ?? "",
  full_text: item.full_text ?? "",
  icon: item.icon || "info",
  display_order: item.display_order == null ? "" : String(item.display_order),
});
const BLANK = { title: "", short_text: "", full_text: "", icon: "info", display_order: "" };

export default function MobileContentTileEditor() {
  const { role } = useAuth();
  const [params, setParams] = useSearchParams();
  const uid = useId();

  const idText = params.get("id");
  const isNew = idText === null;
  const itemId = idText !== null && /^[0-9]+$/.test(idText) && Number(idText) >= 1 ? Number(idText) : null;
  const askedSection = params.get("section");
  const newSection = isNew && askedSection && Object.prototype.hasOwnProperty.call(ITEM_SECTIONS, askedSection) ? askedSection : null;
  const addressOk = itemId !== null || newSection !== null;
  const allowed = canManageMobileContent(role);

  // undefined until the first load: only then the page says "Loading...".
  const [item, setItem] = useState(undefined); // the tile as the server holds it (null for a new one)
  const [notes, setNotes] = useState({});
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [baseline, setBaseline] = useState(BLANK);
  const [form, setForm] = useState(BLANK);
  const [working, setWorking] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [ask, setAsk] = useState(null); // the server asks for a confirmation: { dropped, message }
  const [leave, setLeave] = useState(null); // { to, replace }: the page goes back to the tab
  const inFlight = useRef(false);
  const created = useRef(null); // the id of a tile this page has just added: its address changes, and nothing is read again
  const controls = useRef({});
  const caret = useRef(null);

  const section = item ? item.section : newSection;

  useEffect(() => {
    if (!allowed || !addressOk) return undefined;
    if (created.current !== null && created.current === itemId) return undefined; // just added here: it is already on the page
    let cancelled = false;
    setLoadError("");
    setItem(undefined);
    const wanted = itemId !== null ? undefined : newSection;
    Promise.all([tourismApi.getMobileContentItems(wanted), tourismApi.getMobileContentBlocks()])
      .then(([list, blocks]) => {
        if (cancelled) return;
        setNotes(blocks && blocks.placeholders && typeof blocks.placeholders === "object" ? blocks.placeholders : {});
        if (itemId === null) {
          setItem(null);
          setBaseline(BLANK);
          setForm(BLANK);
          return;
        }
        const found = (Array.isArray(list) ? list : []).find((candidate) => candidate.id === itemId);
        if (!found) {
          setLoadError(NOT_FOUND);
          return;
        }
        setItem(found);
        setBaseline(asValues(found));
        setForm(asValues(found));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || LOAD_ERROR_FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, addressOk, itemId, newSection, retry]);

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

  // the boxes of one line fit their text after each draw, and again when the window changes its width
  useLayoutEffect(() => {
    Object.values(controls.current).forEach((control) => control && control.dataset.line === "true" && fitBox(control));
  });
  useEffect(() => {
    const refit = () => Object.values(controls.current).forEach((control) => control && control.dataset.line === "true" && fitBox(control));
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, []);

  const ready = item !== undefined && !loadError && section !== null;
  const limits = ready ? HARD_LIMITS[section] : {};
  const isBanner = Boolean(item && item.style === "banner");

  // ---- what the server will find ----
  const cleaned = Object.fromEntries(Object.keys(FIELD_RULES).map((field) => [field, normalizeFor(FIELD_RULES[field].kind, form[field])]));
  const counts = Object.fromEntries(Object.keys(FIELD_RULES).map((field) => [field, countLetters(cleaned[field])]));
  const over = (field) => (ready ? Math.max(0, counts[field] - limits[field]) : 0);
  const empty = (field) => FIELD_RULES[field].required && cleaned[field] === "";
  const orderText = String(form.display_order).trim();
  const orderNumber = /^[0-9]+$/.test(orderText) ? Number(orderText) : null;
  const orderBad = orderText === "" ? !isNew : orderNumber === null || orderNumber < ORDER_MIN || orderNumber > ORDER_MAX;
  const changes = {};
  if (!isNew) {
    ["title", "short_text"].forEach((field) => {
      if (cleaned[field] !== baseline[field]) changes[field] = cleaned[field];
    });
    if (!isBanner && cleaned.full_text !== baseline.full_text) changes.full_text = cleaned.full_text;
    if (form.icon !== baseline.icon) changes.icon = form.icon;
    if (!orderBad && orderNumber !== Number(baseline.display_order)) changes.display_order = orderNumber;
  }
  const problems = Object.keys(FIELD_RULES).some((field) => over(field) || empty(field)) || orderBad;
  const canSave = ready && !working && !problems && (isNew || Object.keys(changes).length > 0);
  const saveOpen = canSave && !ask;

  function type(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setAsk(null);
    setNotice("");
  }

  function insert(field, name) {
    const control = controls.current[field];
    const put = insertAt(form[field] ?? "", `{${name}}`, control && control.selectionStart, control && control.selectionEnd);
    caret.current = { field, position: put.caret };
    type(field, put.value);
  }

  async function send({ confirm } = {}) {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setFieldErrors({});
    setActionError("");
    setNotice("");
    setWarnings([]);
    setAsk(null);
    try {
      let answer;
      if (isNew) {
        const values = { section: newSection, title: cleaned.title, short_text: cleaned.short_text, icon: form.icon };
        if (cleaned.full_text !== "") values.full_text = cleaned.full_text;
        if (orderText !== "") values.display_order = orderNumber;
        answer = await tourismApi.createMobileContentItem(values);
        created.current = answer.id;
        setItem(answer);
        setParams({ id: String(answer.id) }, { replace: true }); // the address now names the tile; nothing is read again
        setNotice(ADDED_NOTICE);
      } else {
        answer = await tourismApi.updateMobileContentItem(itemId, changes, confirm);
        setItem(answer);
        setNotice(SAVED_NOTICE);
      }
      setBaseline(asValues(answer)); // what the server answered, not what was typed
      setForm(asValues(answer));
      setWarnings(Array.isArray(answer.warnings) ? answer.warnings : []);
    } catch (error) {
      const asked = blockConfirmRequired(error);
      if (asked) {
        setAsk(asked);
        return;
      }
      const details = error.details && typeof error.details === "object" ? error.details : {};
      const byField = {};
      SHOWN_FIELDS.forEach((field) => {
        if (Array.isArray(details[field]) && details[field].length) byField[field] = String(details[field][0]);
      });
      if (Object.keys(byField).length) setFieldErrors(byField);
      else setActionError(error.message || "The change could not be saved.");
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (saveOpen) send();
  }

  // Enter in a text of one line is the same as Save, when Save is open; it never starts a new line (and not while a letter is being composed)
  const onLineKey = (event) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (saveOpen) send();
    }
  };

  const backPath = section ? sectionTabPath(section) : tabPath(DEFAULT_MOBILE_CONTENT_TAB);
  const goBack = (replace) => (event) => {
    event.preventDefault();
    setLeave({ to: backPath, replace });
  };

  // The page itself refuses anyone but the admin (the route and the sidebar do too). Asked AFTER the hooks, which may not be skipped.
  if (!allowed) return <Navigate to="/" replace />;
  if (leave) return <Navigate to={leave.to} replace={leave.replace} />;

  const titleId = `${uid}-title`;
  const shortId = `${uid}-short`;
  const fullId = `${uid}-full`;
  const orderId = `${uid}-order`;
  const heading = !ready ? (isNew && newSection ? "New tile" : "Tile") : isNew ? "New tile" : item.title;

  const placeholderButtons = (field, word) => (
    <div className="mobile-content-insert" role="group" aria-label={`Placeholders for the ${word}`}>
      <small className="options-hint">Put in:</small>
      {FEE_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          className="reply-btn"
          title={notes[name] || undefined}
          aria-label={`Put in {${name}} in the ${word}`}
          disabled={working}
          onClick={() => insert(field, name)}
        >
          {`{${name}}`}
        </button>
      ))}
    </div>
  );

  const fieldFeedback = (field) => (
    <>
      <small className="options-hint" id={`${uid}-count-${field}`} data-testid={`count-${field}`}>
        {counts[field]} / {limits[field]}
      </small>
      {over(field) ? (
        <small className="options-reason" role="alert">
          Too long by {plural(over(field), "letter", "letters")}.
        </small>
      ) : empty(field) ? (
        <small className="options-reason" role="alert">
          {WORDS[field]} is required.
        </small>
      ) : null}
      {placeholderWarnings(form[field], FEE_NAMES).map((problem) => (
        <small key={problem} className="options-reason" role="note" data-testid={`warning-${field}`}>
          {problem}
        </small>
      ))}
      {fieldErrors[field] ? (
        <small className="options-reason" role="alert" data-testid={`error-${field}`}>
          {fieldErrors[field]}
        </small>
      ) : null}
    </>
  );

  const lineBox = (field, id, labelledBy) => (
    <textarea
      id={id}
      rows={1}
      className="mobile-content-line"
      data-line="true"
      aria-describedby={`${uid}-count-${field}`}
      {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
      ref={(element) => {
        controls.current[field] = element;
      }}
      value={form[field] ?? ""}
      disabled={working}
      onKeyDown={onLineKey}
      onChange={(event) => type(field, withoutNewLines(event.target.value))}
    />
  );

  const hasFullText = cleaned.full_text !== "";

  return (
    <div className="reports-page settings-page options-page mobile-content-page mobile-content-tile-page">
      <div className="reports-header">
        <div>
          <a className="mobile-content-back" href={backPath} onClick={goBack(false)}>
            <Chevron />
            <span>{section ? `Back to ${ITEM_SECTIONS[section]}` : "Back to Mobile App Content"}</span>
          </a>
          <p className="mobile-content-eyebrow">{isNew ? "Adding a tile" : "Editing a tile"}</p>
          <h1>{heading}</h1>
        </div>
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

      {!addressOk ? (
        <p className="settings-status error" role="alert">
          {BAD_ADDRESS}
        </p>
      ) : null}
      {addressOk && item === undefined && !loadError ? <p className="options-empty">Loading...</p> : null}
      {loadError ? (
        <p className="settings-status error" role="alert">
          {loadError}{" "}
          {loadError === NOT_FOUND ? null : (
            <button type="button" className="reply-btn" onClick={() => setRetry((count) => count + 1)}>
              Try again
            </button>
          )}
        </p>
      ) : null}

      {ready ? (
        <form className="options-form mobile-content-tile-form" onSubmit={submit} noValidate aria-label={isNew ? "New tile" : "Edit tile"}>
          <section className="settings-card mobile-content-card mobile-content-tile-card" aria-label="Title and icon">
            <div className="settings-field settings-field-wide">
              <label htmlFor={titleId}>
                <span>Title</span>
              </label>
              {lineBox("title", titleId)}
              {placeholderButtons("title", "title")}
              {fieldFeedback("title")}
            </div>
            <div className="settings-field">
              <span className="mobile-content-label" id={`${uid}-icon`}>
                Icon
              </span>
              <div className="mobile-content-icons" role="radiogroup" aria-labelledby={`${uid}-icon`}>
                {ICON_NAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={form.icon === name}
                    aria-label={name}
                    title={name}
                    className="mobile-content-icon-choice"
                    data-selected={form.icon === name ? "true" : "false"}
                    disabled={working}
                    onClick={() => type("icon", name)}
                  >
                    <IconDrawing name={name} />
                  </button>
                ))}
              </div>
              {fieldErrors.icon ? (
                <small className="options-reason" role="alert" data-testid="error-icon">
                  {fieldErrors.icon}
                </small>
              ) : null}
            </div>
          </section>

          <section className="settings-card mobile-content-card mobile-content-tile-card" aria-labelledby={`${uid}-short-h`}>
            <div className="report-card-title">
              <p className="mobile-content-eyebrow">Nasa tile</p>
              <h2 id={`${uid}-short-h`}>Maikling linya</h2>
            </div>
            <div className="settings-field settings-field-wide">
              {lineBox("short_text", shortId, `${uid}-short-h`)}
              {placeholderButtons("short_text", "short line")}
              <small className="options-hint">{SHORT_HINT}</small>
              {fieldFeedback("short_text")}
            </div>
          </section>

          <section className="settings-card mobile-content-card mobile-content-tile-card" aria-labelledby={`${uid}-full-h`}>
            <div className="report-card-title">
              <p className="mobile-content-eyebrow">
                Kapag pinindot{" "}
                <span className="mobile-content-tag" data-detail="yes" data-testid="full-badge" data-state={hasFullText ? "filled" : "empty"}>
                  {hasFullText ? BADGE_FILLED : BADGE_EMPTY}
                </span>
              </p>
              <h2 id={`${uid}-full-h`}>Buong teksto</h2>
            </div>
            <div className="settings-field settings-field-wide">
              <textarea
                id={fullId}
                rows={8}
                aria-labelledby={`${uid}-full-h`}
                aria-describedby={`${uid}-count-full_text`}
                ref={(element) => {
                  controls.current.full_text = element;
                }}
                value={form.full_text ?? ""}
                disabled={working || isBanner}
                onChange={(event) => type("full_text", event.target.value)}
              />
              {isBanner ? (
                <small className="options-hint" data-testid="banner-note">
                  {BANNER_NOTE}
                </small>
              ) : (
                <>
                  {placeholderButtons("full_text", "full text")}
                  <small className="options-hint">{FULL_HINT}</small>
                </>
              )}
              {fieldFeedback("full_text")}
            </div>
          </section>

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
          ) : null}

          <div className="mobile-content-tile-bar">
            <div className="settings-field mobile-content-tile-order">
              <label htmlFor={orderId}>
                <span>Order</span>
              </label>
              <input
                id={orderId}
                type="number"
                min={ORDER_MIN}
                max={ORDER_MAX}
                step={ORDER_STEP}
                inputMode="numeric"
                value={form.display_order}
                disabled={working}
                aria-describedby={`${uid}-order-hint`}
                onChange={(event) => type("display_order", event.target.value)}
              />
              {orderBad ? (
                <small className="options-reason" role="alert">
                  {orderMessage}
                </small>
              ) : null}
              {fieldErrors.display_order ? (
                <small className="options-reason" role="alert" data-testid="error-display_order">
                  {fieldErrors.display_order}
                </small>
              ) : null}
              <small className="options-hint" id={`${uid}-order-hint`}>
                {isNew ? "Left empty, the tile goes to the end of the list." : "The tiles are shown from the smallest number."}
              </small>
            </div>
            <div className="options-form-actions">
              <button type="button" className="tourist-record-cancel" onClick={goBack(true)} disabled={working}>
                Cancel
              </button>
              <button type="submit" className="tourist-record-save" disabled={!saveOpen}>
                {working ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
