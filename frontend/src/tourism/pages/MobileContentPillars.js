import { useEffect, useState } from "react";
import { tourismApi } from "../services/tourismApi";

// The four pillars of Why Visit (Commit 5d; drawn as the design says in 5e): the tiles under the text of the Why Visit page of the mobile app. They are
// the items of the section "why_visit" of the content table, so they are read from the server (one GET, when this tab is first opened). This is a
// LIST TO READ: there is no form, no Save, no Edit, no Add, and nothing here writes. Editing them is a later update.

export const PILLARS_HEADING = "The pillars of Why Visit";
export const PILLARS_NOTICE =
  "These are the tiles the app shows under this text. They cannot be edited here yet: that is coming in an upcoming update. " +
  "Until then the app shows them as they are listed here.";
export const PILLARS_DESIGN_NOTE =
  "Ang nakikita sa apat na kahon ay buod lamang. Ang buong impormasyon ay lumalabas kapag pinindot — at ang kahong walang laman ay hindi napipindot.";
export const PILLARS_EMPTY = "There are no pillars to show.";
export const PILLARS_ERROR_FALLBACK = "The pillars could not be loaded.";
export const SWITCHED_OFF = "Switched off: the app does not show it";
export const TAG_DETAIL = "Has detail";
export const TAG_NO_DETAIL = "No detail yet";

// The picture of each icon NAME the server knows (MobileContentItem.ICON_NAMES in backend/api/models.py; a test holds this list to that one): a line
// drawing of 16 x 16 in a box of 30 x 30, in one of the four pairs of colours of the design (the line / the box). A name that is not here is drawn
// as the neutral "info". The colours are the design's own and do not follow the theme.
export const ICON_TONES = {
  blue: { stroke: "#0A6AA3", background: "#DCEDF8" },
  amber: { stroke: "#B4690E", background: "#FBEBD4" },
  green: { stroke: "#14784C", background: "#DDF0E6" },
  red: { stroke: "#C32F2F", background: "#FBE0E0" },
  neutral: { stroke: "#65564A", background: "#F2E8DB" },
};

// every drawing is a few paths in a 24 x 24 square (drawn at 16 x 16)
export const PILLAR_ICONS = {
  beach: { tone: "blue", paths: ["M17 7m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0", "M3 17c2 0 2-1.5 4.5-1.5S10 17 12 17s2.5-1.5 4.5-1.5S19 17 21 17", "M3 21c2 0 2-1.5 4.5-1.5S10 21 12 21s2.5-1.5 4.5-1.5S19 21 21 21"] },
  craft: { tone: "amber", paths: ["M7 13c0-4 2-7 5-7s5 3 5 7", "M3 14c0 2.2 4 3.5 9 3.5s9-1.3 9-3.5c0-.9-1.3-1.4-4-1.8", "M7 13c-2.7.4-4 .9-4 1.8"] },
  waterfall: { tone: "green", paths: ["M12 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z"] },
  food: { tone: "red", paths: ["M4 11h16a8 8 0 0 1-16 0z", "M9 4v3", "M12 4v3", "M15 4v3"] },
  boat: { tone: "blue", paths: ["M3 15l2 4h14l2-4H3z", "M12 3v12", "M12 4l6 9h-6"] },
  festival: { tone: "red", paths: ["M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"] },
  receipt: { tone: "amber", paths: ["M6 3h12v18l-3-2-3 2-3-2-3 2z", "M9 8h6", "M9 12h6"] },
  waste: { tone: "green", paths: ["M5 7h14", "M9 7V4h6v3", "M7 7l1 13h8l1-13"] },
  event: { tone: "amber", paths: ["M4 6h16v14H4z", "M4 10h16", "M8 3v4", "M16 3v4"] },
  eco: { tone: "green", paths: ["M5 19c0-8 5-14 15-14 0 9-5 14-13 14", "M5 19c3-4 6-6 10-8"] },
  info: { tone: "neutral", paths: ["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 11v5", "M12 8h.01"] },
};

// Has the item a full text to open? The server says so (`tappable`); when it does not say, the full text is looked at. Used by the list and by the preview.
export const hasDetail = (item) => (item.tappable === undefined ? Boolean(item.full_text) : Boolean(item.tappable));

// ONE request for the pillars, shared by the list and by the preview of the Why Visit (so the preview adds no request).
export function usePillars() {
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

  return { items, error, reload: () => setRetry((count) => count + 1) };
}

export function PillarsView({ state }) {
  const { items, error, reload } = state;
  return (
    <section className="settings-card options-card mobile-content-card" aria-label={PILLARS_HEADING}>
      <div className="report-card-title">
        <p className="mobile-content-eyebrow">Apat na kahon sa ilalim</p>
        <h2>Pillars</h2>
      </div>
      <p className="options-hint" role="note">
        {PILLARS_NOTICE}
      </p>
      {items === undefined && !error ? <p className="options-empty">Loading...</p> : null}
      {error ? (
        <p className="settings-status error" role="alert">
          {error}{" "}
          <button type="button" className="reply-btn" onClick={reload}>
            Try again
          </button>
        </p>
      ) : null}
      {items && items.length === 0 ? <p className="options-empty">{PILLARS_EMPTY}</p> : null}
      {items && items.length > 0 ? (
        <ul className="mobile-content-pillars" aria-label={PILLARS_HEADING}>
          {items.map((item) => {
            const icon = PILLAR_ICONS[item.icon] || PILLAR_ICONS.info;
            const tone = ICON_TONES[icon.tone];
            const detail = hasDetail(item);
            return (
              <li key={item.id} className="mobile-content-pillar" data-active={item.is_active ? "true" : "false"} data-detail={detail ? "yes" : "no"}>
                <span className="mobile-content-pillar-icon" data-icon={item.icon} style={{ background: tone.background }} aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tone.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {icon.paths.map((d) => (
                      <path key={d} d={d} />
                    ))}
                  </svg>
                </span>
                <div className="mobile-content-pillar-body">
                  <div className="mobile-content-pillar-top">
                    <strong data-part="title">{item.title}</strong>
                    <span className="mobile-content-tag" data-part="tag" data-detail={detail ? "yes" : "no"}>
                      {detail ? TAG_DETAIL : TAG_NO_DETAIL}
                    </span>
                  </div>
                  <span className="mobile-content-pillar-text" data-part="text">
                    {item.short_text}
                  </span>
                  {item.is_active ? null : <small className="options-hint">{SWITCHED_OFF}</small>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="mobile-content-note">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
        <p>{PILLARS_DESIGN_NOTE}</p>
      </div>
    </section>
  );
}

export default function MobileContentPillars() {
  return <PillarsView state={usePillars()} />;
}
