import { useEffect, useState } from "react";
import { tourismApi } from "../services/tourismApi";

// The four pillars of Why Visit (Commit 5d): the tiles under the text of the Why Visit page of the mobile app. They are the items of the section
// "why_visit" of the content table, so they are read from the server (one GET, when this tab is first opened). This is a LIST TO READ: there is no
// form, no Save, and nothing here writes. Editing them is a later update.

export const PILLARS_HEADING = "The pillars of Why Visit";
export const PILLARS_NOTICE =
  "These are the tiles the app shows under this text. They cannot be edited here yet: that is coming in an upcoming update. " +
  "Until then the app shows them as they are listed here.";
export const PILLARS_EMPTY = "There are no pillars to show.";
export const PILLARS_ERROR_FALLBACK = "The pillars could not be loaded.";
export const SWITCHED_OFF = "Switched off: the app does not show it";

export default function MobileContentPillars() {
  const [items, setItems] = useState(undefined); // undefined until the first answer
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    tourismApi
      .getMobileContentItems("why_visit")
      .then((answer) => {
        if (!cancelled) setItems(Array.isArray(answer) ? answer : []);
      })
      .catch((failure) => {
        if (!cancelled) setError(failure.message || PILLARS_ERROR_FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  return (
    <section className="settings-card options-card" aria-label={PILLARS_HEADING}>
      <div className="report-card-title">
        <h3>{PILLARS_HEADING}</h3>
      </div>
      <p className="options-hint" role="note">
        {PILLARS_NOTICE}
      </p>
      {items === undefined && !error ? <p className="options-empty">Loading...</p> : null}
      {error ? (
        <p className="settings-status error" role="alert">
          {error}{" "}
          <button type="button" className="reply-btn" onClick={() => setRetry((count) => count + 1)}>
            Try again
          </button>
        </p>
      ) : null}
      {items && items.length === 0 ? <p className="options-empty">{PILLARS_EMPTY}</p> : null}
      {items && items.length > 0 ? (
        <ul className="mobile-content-pillars" aria-label={PILLARS_HEADING}>
          {items.map((item) => (
            <li key={item.id} data-active={item.is_active ? "true" : "false"}>
              <strong>{item.title}</strong>
              <span>{item.short_text}</span>
              {item.is_active ? null : <small className="options-hint">{SWITCHED_OFF}</small>}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
