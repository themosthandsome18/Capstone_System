import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { blockConfirmRequired, tourismApi } from "../services/tourismApi";
import { fitBox, withoutNewLines } from "../utils/mobileContentLineBox";
import { insertAt, placeholderWarnings, previewContext, previewParts } from "../utils/mobileContentPreview";
import { BULLET, bulletLines, countLetters, lineCount, linesOf, longLines, longestLine, normalizeLine } from "../utils/mobileContentText";
import { Parts } from "./MobileContentFilled";

// The tab "Port & Boat Guide" (Commit 8b), Paraan A. The block port_guide holds a title and a body of LINES (each line a bullet in the app); nothing more is
// stored: no times, no ports, no fare. By agreement the body has FOUR lines, in this order: the boat departure times, the island port arrival, the
// environmental fee, the boat fare note. This tab shows each in a box of its own and builds the body again with "\\n", in that order. It reads no line: it only
// takes the lines of the body as they are, by position. When the body does not have exactly four lines it does NOT guess which line is which; it falls back to
// ONE box of lines, and says why. The place where the fee is paid is the block fee_office, a line of its own, that other texts name with {fee_office}.

export const LINE_LABELS = ["Boat departure times", "Island port arrival", "Environmental fee", "Boat fare note"];
export const LINE_COUNT = 4;
export const FEE_LINE = 2; // the third box: the one with the placeholders of the fee
export const SAVED_NOTICE = "The change was saved.";
export const OFFICE_SAVED_NOTICE = "The place where the fee is paid was saved.";
export const LOAD_ERROR_FALLBACK = "The Port & Boat Guide could not be loaded.";
export const NO_BLOCK = "The Port & Boat Guide is not available.";
export const LOCK_HEADING = "Environmental fee — locked";
export const LOCK_NOTE_1 =
  "Kinukuwenta ito sa bawat ulat, hindi iniimbak sa bawat record. Kapag pinalitan, magbabago ang bawat nakaraang ulat ng LGU — pati ang kita noong nakaraang buwan.";
export const LOCK_NOTE_2 = "Ang pamasahe ng bangka ay nasa Registration Options › Boat Capacity and Fare, hindi dito.";
export const PREVIEW_HEADING = "How it looks in the app";
export const PREVIEW_SOURCE = "Ang bayad sa linyang ito ay galing sa iisang pinagmulan — hindi ito maaaring maiba sa totoong kuwenta.";
export const OFFICE_USE = "Ang ibang tab ay gumagamit nito sa pamamagitan ng {fee_office}: ang lugar na ito ay isinusulat dito nang minsan at pinupunan sa bawat tekstong may {fee_office}.";
export const OFFICE_NOTE =
  "The place where the fee is paid is not written yet, so a text that names it with {fee_office} cannot be shown until it is. You can still save.";
export const FEE_NOTE = "The current entrance fee could not be loaded, so [fee not available] stands where the amount will be. You can still save.";
export const NOT_FOUR = (count) =>
  `This guide has ${count} ${count === 1 ? "line" : "lines"} on the server, not four, so it cannot be put into the four boxes without guessing which line is which. ` +
  "Edit it here as lines. The four boxes come back when it has exactly four lines.";
export const FOUR_NOW = "It has four lines now. The next time this tab is opened, it will show them in the four boxes, by position.";
export const BULLET_WARNING = `This line starts with a bullet (${BULLET}). The app puts the bullet in front of every line by itself, so write the line without it.`;
const FEE_NAMES = ["fee_regular", "fee_discounted", "fee_office"];

// the lines of a body as the server holds it (it has no blank line), and the body built again from lines
export const splitBody = (body) => (typeof body === "string" && body !== "" ? body.split("\n") : []);
export const composeBody = (lines) => lines.map(normalizeLine).join("\n");
export const bodyMode = (body) => (splitBody(body).length === LINE_COUNT ? "four" : "free");

const plural = (number, one, many) => `${number} ${number === 1 ? one : many}`;
const peso = (amount) => (typeof amount === "number" && Number.isFinite(amount) ? `₱${amount}` : "—");

function Padlock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A4F16" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// ONE read of the blocks (the port guide, the place where the fee is paid, the fee, the notes of the placeholders), once the tab is open.
function useBlocks() {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError("");
    tourismApi
      .getMobileContentBlocks()
      .then((answer) => {
        if (!cancelled) setData(answer && typeof answer === "object" ? answer : {});
      })
      .catch((failure) => {
        if (!cancelled) setError(failure.message || LOAD_ERROR_FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);
  return { data, error, reload: () => setRetry((count) => count + 1) };
}

const findBlock = (data, key) => (data && Array.isArray(data.blocks) ? data.blocks.find((block) => block.key === key) : undefined);

export default function MobileContentPortTab() {
  const { data, error, reload } = useBlocks();
  const guide = findBlock(data, "port_guide");
  const office = findBlock(data, "fee_office");
  const ready = data !== undefined && !error && Boolean(guide);
  if (error) {
    return (
      <p className="settings-status error" role="alert">
        {error}{" "}
        <button type="button" className="reply-btn" onClick={reload}>
          Try again
        </button>
      </p>
    );
  }
  if (data === undefined) return <p className="options-empty">Loading...</p>;
  if (!ready) {
    return (
      <p className="settings-status error" role="alert">
        {NO_BLOCK}
      </p>
    );
  }
  return <PortBody first={data} guide={guide} office={office} />;
}

function PortBody({ first, guide, office }) {
  const uid = useId();
  const limits = guide.limits || {};
  const titleLimit = (limits.title && limits.title.max) || 160;
  const bodyLimit = limits.body || { max: 400, max_lines: 8 };
  const allowed = (guide.allowed_placeholders && guide.allowed_placeholders.body) || FEE_NAMES;
  const notes = first.placeholders && typeof first.placeholders === "object" ? first.placeholders : {};
  const fee = first.fee && typeof first.fee === "object" ? first.fee : null;
  const officeLimit = (office && office.limits && office.limits.body && office.limits.body.max) || 120;

  // ---- the guide: the title and the body ----
  const mode = useRef(bodyMode(guide.body)).current;
  const linesAtLoad = splitBody(guide.body);
  const [baseline, setBaseline] = useState({ title: guide.title || "", body: guide.body || "" });
  const [title, setTitle] = useState(guide.title || "");
  const [lines, setLines] = useState(mode === "four" ? linesAtLoad : ["", "", "", ""]);
  const [free, setFree] = useState(mode === "free" ? guide.body || "" : "");
  const [officeSaved, setOfficeSaved] = useState(office ? office.body || "" : "");
  const [working, setWorking] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [ask, setAsk] = useState(null);
  const [conflict, setConflict] = useState(null);
  const inFlight = useRef(false);
  const controls = useRef({});
  const caret = useRef(null);

  // ---- the place where the fee is paid ----
  const [officeBaseline, setOfficeBaseline] = useState(office ? office.body || "" : "");
  const [officeText, setOfficeText] = useState(office ? office.body || "" : "");
  const [officeWorking, setOfficeWorking] = useState(false);
  const [officeError, setOfficeError] = useState("");
  const [officeAction, setOfficeAction] = useState("");
  const [officeNotice, setOfficeNotice] = useState("");
  const [officeWarnings, setOfficeWarnings] = useState([]);
  const [officeConflict, setOfficeConflict] = useState(null);
  const officeFlight = useRef(false);

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
  useLayoutEffect(() => {
    Object.values(controls.current).forEach((control) => control && control.dataset.line === "true" && fitBox(control));
  });
  useEffect(() => {
    const refit = () => Object.values(controls.current).forEach((control) => control && control.dataset.line === "true" && fitBox(control));
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, []);

  // ---- what the server will find ----
  const four = mode === "four";
  const cleanTitle = normalizeLine(title);
  const cleanLines = lines.map(normalizeLine);
  const freeLines = linesOf(free);
  const body = four ? cleanLines.join("\n") : freeLines.join("\n");
  const titleOver = Math.max(0, countLetters(cleanTitle) - titleLimit);
  const titleEmpty = cleanTitle === "";
  const lineOver = cleanLines.map((line) => Math.max(0, countLetters(line) - bodyLimit.max));
  const lineEmpty = cleanLines.map((line) => line === "");
  const freeLong = longLines(free, bodyLimit.max);
  const freeTooMany = Math.max(0, lineCount(free) - bodyLimit.max_lines);
  const freeEmpty = freeLines.length === 0;
  const problems = titleOver > 0 || titleEmpty || (four ? lineOver.some(Boolean) || lineEmpty.some(Boolean) : freeLong.length > 0 || freeTooMany > 0 || freeEmpty);
  const changes = {};
  if (cleanTitle !== baseline.title) changes.title = cleanTitle;
  if (body !== baseline.body) changes.body = body;
  const canSave = !working && !problems && Object.keys(changes).length > 0;
  const saveOpen = canSave && !ask && !conflict;

  const context = previewContext({ fee, blocks: [{ key: "fee_office", body: officeSaved }] });
  const titleShown = previewParts(cleanTitle, context, allowed);
  const shownLines = four ? cleanLines.filter(Boolean) : freeLines;
  const linesShown = shownLines.map((line) => previewParts(line, context, allowed));
  const officeMissing = titleShown.officeMissing || linesShown.some((entry) => entry.officeMissing);
  const feeMissing = titleShown.feeMissing || linesShown.some((entry) => entry.feeMissing);

  function touch() {
    setAsk(null);
    setConflict(null);
    setNotice("");
  }
  const typeTitle = (value) => {
    setTitle(withoutNewLines(value));
    setFieldErrors((current) => ({ ...current, title: undefined }));
    touch();
  };
  const typeLine = (index, value) => {
    setLines((current) => current.map((line, at) => (at === index ? withoutNewLines(value) : line)));
    setFieldErrors((current) => ({ ...current, body: undefined }));
    touch();
  };
  const typeFree = (value) => {
    setFree(value);
    setFieldErrors((current) => ({ ...current, body: undefined }));
    touch();
  };
  function insert(key, current, set, name) {
    const control = controls.current[key];
    const put = insertAt(current, `{${name}}`, control && control.selectionStart, control && control.selectionEnd);
    caret.current = { field: key, position: put.caret };
    set(put.value);
  }

  function adopt(answer) {
    const answered = { title: answer.title || "", body: answer.body || "" };
    setBaseline(answered);
    setTitle(answered.title);
    if (four) setLines(splitBody(answered.body));
    else setFree(answered.body);
  }

  async function send({ confirm, force = false } = {}) {
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
      if (!force) {
        // Has someone else changed what I changed, since I opened it? Look again, now.
        let latest;
        try {
          latest = findBlock(await tourismApi.getMobileContentBlocks(), "port_guide");
        } catch (failure) {
          setActionError("Your change was not saved, because this page could not check whether someone else changed the text. " + (failure.message || ""));
          return;
        }
        if (!latest) {
          setActionError(NO_BLOCK);
          return;
        }
        const clashes = Object.keys(changes).filter((field) => (latest[field] || "") !== baseline[field]);
        if (clashes.length) {
          setConflict({ latest, fields: clashes });
          return;
        }
      }
      const answer = await tourismApi.updateMobileContentBlock("port_guide", changes, confirm);
      adopt(answer);
      setNotice(SAVED_NOTICE);
      setWarnings(Array.isArray(answer.warnings) ? answer.warnings : []);
    } catch (failure) {
      const asked = blockConfirmRequired(failure);
      if (asked) {
        setAsk(asked);
        return;
      }
      const details = failure.details && typeof failure.details === "object" ? failure.details : {};
      const byField = {};
      ["title", "body"].forEach((field) => {
        if (Array.isArray(details[field]) && details[field].length) byField[field] = String(details[field][0]);
      });
      if (Object.keys(byField).length) setFieldErrors(byField);
      else setActionError(failure.message || "The change could not be saved.");
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }

  function keepEditing() {
    const { latest } = conflict;
    const latestValues = { title: latest.title || "", body: latest.body || "" };
    if (cleanTitle === baseline.title) setTitle(latestValues.title);
    if (body === baseline.body) {
      if (four) setLines(splitBody(latestValues.body));
      else setFree(latestValues.body);
    }
    setBaseline(latestValues);
    setConflict(null);
  }

  function submit(event) {
    event.preventDefault();
    if (saveOpen) send();
  }
  const onLineKey = (event) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (saveOpen) send();
    }
  };

  // ---- the place where the fee is paid: its own save ----
  const officeClean = normalizeLine(officeText);
  const officeOver = Math.max(0, countLetters(officeClean) - officeLimit);
  const officeEmpty = officeClean === "";
  const officeChanged = officeClean !== officeBaseline;
  const officeSaveOpen = !officeWorking && !officeConflict && officeChanged && !officeOver && !officeEmpty;

  async function sendOffice({ force = false } = {}) {
    if (officeFlight.current) return;
    officeFlight.current = true;
    setOfficeWorking(true);
    setOfficeError("");
    setOfficeAction("");
    setOfficeNotice("");
    setOfficeWarnings([]);
    setOfficeConflict(null);
    try {
      if (!force) {
        let latest;
        try {
          latest = findBlock(await tourismApi.getMobileContentBlocks(), "fee_office");
        } catch (failure) {
          setOfficeAction("Your change was not saved, because this page could not check whether someone else changed the text. " + (failure.message || ""));
          return;
        }
        if (!latest) {
          setOfficeAction(NO_BLOCK);
          return;
        }
        if ((latest.body || "") !== officeBaseline) {
          setOfficeConflict({ latest });
          return;
        }
      }
      const answer = await tourismApi.updateMobileContentBlock("fee_office", { body: officeClean });
      const saved = answer.body || "";
      setOfficeBaseline(saved);
      setOfficeText(saved);
      setOfficeSaved(saved);
      setOfficeNotice(OFFICE_SAVED_NOTICE);
      setOfficeWarnings(Array.isArray(answer.warnings) ? answer.warnings : []);
    } catch (failure) {
      const details = failure.details && typeof failure.details === "object" ? failure.details : {};
      if (Array.isArray(details.body) && details.body.length) setOfficeError(String(details.body[0]));
      else setOfficeAction(failure.message || "The change could not be saved.");
    } finally {
      officeFlight.current = false;
      setOfficeWorking(false);
    }
  }
  const submitOffice = (event) => {
    event.preventDefault();
    if (officeSaveOpen) sendOffice();
  };
  const onOfficeKey = (event) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (officeSaveOpen) sendOffice();
    }
  };

  const lineBox = (key, id, value, onChange, onKey, disabled) => (
    <textarea
      id={id}
      rows={1}
      className="mobile-content-line"
      data-line="true"
      ref={(element) => {
        controls.current[key] = element;
      }}
      value={value}
      disabled={disabled}
      onKeyDown={onKey}
      onChange={(event) => onChange(event.target.value)}
    />
  );

  const placeholderButtons = (key, current, set, word) => (
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
          onClick={() => insert(key, current, set, name)}
        >
          {`{${name}}`}
        </button>
      ))}
    </div>
  );

  const warningsOf = (text, bulletCheck) => [
    ...placeholderWarnings(text, allowed),
    ...(bulletCheck && bulletLines(text).length ? [BULLET_WARNING] : []),
  ];

  return (
    <div className="mobile-content-tile-layout">
      <div className="mobile-content-port-main">
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

        <form className="settings-card options-form mobile-content-card mobile-content-tile-card" onSubmit={submit} noValidate aria-label="Port & Boat Guide">
          <div className="report-card-title">
            <p className="mobile-content-eyebrow">Bullets</p>
            <h2>Port &amp; Boat Guide</h2>
          </div>

          <div className="settings-field settings-field-wide">
            <label htmlFor={`${uid}-title`}>
              <span>Title</span>
            </label>
            {lineBox("title", `${uid}-title`, title, typeTitle, onLineKey, working)}
            <small className="options-hint" data-testid="count-title">
              {countLetters(cleanTitle)} / {titleLimit}
            </small>
            {titleOver ? (
              <small className="options-reason" role="alert">
                Too long by {plural(titleOver, "letter", "letters")}.
              </small>
            ) : titleEmpty ? (
              <small className="options-reason" role="alert">
                The title is required.
              </small>
            ) : null}
            {fieldErrors.title ? (
              <small className="options-reason" role="alert" data-testid="error-title">
                {fieldErrors.title}
              </small>
            ) : null}
          </div>

          {four ? (
            LINE_LABELS.map((label, index) => {
              const id = `${uid}-line-${index}`;
              const problemsHere = warningsOf(lines[index], true);
              return (
                <div key={label} className="settings-field settings-field-wide" data-testid={`line-box-${index + 1}`}>
                  <label htmlFor={id}>
                    <span>{label}</span>
                  </label>
                  {lineBox(`line${index}`, id, lines[index], (value) => typeLine(index, value), onLineKey, working)}
                  {index === FEE_LINE ? placeholderButtons(`line${index}`, lines[index], (value) => typeLine(index, value), label.toLowerCase()) : null}
                  <small className="options-hint" data-testid={`count-line-${index + 1}`}>
                    {countLetters(cleanLines[index])} / {bodyLimit.max}
                  </small>
                  {lineOver[index] ? (
                    <small className="options-reason" role="alert">
                      Too long by {plural(lineOver[index], "letter", "letters")}.
                    </small>
                  ) : lineEmpty[index] ? (
                    <small className="options-reason" role="alert">
                      The {label.toLowerCase()} is required: the guide needs all four lines.
                    </small>
                  ) : null}
                  {problemsHere.map((problem) => (
                    <small key={problem} className="options-reason" role="note" data-testid={`warning-line-${index + 1}`}>
                      {problem}
                    </small>
                  ))}
                </div>
              );
            })
          ) : (
            <div className="settings-field settings-field-wide" data-testid="free-box">
              <p className="options-reason" role="status" data-testid="free-why">
                {NOT_FOUR(linesAtLoad.length)}
              </p>
              <label htmlFor={`${uid}-free`}>
                <span>Lines</span>
              </label>
              <textarea
                id={`${uid}-free`}
                rows={6}
                ref={(element) => {
                  controls.current.free = element;
                }}
                value={free}
                disabled={working}
                onChange={(event) => typeFree(event.target.value)}
              />
              {placeholderButtons("free", free, typeFree, "lines")}
              <small className="options-hint" data-testid="count-free">
                {lineCount(free)} / {bodyLimit.max_lines} lines
              </small>
              <small className="options-hint" data-testid="longest-free">
                Longest line: {longestLine(free)} / {bodyLimit.max}
              </small>
              {freeTooMany ? (
                <small className="options-reason" role="alert" data-testid="toomanylines-free">
                  Too many lines by {freeTooMany}. The most it can have is {bodyLimit.max_lines}.
                </small>
              ) : null}
              {freeLong.map((entry) => (
                <small key={entry.number} className="options-reason" role="alert" data-testid="longline-free">
                  Line {entry.number} is too long by {plural(entry.over, "letter", "letters")}.
                </small>
              ))}
              {freeEmpty ? (
                <small className="options-reason" role="alert">
                  The text is required.
                </small>
              ) : null}
              {warningsOf(free, true).map((problem) => (
                <small key={problem} className="options-reason" role="note" data-testid="warning-free">
                  {problem}
                </small>
              ))}
            </div>
          )}
          {!four && splitBody(baseline.body).length === LINE_COUNT ? (
            <small className="options-hint" data-testid="four-now">
              {FOUR_NOW}
            </small>
          ) : null}
          {fieldErrors.body ? (
            <small className="options-reason" role="alert" data-testid="error-body">
              {fieldErrors.body}
            </small>
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
                  Someone else changed the {field === "title" ? "title" : "lines"} since you opened it. It now says: {"“"}
                  {conflict.latest[field] || ""}
                  {"”"} Yours says: {"“"}
                  {changes[field]}
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
              <button type="submit" className="tourist-record-save" disabled={!saveOpen}>
                {working ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </form>

        <form className="settings-card options-form mobile-content-card mobile-content-tile-card" onSubmit={submitOffice} noValidate aria-label="Place where the fee is paid">
          <div className="report-card-title">
            <p className="mobile-content-eyebrow">Used by the other tabs</p>
            <h2>Place where the fee is paid</h2>
            <p>{OFFICE_USE}</p>
          </div>
          {officeNotice ? (
            <p className="settings-status success" role="status">
              {officeNotice}
            </p>
          ) : null}
          {officeWarnings.map((warning) => (
            <p key={warning} className="settings-status" role="status" data-testid="office-warning">
              {warning}
            </p>
          ))}
          {officeAction ? (
            <p className="settings-status error" role="alert">
              {officeAction}
            </p>
          ) : null}
          {office ? (
            <div className="settings-field settings-field-wide">
              <label htmlFor={`${uid}-office`}>
                <span>Place</span>
              </label>
              {lineBox("office", `${uid}-office`, officeText, (value) => {
                setOfficeText(withoutNewLines(value));
                setOfficeError("");
                setOfficeConflict(null);
                setOfficeNotice("");
              }, onOfficeKey, officeWorking)}
              <small className="options-hint" data-testid="count-office">
                {countLetters(officeClean)} / {officeLimit}
              </small>
              {officeOver ? (
                <small className="options-reason" role="alert">
                  Too long by {plural(officeOver, "letter", "letters")}.
                </small>
              ) : officeEmpty ? (
                <small className="options-reason" role="alert">
                  The place is required.
                </small>
              ) : null}
              {officeError ? (
                <small className="options-reason" role="alert" data-testid="error-office">
                  {officeError}
                </small>
              ) : null}
            </div>
          ) : (
            <p className="settings-status error" role="alert">
              {NO_BLOCK}
            </p>
          )}
          {officeConflict ? (
            <div className="options-confirm" role="alertdialog" aria-label="Someone else changed the place">
              <p>
                Someone else changed the place since you opened it. It now says: {"“"}
                {officeConflict.latest.body || ""}
                {"”"} Yours says: {"“"}
                {officeClean}
                {"”"}
              </p>
              <p>This check is not a guarantee: it cannot see a change made at the very moment you save.</p>
              <div className="options-form-actions">
                <button
                  type="button"
                  className="tourist-record-cancel"
                  onClick={() => {
                    const latest = officeConflict.latest.body || "";
                    if (!officeChanged) setOfficeText(latest);
                    setOfficeBaseline(latest);
                    setOfficeConflict(null);
                  }}
                  disabled={officeWorking}
                >
                  Keep editing
                </button>
                <button type="button" className="tourist-record-save" onClick={() => sendOffice({ force: true })} disabled={officeWorking}>
                  {officeWorking ? "Saving..." : "Save my text anyway"}
                </button>
              </div>
            </div>
          ) : (
            <div className="options-form-actions">
              <button type="submit" className="tourist-record-save" disabled={!officeSaveOpen}>
                {officeWorking ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </form>
      </div>

      <aside className="mobile-content-tile-side mobile-content-port-side" aria-label="What the app will show">
        <section className="mobile-content-locked" aria-label={LOCK_HEADING} data-testid="locked-fee">
          <div className="mobile-content-locked-head">
            <Padlock />
            <h2>{LOCK_HEADING}</h2>
          </div>
          <div className="mobile-content-locked-prices">
            <div className="mobile-content-locked-price">
              <span className="mobile-content-locked-label">Standard</span>
              <strong data-part="regular">{peso(fee && fee.regular)}</strong>
            </div>
            <div className="mobile-content-locked-price">
              <span className="mobile-content-locked-label">Discounted</span>
              <strong data-part="discounted">{peso(fee && fee.discounted)}</strong>
            </div>
          </div>
          <p>{LOCK_NOTE_1}</p>
          <p>{LOCK_NOTE_2}</p>
        </section>

        <section className="settings-card mobile-content-card mobile-content-tile-preview">
          <div className="report-card-title">
            <p className="mobile-content-eyebrow">Preview</p>
            <h2>{PREVIEW_HEADING}</h2>
          </div>
          <div className="mobile-content-phone mobile-content-port-frame" data-testid="port-frame">
            <p className="mobile-content-port-title" data-testid="port-title">
              <Parts parts={titleShown.parts} />
            </p>
            <ul className="mobile-content-port-bullets" data-testid="port-bullets">
              {linesShown.map((entry, index) => (
                <li key={index}>
                  <span aria-hidden="true">{`${BULLET} `}</span>
                  <Parts parts={entry.parts} />
                </li>
              ))}
            </ul>
          </div>
          <p className="mobile-content-port-source">{PREVIEW_SOURCE}</p>
          {officeMissing ? (
            <p className="options-reason" role="note" data-testid="preview-office-note">
              {OFFICE_NOTE}
            </p>
          ) : null}
          {feeMissing ? (
            <p className="options-reason" role="note">
              {FEE_NOTE}
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
