part of '../main.dart';

// The texts the app has written in its own code, word for word. They are what the app shows when the server sends nothing, or nothing it can use (see
// app_content.dart). The screens read them from here: they were MOVED here from the screens, not copied, so each text is in lib/ once. A test holds them
// EXACTLY equal to test/data/app_content_commit3.json, the value the server sends for the seed, so the code and the server cannot drift apart without a
// test saying so. The Welcome, the Why Visit, the Travel Guide and the Port & Boat Guide are all here.
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

  static const travelGuideTitle = '📖 Mauban Travel Guide & Local Tips';

  /// The tiles, then the notices (style banner), in the order the screen had them. A tile is drawn in the guide, a banner at the foot of the Home.
  static const travelGuideItems = <AppContentItem>[
    AppContentItem(
      id: -5,
      icon: 'boat',
      title: 'Cagbalete Island Boat Guide',
      shortText: 'Passenger pumpboats depart daily from Mauban Port to Sabang & Daungan. The Environmental Fee is paid at the Tourism Office, 2nd Floor, Mauban Municipal Hall. The boat fare is separate and is paid to the boat operator.',
    ),
    AppContentItem(
      id: -6,
      icon: 'festival',
      title: 'Maubanin Buntal Festival (May)',
      shortText: 'A week-long celebration showcasing giant woven Buntal hats, street dancing, and the historical legacy of Gat Uban.',
    ),
    AppContentItem(
      id: -7,
      icon: 'receipt',
      title: 'Environmental Fee',
      shortText: 'All tourists register at the Tourism Office, 2nd Floor, Mauban Municipal Hall. Receipts serve as your official entry pass to the island sanctuaries.',
    ),
    AppContentItem(
      id: -8,
      icon: 'waste',
      title: 'Solid Waste & Leave No Trace Policy',
      shortText: 'Help keep Cagbalete and Mauban pristine by avoiding single-use plastics and taking your trash back to mainland disposal points.',
    ),
    AppContentItem(
      id: -9,
      icon: 'event',
      title: 'Upcoming: Fiesta de Mauban & Buntal Festival',
      shortText: 'Celebrate the feast of San Buenaventura with colorful Buntal weaving and boat regatta.',
      style: AppContentStyle.banner,
    ),
    AppContentItem(
      id: -10,
      icon: 'eco',
      title: 'Clean Coast & Eco-Tourism Policy',
      shortText: 'Please dispose of trash responsibly and support local community bangkeros and weavers.',
      style: AppContentStyle.banner,
    ),
  ];

  static const portGuideTitle = 'Mauban Port ↔ Cagbalete Boats';

  /// The four lines of the Port & Boat Guide as the card has always shown them, each with its bullet.
  static const portGuideBullets = <String>[
    '• Standard boat departures from Mauban Port: 07:00 AM, 10:00 AM, 01:00 PM, and 04:00 PM.',
    '• Island Port Arrival: Sabang Port (during high tide) or Mappit Port (during low tide).',
    '• Environmental Fee: ₱80 per visitor. Children aged 7 and below, senior citizens aged 60 and above, and visitors with special needs pay ₱64. Pay at the Tourism Office, 2nd Floor, Mauban Municipal Hall.',
    '• Boat fare is separate. You arrange and pay it directly with the boat operator; the Tourism Office does not collect it.',
  ];

  /// The same lines without the bullet, which is how the server sends them (the screen draws the bullet).
  static final portGuideLines = <String>[for (final bullet in portGuideBullets) bullet.substring(2)];
}
