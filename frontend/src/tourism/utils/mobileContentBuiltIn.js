// The text the mobile app has written in its own code for the two blocks that Welcome and Why Visit edit: what a visitor reads
// today, and what the app falls back to. It is shown beside the editor ("What the app shows now") and is what the button
// "Use the app's built-in text" puts into the form.
//
// THIS IS A COPY. The one source is the Dart file mobile/lib/screens/tourism_screens.dart; from there it was taken into the seed
// of the content tables (backend/api/migrations/seed_data/mobile_content_0061.json, by backend/tools/extract_mobile_content_seed.py,
// checked against the Dart file by a backend test), and from the seed into this file. mobileContentBuiltIn.test.js reads the seed
// AND the Dart file and fails if this copy differs from either by one character.
//
// {name} is the visitor's name, which the app puts in; a guest is called GUEST_NAME.

export const GUEST_NAME = "Explorer";

const BLOCKS = {
  welcome: {
    title: "Mabuhay, {name}! 🌊",
    subtitle: "Welcome to the historic jewel of Lamon Bay — home to the white sandbars of Cagbalete Island, cascading waterfalls, and world-class Buntal weaving craftsmanship.",
  },
  why_visit: {
    title: "Why Visit Mauban, Quezon?",
    subtitle: "The historic coastal sanctuary of southern Luzon",
    body: "Nestled along the Pacific coast of Lamon Bay, Mauban boasts powdery white sandbars with expansive tidal ripples, centuries-old ancestral trees, cascading mountain pools, and a proud cultural identity shaped by Gat Uban and palm artisans.",
  },
};

// Frozen: the page shows these and copies them into a form; nothing may change them in place.
export const BUILT_IN_BLOCKS = Object.freeze({
  welcome: Object.freeze(BLOCKS.welcome),
  why_visit: Object.freeze(BLOCKS.why_visit),
});
