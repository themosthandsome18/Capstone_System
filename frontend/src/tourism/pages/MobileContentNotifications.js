import { useEffect, useId, useMemo, useState } from "react";
import { FiBell, FiCheck, FiChevronLeft, FiClock, FiTrash2 } from "react-icons/fi";
import { tourismApi } from "../services/tourismApi";
import {
  DEFAULT_SEVERITY,
  DURATIONS,
  MESSAGE_MAX,
  SEVERITIES,
  TITLE_MAX,
  dateInDays,
  daysLeftText,
  endedOn,
  hasExpired,
  payloadOf,
  problemWith,
  sentOn,
  severityOf,
  sortAdvisories,
} from "../utils/mobileContentNotifications";

// The tab "Notifications" of the Mobile App Content page: the Tourism Office sends a notice to the visitors of the app, and takes it out again. It uses
// the endpoint that already exists (notifications/public/): GET to list, POST to send, PATCH to switch a notice off or on. Nothing is ever deleted.
// Only tourism notices are shown and written here; the admin is sent the others too and this tab leaves them out.

export const FORM_HEADING = "Magpadala ng abiso sa mga bisita";
export const NOW_HEADING = "Nasa app ngayon";
export const HIDDEN_HEADING = "Hindi na nakikita";
export const PREVIEW_TITLE = "Notifications";
export const PREVIEW_SUBTITLE = "Mga abiso mula sa Tourism Office";
export const SENT_NOTICE = "Naipadala na ang abiso sa app.";
export const REMOVED_NOTICE = "Tinanggal sa app ang abiso. Nasa “Hindi na nakikita” pa rin ito.";
export const RESTORED_NOTICE = "Naibalik sa app ang abiso.";
export const LOAD_ERROR_FALLBACK = "Hindi ma-load ang mga abiso.";
export const EMPTY_NOW = "Wala pang abisong nasa app ngayon.";
export const EMPTY_HIDDEN = "Wala pa.";
export const EXPIRED_NOTE = "Lumipas na ang petsa. Magpadala ng bagong abiso.";
export const NO_DELETE_NOTE = "Walang binubura: ang tinanggal sa app ay nananatili sa ibaba, at maaaring ibalik.";

const BLANK = { title: "", message: "", severity: DEFAULT_SEVERITY, until: "" };

export const COMPOSE_LINE = "Makikita ito ng lahat ng bisita sa app.";
export const COMPOSE_NOTE = "Isulat ang abiso, piliin ang bigat, at ipadala.";
export const HIDDEN_NOTE = "Tinanggal o lumipas na. Hindi binubura ang mga ito.";

// The head of a card: the icon in its box, the title, and under it a line of explanation (and, on the right, whatever the card puts there).
function CardHead({ tone, icon, title, note, level = 3, aside }) {
  const Title = `h${level}`;
  return (
    <header className="mobile-content-notice-head" data-tone={tone}>
      <span className="mobile-content-notice-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="mobile-content-notice-head-text">
        <Title>{title}</Title>
        {note ? <p>{note}</p> : null}
      </div>
      {aside || null}
    </header>
  );
}

function SeverityTag({ severity }) {
  const item = severityOf(severity);
  return (
    <span className="mobile-content-notice-tag" data-severity={severity}>
      {item.label}
    </span>
  );
}

// One notice as the app draws it: a white card with the stripe of its weight down the left, the title, the message and the day. No icon.
function PhoneNotice({ title, message, severity, draft, day }) {
  return (
    <div
      className={`mobile-content-notice-phone-notice ${draft ? "is-draft" : ""}`}
      data-severity={severity}
      data-testid={draft ? "preview-draft" : "preview-notice"}
    >
      <span className="mobile-content-notice-phone-stripe" aria-hidden="true" />
      <div className="mobile-content-notice-phone-text">
        <strong>{title}</strong>
        <span className="mobile-content-notice-phone-message">{message}</span>
        <span className="mobile-content-notice-phone-day">{day}</span>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="mobile-content-notice-statusbar" aria-hidden="true">
      <span>9:41</span>
      <span className="mobile-content-notice-statusbar-icons">
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M1 3.5a8 8 0 0 1 12 0M3 6a5 5 0 0 1 8 0" />
          <circle cx="7" cy="8.4" r="0.9" fill="currentColor" stroke="none" />
        </svg>
        <svg width="20" height="10" viewBox="0 0 20 10" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="0.6" y="0.6" width="16" height="8.8" rx="2.2" />
          <rect x="2.2" y="2.2" width="11" height="5.6" rx="1" fill="currentColor" stroke="none" />
          <path d="M18.4 3.4v3.2" strokeLinecap="round" />
        </svg>
      </span>
    </div>
  );
}

export default function MobileContentNotifications() {
  const uid = useId();
  const [advisories, setAdvisories] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState(BLANK);
  const [problem, setProblem] = useState("");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    tourismApi
      .getPublicAdvisories()
      .then((answer) => {
        if (!cancelled) setAdvisories(Array.isArray(answer && answer.results) ? answer.results : []);
      })
      .catch((failure) => {
        if (!cancelled) setLoadError(failure.message || LOAD_ERROR_FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  const now = new Date();
  const { inTheApp, hidden } = useMemo(() => sortAdvisories(advisories, new Date()), [advisories]);
  const loading = advisories === undefined && !loadError;

  const type = (field) => (event) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }));
    setProblem("");
  };

  function putAdvisory(advisory) {
    setAdvisories((current) => {
      const list = current || [];
      return list.some((item) => item.id === advisory.id) ? list.map((item) => (item.id === advisory.id ? advisory : item)) : [advisory, ...list];
    });
  }

  async function send(event) {
    event.preventDefault();
    const found = problemWith(draft, new Date());
    if (found) {
      setProblem(found);
      return;
    }
    setWorking(true);
    setActionError("");
    setNotice("");
    try {
      const created = await tourismApi.createPublicAdvisory(payloadOf(draft));
      putAdvisory(created);
      setDraft(BLANK);
      setProblem("");
      setNotice(SENT_NOTICE);
    } catch (failure) {
      setActionError(failure.message || "Hindi naipadala ang abiso.");
    } finally {
      setWorking(false);
    }
  }

  async function switchTo(advisory, active) {
    setWorking(true);
    setActionError("");
    setNotice("");
    try {
      const saved = await tourismApi.setPublicAdvisoryActive(advisory.id, active);
      putAdvisory(saved);
      setNotice(active ? RESTORED_NOTICE : REMOVED_NOTICE);
    } catch (failure) {
      setActionError(failure.message || "Hindi nabago ang abiso.");
    } finally {
      setWorking(false);
    }
  }

  function clearDraft() {
    setDraft(BLANK);
    setProblem("");
  }

  const drafting = draft.title.trim() !== "" || draft.message.trim() !== "";
  const choose = (duration) => setDraft((current) => ({ ...current, until: duration.days === null ? "" : dateInDays(new Date(), duration.days) }));
  const chosen = (duration) => (duration.days === null ? draft.until === "" : draft.until !== "" && draft.until === dateInDays(now, duration.days));

  return (
    <div className="mobile-content-panel mobile-content-notice-panel">
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

      <div className="mobile-content-tile-layout">
        <div className="mobile-content-notice-main">
          <form className="mobile-content-notice-card is-compose" onSubmit={send} noValidate aria-label={FORM_HEADING}>
            <CardHead tone="compose" icon={<FiBell size={19} />} title={FORM_HEADING} note={COMPOSE_NOTE} level={2} />

            <div className="mobile-content-notice-body">
              <div className="mobile-content-notice-field">
                <label htmlFor={`${uid}-title`} className="mobile-content-notice-label">
                  <span>Pamagat</span>
                  <small data-testid="title-count">
                    {draft.title.length}/{TITLE_MAX}
                  </small>
                </label>
                <input id={`${uid}-title`} aria-label="Pamagat" type="text" value={draft.title} maxLength={TITLE_MAX} onChange={type("title")} />
              </div>

              <div className="mobile-content-notice-field">
                <label htmlFor={`${uid}-message`} className="mobile-content-notice-label">
                  <span>Mensahe</span>
                  <small data-testid="message-count">
                    {draft.message.length}/{MESSAGE_MAX}
                  </small>
                </label>
                <textarea id={`${uid}-message`} aria-label="Mensahe" rows={4} value={draft.message} maxLength={MESSAGE_MAX} onChange={type("message")} />
              </div>

              <div className="mobile-content-notice-pair">
                <div className="mobile-content-notice-field" role="group" aria-label="Bigat">
                  <span className="mobile-content-notice-label">
                    <span>Bigat</span>
                  </span>
                  <div className="mobile-content-notice-severities">
                    {SEVERITIES.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        className="mobile-content-notice-severity"
                        data-severity={item.value}
                        aria-pressed={draft.severity === item.value}
                        onClick={() => setDraft((current) => ({ ...current, severity: item.value }))}
                      >
                        <span className="mobile-content-notice-bar" aria-hidden="true" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mobile-content-notice-field" role="group" aria-label="Hanggang kailan">
                  <span className="mobile-content-notice-label">
                    <span>Hanggang kailan</span>
                  </span>
                  <input type="date" aria-label="Petsa ng hangganan" value={draft.until} min={dateInDays(now, 0)} onChange={type("until")} />
                  <div className="mobile-content-notice-durations">
                    {DURATIONS.map((duration) => (
                      <button key={duration.key} type="button" className="mobile-content-notice-duration" aria-pressed={chosen(duration)} onClick={() => choose(duration)}>
                        {duration.label}
                      </button>
                    ))}
                  </div>
                  <small className="mobile-content-notice-hint">
                    {draft.until ? "Mawawala ito sa app pagkatapos ng araw na ito." : "Walang petsa: mananatili ito hanggang tanggalin ninyo."}
                  </small>
                </div>
              </div>

              {problem ? (
                <p className="settings-status error" role="alert" data-testid="draft-problem">
                  {problem}
                </p>
              ) : null}
            </div>

            <footer className="mobile-content-notice-foot">
              <span>{COMPOSE_LINE}</span>
              <div className="mobile-content-notice-actions">
                <button type="button" className="mobile-content-notice-btn" onClick={clearDraft} disabled={working || !drafting}>
                  Burahin ang nasulat
                </button>
                <button type="submit" className="mobile-content-notice-btn is-send" disabled={working}>
                  <FiCheck size={16} aria-hidden="true" />
                  {working ? "Ipinapadala..." : "Ipadala sa app"}
                </button>
              </div>
            </footer>
          </form>

          {loading ? <p className="options-empty">Loading...</p> : null}
          {loadError ? (
            <p className="settings-status error" role="alert">
              {loadError}{" "}
              <button type="button" className="reply-btn" onClick={() => setRetry((count) => count + 1)}>
                Try again
              </button>
            </p>
          ) : null}

          {advisories !== undefined ? (
            <>
              <section className="mobile-content-notice-card is-now" aria-label={NOW_HEADING}>
                <CardHead
                  tone="now"
                  icon={<FiClock size={19} />}
                  title={NOW_HEADING}
                  note={NO_DELETE_NOTE}
                  aside={<span className="mobile-content-notice-count">{inTheApp.length} nakikita</span>}
                />
                <div className="mobile-content-notice-body">
                  {inTheApp.length === 0 ? <p className="options-empty">{EMPTY_NOW}</p> : null}
                  <ul className="mobile-content-notice-rows">
                    {inTheApp.map((advisory) => (
                      <li key={advisory.id} className="mobile-content-notice-row" data-severity={advisory.severity} data-testid="now-row">
                        <span className="mobile-content-notice-stripe" aria-hidden="true" />
                        <div className="mobile-content-notice-row-body">
                          <strong>{advisory.title}</strong>
                          <p>{advisory.message}</p>
                          <div className="mobile-content-notice-meta">
                            <SeverityTag severity={advisory.severity} />
                            <span>Ipinadala noong {sentOn(advisory)}</span>
                            <span>{daysLeftText(advisory, now)}</span>
                          </div>
                        </div>
                        <button type="button" className="mobile-content-notice-btn is-small" disabled={working} onClick={() => switchTo(advisory, false)}>
                          Tanggalin sa app
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mobile-content-notice-card is-hidden" aria-label={HIDDEN_HEADING}>
                <CardHead tone="hidden" icon={<FiTrash2 size={19} />} title={HIDDEN_HEADING} note={HIDDEN_NOTE} />
                <div className="mobile-content-notice-body">
                  {hidden.length === 0 ? <p className="options-empty">{EMPTY_HIDDEN}</p> : null}
                  <ul className="mobile-content-notice-rows">
                    {hidden.map((advisory) => {
                      const expired = hasExpired(advisory, now);
                      return (
                        <li key={advisory.id} className="mobile-content-notice-row is-off" data-severity={advisory.severity} data-testid="hidden-row">
                          <span className="mobile-content-notice-stripe" aria-hidden="true" />
                          <div className="mobile-content-notice-row-body">
                            <strong>{advisory.title}</strong>
                            <p>{advisory.message}</p>
                            <div className="mobile-content-notice-meta">
                              <SeverityTag severity={advisory.severity} />
                              <span>Ipinadala noong {sentOn(advisory)}</span>
                              <span>{expired ? `Lumipas noong ${endedOn(advisory)}` : "Tinanggal sa app"}</span>
                            </div>
                          </div>
                          {expired ? (
                            <small className="mobile-content-notice-hint mobile-content-notice-expired">{EXPIRED_NOTE}</small>
                          ) : (
                            <button type="button" className="mobile-content-notice-btn is-small is-restore" disabled={working} onClick={() => switchTo(advisory, true)}>
                              Ibalik sa app
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            </>
          ) : null}
        </div>

        <aside className="mobile-content-tile-side" aria-label="What the app will show">
          <section className="mobile-content-notice-card mobile-content-notice-preview">
            <div className="mobile-content-notice-preview-head">
              <p className="mobile-content-eyebrow">Live preview</p>
              <p className="mobile-content-notice-hint">Ganito ang makikita ng bisita sa app.</p>
            </div>
            <div className="mobile-content-notice-phone" data-testid="mock-notifications">
              <div className="mobile-content-notice-screen">
                <StatusBar />
                <div className="mobile-content-notice-app-head">
                  <FiChevronLeft size={20} aria-hidden="true" />
                  <h2>{PREVIEW_TITLE}</h2>
                </div>
                <p className="mobile-content-notice-app-sub">{PREVIEW_SUBTITLE}</p>
                <div className="mobile-content-notice-phone-list">
                  {drafting ? (
                    <PhoneNotice
                      draft
                      severity={draft.severity}
                      title={draft.title.trim() || "Pamagat ng abiso"}
                      message={draft.message.trim() || "Mensahe ng abiso"}
                      day="Ngayon"
                    />
                  ) : null}
                  {inTheApp.map((advisory) => (
                    <PhoneNotice key={advisory.id} severity={advisory.severity} title={advisory.title} message={advisory.message} day={sentOn(advisory)} />
                  ))}
                  {!drafting && inTheApp.length === 0 ? <p className="mobile-content-muted">Walang abiso sa app ngayon.</p> : null}
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
