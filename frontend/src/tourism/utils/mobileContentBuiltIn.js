// The text the mobile app has written in its own code for the two blocks that Welcome and Why Visit edit: what a visitor reads
// today, and what the app falls back to. It is shown beside the editor ("What the app shows now") and is what the button
// "Use the app's built-in text" puts into the form.
//
// THIS IS A COPY. The one source is the Dart file mobile/lib/models/app_content_defaults.dart (the texts moved there from
// tourism_screens.dart in PR #20); from there it was taken into the seed of the content tables
// (backend/api/migrations/seed_data/mobile_content_0061.json, by backend/tools/extract_mobile_content_seed.py, checked against the
// Dart file by a backend test), and from the seed into this file. mobileContentBuiltIn.test.js reads the seed AND the Dart files and
// fails if this copy differs from either by one character.
//
// The welcome title is a TEMPLATE, as in the Dart (`welcomeTitle`): {name} is the visitor's name, which the app puts in. A visitor with
// no name is called GUEST_NAME, the word of `guestVisitorName` in mobile/lib/models/app_content.dart. The greeting for a guest is made
// from the template and the word (title.replace("{name}", GUEST_NAME)), never written out in full here.

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
