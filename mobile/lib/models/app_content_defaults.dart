part of '../main.dart';

// The texts the app has written in its own code, word for word. They are what the app shows when the server sends nothing, or nothing it can use (see
// app_content.dart). The screens read them from here: they were MOVED here from the screens, not copied, so each text is in lib/ once. A test holds them
// EXACTLY equal to test/data/app_content_commit3.json, the value the server sends for the seed, so the code and the server cannot drift apart without a
// test saying so. The Welcome and the Why Visit are here; the Travel Guide and the Port & Boat Guide are still written in their screens (9c).
abstract final class AppContentDefaults {
  /// `{name}` is the visitor's name, or the Explorer.
  static const welcomeTitle = 'Mabuhay, {name}! 🌊';
  static const welcomeSubtitle = 'Welcome to the historic jewel of Lamon Bay — home to the white sandbars of Cagbalete Island, cascading waterfalls, and world-class Buntal weaving craftsmanship.';
  static const whyVisitTitle = 'Why Visit Mauban, Quezon?';
  static const whyVisitSubtitle = 'The historic coastal sanctuary of southern Luzon';
  static const whyVisitBody = 'Nestled along the Pacific coast of Lamon Bay, Mauban boasts powdery white sandbars with expansive tidal ripples, centuries-old ancestral trees, cascading mountain pools, and a proud cultural identity shaped by Gat Uban and palm artisans.';

  /// The pillars, in the order the screen had them. The ids are negative: they are never an id of the server.
  static const whyVisitItems = <AppContentItem>[
    AppContentItem(
      id: -1,
      icon: 'beach',
      title: 'Cagbalete Island',
      shortText: 'Pristine Sandbars',
    ),
    AppContentItem(
      id: -2,
      icon: 'craft',
      title: 'Buntal Weaving',
      shortText: 'Artisan Hats & Crafts',
    ),
    AppContentItem(
      id: -3,
      icon: 'waterfall',
      title: 'Forest Cascades',
      shortText: 'Dahican & Alitap Falls',
    ),
    AppContentItem(
      id: -4,
      icon: 'food',
      title: 'Quezon Flavors',
      shortText: 'Habhab & Fresh Seafood',
    ),
  ];
}
