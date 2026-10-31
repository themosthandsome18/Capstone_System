import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tileEditPath, tileNewPath } from "../mobileContentAccess";
import { tourismApi } from "../services/tourismApi";
import { ICON_TONES, PILLAR_ICONS, hasDetail } from "../utils/mobileContentIcons";
import { previewContext, previewParts, previewText } from "../utils/mobileContentPreview";
import { ITEM_PLACEHOLDERS, MAX_ITEMS_PER_SECTION } from "../utils/mobileContentTileRules";
import { Parts } from "./MobileContentFilled";

// The tab "Travel Guide & Tips" (Commit 7a): ONE list of cards, the guides and the notices together. A card is a tile (white, it can have a full text and
// then an arrow) or a banner (a coloured strip; with a full text it opens too, and has the arrow). The list reads the cards of the section once, with the blocks (for the title of the
// section and for the fee and the place where it is paid); the filter works on what was read and asks for nothing. Each card has the doors of the page of a
// tile (Edit) and the switch (Deactivate / Reactivate: one POST each). The page of a tile does the writing; this tab writes only the switch.

export const SECTION = "travel_guide";
export const ADD_CARD = "+ Add card";
export const CARDS_FULL = `This list is full: a section can hold ${MAX_ITEMS_PER_SECTION} cards, and the ones that are deactivated are counted. Edit one of those instead of adding a new one.`;
export const LIST_HINT =
  "Parehong kard ang gabay at ang paalala, pero magkaiba ang pwesto sa Home: ang gabay ay nasa gitna (hindi ito lumalabas kapag may hinahanap o piniling kategorya ang bisita), ang paalala ay nasa ibaba. Ang pinakamaliit na Order ang nauuna sa loob ng bawat grupo. Sa preview, may arrow ang gabay na may buong teksto.";
export const WHERE_MIDDLE = "Home — gitna: ang gabay";
export const WHERE_BOTTOM = "Home — ibaba: ang paalala";
export const LOCKED_LINE =
  "Ang Amount locked sa isang kard ay nangangahulugang ang halaga doon ay galing sa iisang pinagmulan — hindi ito maisusulat nang kamay, para hindi ito maiba sa kuwenta ng ulat.";
export const FILTERS = [
  ["all", "All"],
  ["active", "Active only"],
  ["inactive", "Inactive only"],
];
export const SECTION_TITLE_FALLBACK = "Mauban Travel Guide & Local Tips";
export const PREVIEW_HEADING = "How it looks in the app";
export const NO_CARDS = "There are no cards yet.";
export const NO_MATCH = "No card matches this filter.";
export const NOTHING_SHOWN = "Walang aktibong kard na maipapakita.";
export const LOAD_ERROR_FALLBACK = "The cards could not be loaded.";
export const OFF_QUESTION = (title) => `Deactivate “${title}”? The app will not show it. It stays here, and you can reactivate it.`;
export const AMOUNT_LOCKED = "Amount locked";
export const TAG_BANNER = "Banner";
export const ACTIVE_LABEL = "Active";
export const INACTIVE_LABEL = "Deactivated";

const FEE_TOKEN = /\{fee_(?:regular|discounted|office)\}/;

// Does a card hold a placeholder of the fee in any of its texts? Then the amount (or the place) in it comes from one source and is not typed.
export const isAmountLocked = (item) => FEE_TOKEN.test(`${item.title || ""}\n${item.short_text || ""}\n${item.full_text || ""}`);

export const isBanner = (item) => item.style === "banner";

// The cards, one list, in the order the server gave (its position, then its id).
export const countLabel = (number) => `${number} ${number === 1 ? "card" : "cards"}`;

export const applyFilter = (items, filter) => items.filter((item) => (filter === "active" ? item.is_active : filter === "inactive" ? !item.is_active : true));

// The texts of a card as they will be read: the placeholders filled in as the server fills them. A card whose place of payment is not written cannot be
// shown by the server at all (it leaves that card out), so the preview leaves it out too and says so.
export function readCard(item, context) {
  const title = previewParts(item.title, context, ITEM_PLACEHOLDERS);
  const line = previewParts(item.short_text, context, ITEM_PLACEHOLDERS);
  const full = previewParts(item.full_text, context, ITEM_PLACEHOLDERS);
  return { title, line, full, omitted: title.officeMissing || line.officeMissing || full.officeMissing };
}

// What the preview draws, in the order of the Home of the app: the section title and the tiles (the middle of the Home), then the banners (the bottom of
// the Home, after the destinations); only the cards that are on, and that can be filled in.
export function previewPlan(items, context) {
  const on = (Array.isArray(items) ? items : []).filter((item) => item.is_active);
  const read = on.map((item) => ({ item, ...readCard(item, context) }));
  const shown = read.filter((card) => !card.omitted);
  return {
    banners: shown.filter((card) => isBanner(card.item)),
    tiles: shown.filter((card) => !isBanner(card.item)),
    omitted: read.filter((card) => card.omitted),
  };
}

const names = (cards) => cards.map((card) => previewText(card.title.parts)).join(", ");

// The line under the preview, made from the data: which cards have no arrow and why, and which are left out.
export function previewNotes(plan) {
  const notes = [];
  const withoutArrow = plan.tiles.filter((card) => !hasDetail(card.item));
  if (plan.tiles.length && withoutArrow.length === 0) notes.push("Lahat ng tile ay may arrow: may buong impormasyon ang bawat isa.");
  else if (withoutArrow.length) notes.push(`Walang arrow: ${names(withoutArrow)} — wala pang buong impormasyon, kaya hindi napipindot.`);
  const bannersWithArrow = plan.banners.filter((card) => hasDetail(card.item));
  const bannersWithout = plan.banners.filter((card) => !hasDetail(card.item));
  if (bannersWithArrow.length) notes.push(`Ang banner (${names(bannersWithArrow)}) ay may arrow: may buong impormasyon, kaya napipindot.`);
  if (bannersWithout.length) notes.push(`Ang banner (${names(bannersWithout)}) ay walang arrow: wala pang buong impormasyon, kaya hindi napipindot.`);
  if (plan.omitted.length) {
    notes.push(`Hindi lumalabas: ${plan.omitted.map((card) => card.item.title).join(", ")} — wala pang nakasulat na lugar ng bayad (Port & Boat Guide tab).`);
  }
  return notes;
}

// ONE read of the cards and the blocks, shared by the header (the Add button), the list and the preview. It reads only once `enabled` (the tab was opened).
export function useCards(enabled) {
  const [items, setItems] = useState(undefined); // undefined until the first answer
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setError("");
    Promise.all([tourismApi.getMobileContentItems(SECTION), tourismApi.getMobileContentBlocks()])
      .then(([list, blockData]) => {
        if (cancelled) return;
        setItems(Array.isArray(list) ? list : []);
        setBlocks(blockData && typeof blockData === "object" ? blockData : null);
      })
      .catch((failure) => {
        if (!cancelled) setError(failure.message || LOAD_ERROR_FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, retry]);

  return {
    items,
    blocks,
    error,
    reload: () => setRetry((count) => count + 1),
    // the card as the server answered a switch, put in its place in the list
    replaceItem: (answer) => setItems((current) => (current || []).map((item) => (item.id === answer.id ? { ...item, ...answer } : item))),
  };
}

const isFull = (cards) => Boolean(cards.items) && cards.items.length >= MAX_ITEMS_PER_SECTION;

// The button of the page header. A full section (the server's 40, the cards that are off counted) cannot take a new card: say so instead of a link that
// would only be refused.
export function AddCardButton({ cards }) {
  if (isFull(cards)) {
    return (
      <button type="button" className="mobile-content-add" disabled aria-describedby="cards-full">
        {ADD_CARD}
      </button>
    );
  }
  return (
    <Link className="mobile-content-add" to={tileNewPath(SECTION)}>
      {ADD_CARD}
    </Link>
  );
}

function IconBox({ name, size, radius, drawing }) {
  const icon = PILLAR_ICONS[name] || PILLAR_ICONS.info;
  const tone = ICON_TONES[icon.tone];
  return (
    <span className="mobile-content-guide-icon" data-part="icon" style={{ background: tone.background, width: size, height: size, borderRadius: radius }} aria-hidden="true">
      <svg width={drawing} height={drawing} viewBox="0 0 24 24" fill="none" stroke={tone.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icon.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

function Preview({ cards, title }) {
  const { items, error, blocks } = cards;
  const context = previewContext(blocks);
  const plan = previewPlan(items, context);
  const notes = items ? previewNotes(plan) : [];
  const nothing = Boolean(items) && plan.banners.length === 0 && plan.tiles.length === 0;
  return (
    <aside className="mobile-content-tile-side" aria-label="What the app will show">
      <section className="settings-card mobile-content-card mobile-content-tile-preview">
        <div className="report-card-title">
          <p className="mobile-content-eyebrow">Preview</p>
          <h2>{PREVIEW_HEADING}</h2>
        </div>
        <div className="mobile-content-phone mobile-content-guide-frame" data-testid="guide-frame">
          {error ? <p className="mobile-content-foot">{LOAD_ERROR_FALLBACK}</p> : null}
          {!error && items === undefined ? <p className="mobile-content-foot">Loading...</p> : null}
          {plan.tiles.length ? (
            <p className="mobile-content-guide-where" data-testid="guide-where-middle">
              {WHERE_MIDDLE}
            </p>
          ) : null}
          {plan.tiles.length ? <p className="mobile-content-guide-title" data-testid="guide-section-title">{title}</p> : null}
          {plan.tiles.map((card) => {
            const tone = ICON_TONES[(PILLAR_ICONS[card.item.icon] || PILLAR_ICONS.info).tone];
            return (
              <div key={card.item.id} className="mobile-content-guide-tile" data-testid="guide-tile" data-detail={hasDetail(card.item) ? "yes" : "no"}>
                <IconBox name={card.item.icon} size={28} radius={8} drawing={16} />
                <div className="mobile-content-guide-text">
                  <strong data-part="title">
                    <Parts parts={card.title.parts} />
                  </strong>
                  <span data-part="line">
                    <Parts parts={card.line.parts} />
                  </span>
                </div>
                {hasDetail(card.item) ? (
                  <svg
                    className="mobile-content-guide-chevron"
                    data-part="chevron"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={tone.stroke}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                ) : null}
              </div>
            );
          })}
          {plan.banners.length ? (
            <p className="mobile-content-guide-where" data-where="bottom" data-testid="guide-where-bottom">
              {WHERE_BOTTOM}
            </p>
          ) : null}
          {plan.banners.map((card) => {
            const tone = ICON_TONES[(PILLAR_ICONS[card.item.icon] || PILLAR_ICONS.info).tone];
            return (
              <div
                key={card.item.id}
                className="mobile-content-guide-banner"
                data-testid="guide-banner"
                data-detail={hasDetail(card.item) ? "yes" : "no"}
                style={{ background: tone.background }}
              >
                <IconBox name={card.item.icon} size={19} radius={0} drawing={19} />
                <div className="mobile-content-guide-text">
                  <strong data-part="title">
                    <Parts parts={card.title.parts} />
                  </strong>
                  <span data-part="line">
                    <Parts parts={card.line.parts} />
                  </span>
                </div>
                {hasDetail(card.item) ? (
                  <svg
                    className="mobile-content-guide-chevron"
                    data-part="chevron"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={tone.stroke}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                ) : null}
              </div>
            );
          })}
          {nothing ? <p className="mobile-content-foot">{NOTHING_SHOWN}</p> : null}
        </div>
        {notes.length ? (
          <p className="mobile-content-foot" data-testid="guide-notes">
            {notes.join(" ")}
          </p>
        ) : null}
      </section>
    </aside>
  );
}

export function TravelGuideTab({ cards }) {
  const { items, error, blocks, reload, replaceItem } = cards;
  const [filter, setFilter] = useState("all");
  const [asking, setAsking] = useState(null); // the id of the card that a Deactivate is asked about
  const [working, setWorking] = useState(null); // the id of the card whose switch is on its way
  const [warnings, setWarnings] = useState([]);
  const [notice, setNotice] = useState("");
  const [switchError, setSwitchError] = useState("");

  const guideBlock = blocks && Array.isArray(blocks.blocks) ? blocks.blocks.find((block) => block.key === "travel_guide") : null;
  const sectionTitle = guideBlock && typeof guideBlock.title === "string" && guideBlock.title.trim() ? guideBlock.title.trim() : SECTION_TITLE_FALLBACK;
  const shown = items ? applyFilter(items, filter) : [];

  async function switchCard(item, active) {
    if (working !== null) return;
    setWorking(item.id);
    setAsking(null);
    setNotice("");
    setWarnings([]);
    setSwitchError("");
    try {
      const answer = active ? await tourismApi.reactivateMobileContentItem(item.id) : await tourismApi.deactivateMobileContentItem(item.id);
      replaceItem(answer);
      setNotice(active ? `“${item.title}” was reactivated.` : `“${item.title}” was deactivated.`);
      setWarnings(Array.isArray(answer.warnings) ? answer.warnings : []);
    } catch (failure) {
      setSwitchError(failure.message || "The card could not be deactivated or reactivated.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="mobile-content-tile-layout">
      <div className="mobile-content-cards-main">
        {isFull(cards) ? (
          <p className="options-reason" id="cards-full" role="status" data-testid="cards-full">
            {CARDS_FULL}
          </p>
        ) : null}
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
        {switchError ? (
          <p className="settings-status error" role="alert">
            {switchError}
          </p>
        ) : null}

        <div className="mobile-content-cards-bar">
          <strong className="mobile-content-cards-count" data-testid="cards-count">
            {items ? countLabel(shown.length) : "Cards"}
          </strong>
          <label className="mobile-content-cards-filter">
            <span>Show</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} disabled={!items}>
              {FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mobile-content-cards-hint">{LIST_HINT}</p>

        {items === undefined && !error ? <p className="options-empty">Loading...</p> : null}
        {error ? (
          <p className="settings-status error" role="alert">
            {error}{" "}
            <button type="button" className="reply-btn" onClick={reload}>
              Try again
            </button>
          </p>
        ) : null}
        {items && items.length === 0 ? <p className="options-empty">{NO_CARDS}</p> : null}
        {items && items.length > 0 && shown.length === 0 ? <p className="options-empty">{NO_MATCH}</p> : null}

        {shown.length ? (
          <ul className="mobile-content-cards" aria-label="Cards">
            {shown.map((item) => {
              const banner = isBanner(item);
              const detail = hasDetail(item);
              return (
                <li
                  key={item.id}
                  className="mobile-content-card mobile-content-card-row"
                  data-active={item.is_active ? "true" : "false"}
                  data-style={banner ? "banner" : "tile"}
                  data-testid="card-row"
                >
                  <div className="mobile-content-card-left">
                    <div className="mobile-content-card-top">
                      <IconBox name={item.icon} size={30} radius={8} drawing={16} />
                      <strong className="mobile-content-card-title" data-part="title">
                        {item.title}
                      </strong>
                      <span className="mobile-content-card-tag" data-kind="order" data-part="order">
                        Order {item.display_order}
                      </span>
                      {banner ? (
                        <>
                          <span
                            className="mobile-content-card-tag"
                            data-kind="banner"
                            data-part="detail"
                            title={detail ? "A banner with a full text: it opens when it is tapped" : "A banner with no full text yet"}
                          >
                            {TAG_BANNER}
                          </span>
                          {detail ? (
                            <span className="mobile-content-card-tag" data-kind="detail" data-part="banner-detail">
                              Has detail
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="mobile-content-card-tag" data-kind={detail ? "detail" : "no-detail"} data-part="detail">
                          {detail ? "Has detail" : "No detail yet"}
                        </span>
                      )}
                      {isAmountLocked(item) ? (
                        <span className="mobile-content-card-tag" data-kind="locked" data-part="locked">
                          {AMOUNT_LOCKED}
                        </span>
                      ) : null}
                    </div>
                    <p className="mobile-content-card-line" data-part="line">
                      {item.short_text}
                    </p>
                  </div>
                  <div className="mobile-content-card-right">
                    <span className="mobile-content-card-status" data-part="status" data-state={item.is_active ? "on" : "off"}>
                      <span className="mobile-content-card-dot" aria-hidden="true" />
                      {item.is_active ? ACTIVE_LABEL : INACTIVE_LABEL}
                    </span>
                    <Link className="mobile-content-pillar-edit" to={tileEditPath(item.id)} aria-label={`Edit ${item.title}`}>
                      Edit
                    </Link>
                    {asking === item.id ? (
                      <span className="mobile-content-card-ask" role="alertdialog" aria-label="Confirm deactivating">
                        <span>{OFF_QUESTION(item.title)}</span>
                        <button type="button" className="mobile-content-small-button" onClick={() => setAsking(null)} disabled={working !== null}>
                          Cancel
                        </button>
                        <button type="button" className="mobile-content-small-button" onClick={() => switchCard(item, false)} disabled={working !== null}>
                          Yes, deactivate
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="mobile-content-small-button"
                        aria-label={`${item.is_active ? "Deactivate" : "Reactivate"} ${item.title}`}
                        onClick={() => (item.is_active ? setAsking(item.id) : switchCard(item, true))}
                        disabled={working !== null}
                      >
                        {item.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        <p className="mobile-content-cards-locked">{LOCKED_LINE}</p>
      </div>
      <Preview cards={cards} title={sectionTitle} />
    </div>
  );
}
