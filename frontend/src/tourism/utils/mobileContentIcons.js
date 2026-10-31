// The picture and the colours of each icon NAME the server knows, and the one rule of "has this tile a full text to open". They are used by the list of
// pillars, by the page of a tile and by the preview of the Why Visit. They live here, and not in the list of pillars, because the list holds links (the router),
// and the editor of the blocks, which draws the preview of the Why Visit, must not need the router to be loaded.

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
