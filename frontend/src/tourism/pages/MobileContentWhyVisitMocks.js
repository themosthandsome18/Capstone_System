import { PILLAR_ICONS, hasDetail } from "./MobileContentPillars";

// The two mocks of the live preview of the Why Visit tab (Commit 5g): the tile grid as the app draws it, and the page that opens when a tile that has
// detail is pressed. Both are drawn from the data the page already holds (the pillars it read, once): which tile has an arrow, the line under the grid,
// the name and the text of the second mock all come from it, none is written here. Looks only: nothing here sends a request.

export const MOCK_TITLE = "Pagpindot sa kahon";
export const MOCK_SUBTITLE = "Buod → buong impormasyon";
export const LOADING = "Loading...";
export const LOAD_ERROR = "The boxes could not be loaded, so they cannot be drawn here.";
export const NO_BOXES = "Walang kahon na ipapakita: walang aktibong kahon.";
export const NO_DETAIL_AT_ALL =
  "Wala pang kahon na may detalye, kaya wala pang pahinang bubukas kapag may pinindot sa app. Kapag may nakasulat nang buong impormasyon ang isang kahon, makikita ito rito.";
export const NO_FULL_TEXT = "Wala pang nakasulat na buong teksto para sa kahong ito.";

// the app shows only the boxes that are switched on
export const activeBoxes = (items) => (Array.isArray(items) ? items.filter((item) => item.is_active) : []);

// the colour of a tile follows the colour of its icon (the same four as the list); a name the page does not know is neutral
export const tileTone = (item) => {
  const known = PILLAR_ICONS[item.icon];
  return known ? known.tone : "neutral";
};

// The line under the grid: which tiles have no arrow, and why. It is made from the data, so it changes when the data does.
export function footLine(boxes) {
  if (boxes.length === 0) return NO_BOXES;
  const without = boxes.filter((box) => !hasDetail(box));
  if (without.length === 0) return "Lahat ng kahon ay may arrow: may buong impormasyon ang bawat isa.";
  if (without.length === boxes.length) return "Walang arrow ang alinmang kahon: wala pang buong impormasyon ang mga ito, kaya hindi napipindot.";
  return `Walang arrow: ${without.map((box) => box.title).join(", ")} — wala pang buong impormasyon ang mga ito, kaya hindi napipindot.`;
}

function Chevron({ direction }) {
  return (
    <svg
      className={`mobile-content-chevron mobile-content-chevron-${direction}`}
      data-part="chevron"
      width={direction === "right" ? 12 : 14}
      height={direction === "right" ? 12 : 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "right" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} />
    </svg>
  );
}

// The 2 x 2 grid of the tiles.
export function TileGrid({ state }) {
  const { items, error } = state;
  if (error) return <p className="mobile-content-foot">{LOAD_ERROR}</p>;
  if (items === undefined) return <p className="mobile-content-foot">{LOADING}</p>;
  const boxes = activeBoxes(items);
  if (boxes.length === 0) return null;
  return (
    <div className="mobile-content-tiles" data-testid="mock-tiles">
      {boxes.map((box) => {
        const detail = hasDetail(box);
        return (
          <div key={box.id} className="mobile-content-tile" data-tone={tileTone(box)} data-detail={detail ? "yes" : "no"}>
            {detail ? <Chevron direction="right" /> : null}
            <strong data-part="name">{box.title}</strong>
            <span data-part="sub">{box.short_text}</span>
          </div>
        );
      })}
    </div>
  );
}

// Under the frame of the grid: the line about the arrows (nothing while the boxes are not known).
export function TileFoot({ state }) {
  if (state.error || state.items === undefined) return null;
  return (
    <p className="mobile-content-foot" data-testid="mock-foot">
      {footLine(activeBoxes(state.items))}
    </p>
  );
}

// The page that opens when the first tile that has detail is pressed. With no such tile, a message that says so.
export function DetailMock({ state }) {
  const { items, error } = state;
  if (error) return <p className="mobile-content-foot">{LOAD_ERROR}</p>;
  if (items === undefined) return <p className="mobile-content-foot">{LOADING}</p>;
  const first = activeBoxes(items).find(hasDetail);
  if (!first) {
    return (
      <div className="mobile-content-detail-body mobile-content-detail-none" data-testid="mock-detail-none">
        {NO_DETAIL_AT_ALL}
      </div>
    );
  }
  const text = typeof first.full_text === "string" ? first.full_text.trim() : "";
  return (
    <>
      <div className="mobile-content-detail-top" data-testid="mock-detail-top">
        <Chevron direction="left" />
        <span data-part="detail-name">{first.title}</span>
      </div>
      <div className={`mobile-content-detail-body${text ? "" : " mobile-content-detail-empty"}`} data-testid="mock-detail-body">
        {text || NO_FULL_TEXT}
      </div>
    </>
  );
}
