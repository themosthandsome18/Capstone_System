import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tileEditPath, tileNewPath } from "../mobileContentAccess";
import { tourismApi } from "../services/tourismApi";
import { ICON_TONES, PILLAR_ICONS, hasDetail } from "../utils/mobileContentIcons";
import { MAX_ITEMS_PER_SECTION } from "../utils/mobileContentTileRules";

// The four pillars of Why Visit (Commit 5d; drawn as the design says in 5e): the tiles under the text of the Why Visit page of the mobile app. They are
// the items of the section "why_visit" of the content table, so they are read from the server (one GET, when this tab is first opened). This is a
// LIST TO READ with a door to the page of each tile (6d): an "Edit" on every box and a "+ Add pillar" in the header. They are links (<a href>), so
// they can be opened in a new tab and the Back of the browser works. There is no form, no Save, and nothing here writes or asks for more.

export const PILLARS_HEADING = "The pillars of Why Visit";
export const PILLARS_NOTICE = "Ang Edit ang kinalalagyan ng buong impormasyong lumalabas kapag pinindot.";
export const ADD_LABEL = "+ Add pillar";
export const PILLARS_FULL = `This list is full: a section can hold ${MAX_ITEMS_PER_SECTION} tiles, and the ones that are deactivated are counted. Edit one of those instead of adding a new one.`;
export const PILLARS_EMPTY = "There are no pillars to show.";
export const PILLARS_ERROR_FALLBACK = "The pillars could not be loaded.";
export const DEACTIVATED_MARK = "Deactivated: the app does not show it";
export const TAG_DETAIL = "Has detail";
export const TAG_NO_DETAIL = "No detail yet";

export { ICON_TONES, PILLAR_ICONS, hasDetail };

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
  // a full section (the server's 40, the ones deactivated counted) cannot take a new tile: say so, instead of a link that would only be refused
  const full = Boolean(items) && items.length >= MAX_ITEMS_PER_SECTION;
  return (
    <section className="settings-card options-card mobile-content-card" aria-label={PILLARS_HEADING}>
      <div className="report-card-title mobile-content-pillars-head">
        <div>
          <p className="mobile-content-eyebrow">Apat na kahon sa ilalim</p>
          <h2>Pillars</h2>
        </div>
        {full ? (
          <button type="button" className="mobile-content-add" disabled aria-describedby="pillars-full">
            {ADD_LABEL}
          </button>
        ) : (
          <Link className="mobile-content-add" to={tileNewPath("why_visit")}>
            {ADD_LABEL}
          </Link>
        )}
      </div>
      {full ? (
        <p className="options-reason" id="pillars-full" role="status" data-testid="pillars-full">
          {PILLARS_FULL}
        </p>
      ) : null}
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
                  {item.is_active ? null : <small className="options-hint">{DEACTIVATED_MARK}</small>}
                </div>
                <Link className="mobile-content-pillar-edit" to={tileEditPath(item.id)} aria-label={`Edit ${item.title}`}>
                  Edit
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export default function MobileContentPillars() {
  return <PillarsView state={usePillars()} />;
}
