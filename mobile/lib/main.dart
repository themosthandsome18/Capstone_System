import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:8000/api',
);

const appModule = String.fromEnvironment('APP_MODULE', defaultValue: 'tourism');
const sanitationReportDraftsKey = 'sanitation_report_drafts';

String conciseError(Object error) {
  final message = error.toString().replaceFirst('Exception: ', '');
  return message.length > 160 ? '${message.substring(0, 160)}...' : message;
}

const boatCapacityFareOptions = [
  '',
  '1-2 pax (One-Way P1500, Two-way P2000)',
  '3-4 pax (One-Way P2000, Two-way P2,500)',
  '5-6 pax (One-Way P2,500, Two-way P3,000)',
  '7-8 pax (One-Way P3,000, Two-way P3,500)',
  '9-10 pax (One-Way P3,500, Two-way P4,000)',
  '11-12 pax (One-Way P4,000, Two-way P4,500)',
  '13-14 pax (One-Way P4,500, Two-way P5,000)',
  '15-17 pax (One-Way P5,000, Two-way P5,500)',
  '18-20 pax (One-Way P5,500, Two-way P6,000)',
];

void main() {
  if (appModule == 'sanitation') {
    runApp(const SanitationStandaloneApp());
    return;
  }

  runApp(const MaubanMobileApp());
}

class MaubanMobileApp extends StatelessWidget {
  const MaubanMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mauban Tourism',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.green,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: AppColors.canvas,
        fontFamily: 'Arial',
        useMaterial3: true,
      ),
      home: const AppBootstrap(),
    );
  }
}

class AppBootstrap extends StatefulWidget {
  const AppBootstrap({super.key});

  @override
  State<AppBootstrap> createState() => _AppBootstrapState();
}

class _AppBootstrapState extends State<AppBootstrap> {
  final TourismApi _api = TourismApi();
  late Future<MobileBootstrap> _bootstrapFuture;
  bool _showIntro = true;
  bool _showLogin = false;

  @override
  void initState() {
    super.initState();
    _bootstrapFuture = _api.fetchBootstrap();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<MobileBootstrap>(
      future: _bootstrapFuture,
      builder: (context, snapshot) {
        final data = snapshot.data ?? MobileBootstrap.fallback();

        if (_showIntro) {
          return IntroFlow(
            onDone: () {
              setState(() {
                _showIntro = false;
                _showLogin = true;
              });
            },
          );
        }

        if (_showLogin) {
          return LoginPage(
            onContinue: () {
              setState(() {
                _showLogin = false;
              });
            },
          );
        }

        return MobileShell(api: _api, bootstrap: data);
      },
    );
  }
}

class MobileShell extends StatefulWidget {
  const MobileShell({super.key, required this.api, required this.bootstrap});

  final TourismApi api;
  final MobileBootstrap bootstrap;

  @override
  State<MobileShell> createState() => _MobileShellState();
}

class _MobileShellState extends State<MobileShell> {
  int _index = 0;
  final List<MobileVisitReceipt> _visitHistory = [];
  final List<MobileFeedbackReceipt> _feedbackHistory = [];
  MobileUserProfile _profile = MobileUserProfile.guest();

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomePage(
        bootstrap: widget.bootstrap,
        profile: _profile,
        onOpenTab: _openTab,
        onOpenDestination: _openDestination,
        onOpenNotifications: _openNotifications,
      ),
      DestinationListPage(
        destinations: widget.bootstrap.destinations,
        onOpenDestination: _openDestination,
      ),
      TourismMapPage(
        destinations: widget.bootstrap.destinations,
        onOpenDestination: _openDestination,
      ),
      VisitPlannerPage(
        bootstrap: widget.bootstrap,
        visits: _visitHistory,
        onRegisterVisit: () => _openRegistration(),
      ),
      ProfilePage(
        profile: _profile,
        visits: _visitHistory,
        feedbackHistory: _feedbackHistory,
      ),
    ];

    return Scaffold(
      body: SafeArea(child: pages[_index]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        height: 66,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(
            icon: Icon(Icons.place_outlined),
            label: 'Explore',
          ),
          NavigationDestination(icon: Icon(Icons.map_outlined), label: 'Map'),
          NavigationDestination(
            icon: Icon(Icons.route_outlined),
            label: 'My Visit',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  void _openTab(int index) {
    setState(() => _index = index);
  }

  void _openDestination(Destination destination) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => DestinationDetailPage(
          destination: destination,
          api: widget.api,
          bootstrap: widget.bootstrap,
          onVisitSubmitted: _addVisit,
          onFeedbackSubmitted: _addFeedback,
        ),
      ),
    );
  }

  Future<void> _openRegistration({Destination? destination}) async {
    final receipt = await Navigator.of(context).push<MobileVisitReceipt>(
      MaterialPageRoute(
        builder: (context) => TouristRegistrationPage(
          api: widget.api,
          bootstrap: widget.bootstrap,
          initialDestination: destination,
        ),
      ),
    );

    if (receipt != null) {
      _addVisit(receipt);
      setState(() => _index = 3);
    }
  }

  void _openNotifications() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) =>
            NotificationPage(notifications: widget.bootstrap.notifications),
      ),
    );
  }

  void _addVisit(MobileVisitReceipt receipt) {
    setState(() {
      _visitHistory.insert(0, receipt);
      _profile = _profile.copyWith(
        name: receipt.fullName,
        email: receipt.email,
        contactNumber: receipt.contactNumber,
      );
    });
  }

  void _addFeedback(MobileFeedbackReceipt receipt) {
    setState(() {
      _feedbackHistory.insert(0, receipt);
      _profile = _profile.copyWith(name: receipt.reviewer);
    });
  }
}

class IntroFlow extends StatefulWidget {
  const IntroFlow({super.key, required this.onDone});

  final VoidCallback onDone;

  @override
  State<IntroFlow> createState() => _IntroFlowState();
}

class _IntroFlowState extends State<IntroFlow> {
  final PageController _controller = PageController();
  int _page = 0;

  final List<IntroItem> _items = const [
    IntroItem(
      icon: Icons.location_on_outlined,
      title: 'Discover Destinations',
      text: 'Explore island resorts, landmarks, and hidden gems in Mauban.',
      color: Color(0xff28a99a),
    ),
    IntroItem(
      icon: Icons.info_outline,
      title: 'View Details',
      text:
          'Read resort descriptions, ratings, contact details, and access tips.',
      color: Color(0xff159ee0),
    ),
    IntroItem(
      icon: Icons.calendar_month_outlined,
      title: 'Plan Your Visit',
      text: 'Build your itinerary and register your travel group in advance.',
      color: AppColors.green,
    ),
    IntroItem(
      icon: Icons.hotel_outlined,
      title: 'Resorts & Stays',
      text: 'Find beaches, accommodations, and local tourism services.',
      color: Color(0xfff2664b),
    ),
    IntroItem(
      icon: Icons.map_outlined,
      title: 'Maps & Guides',
      text: 'Navigate tourist sites and see nearby places in Mauban.',
      color: Color(0xff35b8a9),
    ),
    IntroItem(
      icon: Icons.chat_bubble_outline,
      title: 'Share Feedback',
      text: 'Submit destination feedback for review by the Tourism Office.',
      color: Color(0xffffb11a),
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: _controller,
              onPageChanged: (value) => setState(() => _page = value),
              itemCount: _items.length,
              itemBuilder: (context, index) => IntroSlide(item: _items[index]),
            ),
            Positioned(
              top: 16,
              right: 18,
              child: TextButton(
                onPressed: widget.onDone,
                child: const Text('Skip'),
              ),
            ),
            Positioned(
              left: 24,
              right: 24,
              bottom: 28,
              child: Row(
                children: [
                  Expanded(
                    child: Row(
                      children: List.generate(
                        _items.length,
                        (index) => AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          margin: const EdgeInsets.only(right: 4),
                          width: _page == index ? 18 : 5,
                          height: 5,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            color: _page == index
                                ? AppColors.green
                                : AppColors.border,
                          ),
                        ),
                      ),
                    ),
                  ),
                  FilledButton(
                    onPressed: () {
                      if (_page == _items.length - 1) {
                        widget.onDone();
                        return;
                      }
                      _controller.nextPage(
                        duration: const Duration(milliseconds: 220),
                        curve: Curves.easeOut,
                      );
                    },
                    style: FilledButton.styleFrom(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Icon(Icons.arrow_forward),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class IntroSlide extends StatelessWidget {
  const IntroSlide({super.key, required this.item});

  final IntroItem item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 26),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: item.color,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(item.icon, color: Colors.white, size: 34),
          ),
          const SizedBox(height: 24),
          Text(
            item.title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          Text(
            item.text,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.muted,
              height: 1.4,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class LoginPage extends StatelessWidget {
  const LoginPage({super.key, required this.onContinue});

  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset('assets/tourism_logo.jpg', width: 80, height: 80),
              const SizedBox(height: 20),
              const Text(
                'Welcome Back',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 6),
              const Text(
                'Sign in with your existing account to continue',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.muted),
              ),
              const SizedBox(height: 30),
              LoginButton(
                icon: Icons.g_mobiledata,
                label: 'Continue with Google',
                onTap: onContinue,
              ),
              LoginButton(
                icon: Icons.facebook,
                label: 'Continue with Facebook',
                onTap: onContinue,
              ),
              LoginButton(
                icon: Icons.apple,
                label: 'Continue with Apple',
                onTap: onContinue,
              ),
              LoginButton(
                icon: Icons.person_outline,
                label: 'Continue as Guest',
                onTap: onContinue,
              ),
              const SizedBox(height: 16),
              const Text(
                'By continuing, you agree to our Terms of Service and Privacy Policy.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.muted, fontSize: 11),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LoginButton extends StatelessWidget {
  const LoginButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon),
        label: Text(label),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          alignment: Alignment.centerLeft,
          foregroundColor: AppColors.ink,
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({
    super.key,
    required this.bootstrap,
    required this.profile,
    required this.onOpenTab,
    required this.onOpenDestination,
    required this.onOpenNotifications,
  });

  final MobileBootstrap bootstrap;
  final MobileUserProfile profile;
  final ValueChanged<int> onOpenTab;
  final ValueChanged<Destination> onOpenDestination;
  final VoidCallback onOpenNotifications;

  @override
  Widget build(BuildContext context) {
    final featured = bootstrap.featuredDestinations.isNotEmpty
        ? bootstrap.featuredDestinations
        : bootstrap.destinations.take(6).toList();
    final heroDestination =
        featured.firstOrNull ?? bootstrap.destinations.firstOrNull;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        AppHeader(onOpenNotifications: onOpenNotifications),
        Text(
          profile.isGuest ? 'Welcome to' : 'Welcome back,',
          style: const TextStyle(color: AppColors.muted, fontSize: 12),
        ),
        Text(
          profile.displayName,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 10),
        DataSourceBanner(
          icon: bootstrap.isOffline
              ? Icons.cloud_off_outlined
              : Icons.cloud_done_outlined,
          title: bootstrap.isOffline
              ? 'Cannot reach Tourism Web System'
              : 'Connected to Tourism Web System',
          text: bootstrap.isOffline
              ? 'No fallback destinations are shown. Start the backend API to load the live tourism records.'
              : 'Showing the Top ${bootstrap.destinations.length} most visited resorts from Booking Management records.',
          warning: bootstrap.isOffline,
        ),
        const SizedBox(height: 12),
        SearchBox(hint: 'Search destinations, resorts...'),
        const SizedBox(height: 14),
        if (heroDestination == null)
          const EmptyState(
            icon: Icons.cloud_off_outlined,
            title: 'No destinations loaded from the web system',
          )
        else
          GestureDetector(
            onTap: () => onOpenDestination(heroDestination),
            child: HeroCard(destination: heroDestination),
          ),
        const SizedBox(height: 16),
        Row(
          children: [
            QuickAction(
              icon: Icons.explore_outlined,
              label: 'Discover',
              onTap: () => onOpenTab(1),
            ),
            QuickAction(
              icon: Icons.map_outlined,
              label: 'View Map',
              onTap: () => onOpenTab(2),
            ),
            QuickAction(
              icon: Icons.route_outlined,
              label: 'Plan Visit',
              onTap: () => onOpenTab(3),
            ),
          ],
        ),
        if (featured.isNotEmpty) ...[
          SectionHeader(
            title: 'Top 10 Most Visited',
            action: 'See all',
            onTap: () => onOpenTab(1),
          ),
          SizedBox(
            height: 168,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemBuilder: (context, index) => DestinationTile(
                destination: featured[index],
                onTap: () => onOpenDestination(featured[index]),
              ),
              separatorBuilder: (context, index) => const SizedBox(width: 12),
              itemCount: featured.length,
            ),
          ),
        ],
        if (bootstrap.destinations.isNotEmpty)
          DataSourceBanner(
            icon: Icons.bar_chart_outlined,
            title: 'Based on Tourism Records',
            text:
                'Ranked by total visitor arrivals submitted through the web system and mobile registration.',
          ),
        SectionHeader(
          title: 'Most Visited Resorts',
          action: 'Map',
          onTap: () => onOpenTab(2),
        ),
        if (bootstrap.destinations.isEmpty)
          const EmptyState(
            icon: Icons.travel_explore_outlined,
            title: 'Start the backend API to load ranked destinations',
          )
        else
          ...bootstrap.destinations.map(
            (destination) => DestinationListCard(
              destination: destination,
              onTap: () => onOpenDestination(destination),
            ),
          ),
        const InfoBanner(
          icon: Icons.event_available_outlined,
          title: 'Upcoming: Fiesta de Mauban',
          text: 'Check official schedules and advisories before your trip.',
          color: Color(0xffd7efff),
        ),
        const InfoBanner(
          icon: Icons.lightbulb_outline,
          title: 'Travel Tip',
          text:
              'Bring water, sun protection, and follow local sanitation reminders.',
          color: Color(0xfffff3bd),
        ),
      ],
    );
  }
}

class DestinationListPage extends StatefulWidget {
  const DestinationListPage({
    super.key,
    required this.destinations,
    required this.onOpenDestination,
  });

  final List<Destination> destinations;
  final ValueChanged<Destination> onOpenDestination;

  @override
  State<DestinationListPage> createState() => _DestinationListPageState();
}

class _DestinationListPageState extends State<DestinationListPage> {
  String _search = '';
  String _filter = 'All';

  @override
  Widget build(BuildContext context) {
    final types = [
      'All',
      ...widget.destinations.map((item) => item.type).toSet(),
    ];
    final filtered = widget.destinations.where((destination) {
      final keyword = _search.toLowerCase();
      final matchesSearch =
          destination.name.toLowerCase().contains(keyword) ||
          destination.location.toLowerCase().contains(keyword) ||
          destination.description.toLowerCase().contains(keyword);
      final matchesFilter = _filter == 'All' || destination.type == _filter;
      return matchesSearch && matchesFilter;
    }).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        const PageTitle(
          title: 'Destinations',
          subtitle: 'Find places to visit',
        ),
        DataSourceBanner(
          icon: widget.destinations.isEmpty
              ? Icons.cloud_off_outlined
              : Icons.cloud_done_outlined,
          title: widget.destinations.isEmpty
              ? 'Cannot reach Tourism Web System'
              : 'Top ${widget.destinations.length} most visited resorts loaded',
          text: widget.destinations.isEmpty
              ? 'The mobile app is not showing fake destination records.'
              : 'Source: Tourism Booking Management records via $apiBaseUrl',
          warning: widget.destinations.isEmpty,
        ),
        const SizedBox(height: 12),
        SearchBox(
          hint: 'Search destinations, resorts...',
          onChanged: (value) => setState(() => _search = value),
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: types
                .map(
                  (type) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(type),
                      selected: _filter == type,
                      onSelected: (_) => setState(() => _filter = type),
                    ),
                  ),
                )
                .toList(),
          ),
        ),
        const SizedBox(height: 14),
        if (filtered.isEmpty)
          const EmptyState(
            icon: Icons.search_off_outlined,
            title: 'No destinations found',
          )
        else
          ...filtered.map(
            (destination) => DestinationListCard(
              destination: destination,
              onTap: () => widget.onOpenDestination(destination),
            ),
          ),
      ],
    );
  }
}

class TourismMapPage extends StatelessWidget {
  const TourismMapPage({
    super.key,
    required this.destinations,
    required this.onOpenDestination,
  });

  final List<Destination> destinations;
  final ValueChanged<Destination> onOpenDestination;

  @override
  Widget build(BuildContext context) {
    final mappedDestinations = destinations
        .where((item) => item.hasCoordinates)
        .toList();
    final highlighted = mappedDestinations.take(80).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        const PageTitle(
          title: 'Maps & Guides',
          subtitle: 'Interactive tourism map of Mauban',
        ),
        DataSourceBanner(
          icon: Icons.map_outlined,
          title: '${mappedDestinations.length} mapped records',
          text: highlighted.length == mappedDestinations.length
              ? 'Tap a pin to open destination details.'
              : 'Showing the first ${highlighted.length} pins to keep the map readable. Use Explore for the full list.',
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 390,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: FlutterMap(
              options: MapOptions(
                initialCenter: const LatLng(14.185, 121.731),
                initialZoom: 10.5,
                minZoom: 8,
                maxZoom: 18,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                ),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'mauban_mobile_app',
                ),
                MarkerLayer(
                  markers: highlighted
                      .map(
                        (destination) => Marker(
                          point: LatLng(
                            destination.latitude,
                            destination.longitude,
                          ),
                          width: 46,
                          height: 46,
                          child: GestureDetector(
                            onTap: () => onOpenDestination(destination),
                            child: const MapPin(),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ),
        SectionHeader(title: 'Nearby Places'),
        ...destinations
            .take(12)
            .map(
              (destination) => DestinationListCard(
                destination: destination,
                onTap: () => onOpenDestination(destination),
              ),
            ),
      ],
    );
  }
}

class VisitPlannerPage extends StatelessWidget {
  const VisitPlannerPage({
    super.key,
    required this.bootstrap,
    required this.visits,
    required this.onRegisterVisit,
  });

  final MobileBootstrap bootstrap;
  final List<MobileVisitReceipt> visits;
  final VoidCallback onRegisterVisit;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        const PageTitle(
          title: 'My Visit',
          subtitle: 'Plan and register your trip',
        ),
        TripSummaryCard(
          destination:
              visits.firstOrNull?.destination ??
              bootstrap.destinations.firstOrNull,
        ),
        const SizedBox(height: 14),
        FilledButton.icon(
          onPressed: onRegisterVisit,
          icon: const Icon(Icons.send_outlined),
          label: const Text('Register another visit'),
        ),
        if (visits.isNotEmpty) ...[
          SectionHeader(title: 'Submitted Visits'),
          ...visits.map((visit) => VisitReceiptCard(receipt: visit)),
        ],
        SectionHeader(title: 'Plan Your Stay'),
        PlanVisitForm(destinations: bootstrap.destinations),
      ],
    );
  }
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({
    super.key,
    required this.profile,
    required this.visits,
    required this.feedbackHistory,
  });

  final MobileUserProfile profile;
  final List<MobileVisitReceipt> visits;
  final List<MobileFeedbackReceipt> feedbackHistory;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        const PageTitle(title: 'Profile', subtitle: 'Tourist guide services'),
        const SizedBox(height: 8),
        CircleAvatar(
          radius: 42,
          backgroundColor: const Color(0xffd8f5e4),
          child: Text(
            profile.initials,
            style: const TextStyle(
              color: AppColors.green,
              fontWeight: FontWeight.w900,
              fontSize: 24,
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          profile.displayName,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
        ),
        const Text(
          'Tourist - Guide Explorer',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.muted),
        ),
        const SizedBox(height: 20),
        ProfileTile(
          icon: Icons.email_outlined,
          label: 'Email',
          value: profile.email.isEmpty ? 'Not provided yet' : profile.email,
        ),
        ProfileTile(
          icon: Icons.phone_outlined,
          label: 'Contact',
          value: profile.contactNumber.isEmpty
              ? 'Not provided yet'
              : profile.contactNumber,
        ),
        ProfileLink(
          icon: Icons.route_outlined,
          label: 'Visit History (${visits.length})',
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) => VisitHistoryPage(visits: visits),
            ),
          ),
        ),
        ProfileLink(
          icon: Icons.feedback_outlined,
          label: 'My Feedback (${feedbackHistory.length})',
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) =>
                  FeedbackHistoryPage(feedbackHistory: feedbackHistory),
            ),
          ),
        ),
        const SizedBox(height: 18),
        OutlinedButton.icon(
          onPressed: () {},
          icon: const Icon(Icons.logout),
          label: const Text('Sign Out'),
          style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
        ),
      ],
    );
  }
}

class DestinationDetailPage extends StatelessWidget {
  const DestinationDetailPage({
    super.key,
    required this.destination,
    required this.api,
    required this.bootstrap,
    required this.onVisitSubmitted,
    required this.onFeedbackSubmitted,
  });

  final Destination destination;
  final TourismApi api;
  final MobileBootstrap bootstrap;
  final ValueChanged<MobileVisitReceipt> onVisitSubmitted;
  final ValueChanged<MobileFeedbackReceipt> onFeedbackSubmitted;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 320,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              title: Text(destination.name),
              background: DestinationImage(destination: destination),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      RatingPill(rating: destination.rating),
                      StatusPill(text: destination.type),
                      PermitPill(verified: destination.hasMayorPermit),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    destination.location,
                    style: const TextStyle(color: AppColors.muted),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    destination.description,
                    style: const TextStyle(height: 1.45),
                  ),
                  SectionHeader(title: 'Tourism Record'),
                  DestinationFactsPanel(destination: destination),
                  SectionHeader(title: 'Amenities'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: const [
                      AmenityChip(icon: Icons.water, label: 'Beachfront huts'),
                      AmenityChip(
                        icon: Icons.directions_boat,
                        label: 'Boat tours',
                      ),
                      AmenityChip(icon: Icons.restaurant, label: 'Food stalls'),
                      AmenityChip(icon: Icons.shower, label: 'Comfort rooms'),
                    ],
                  ),
                  SectionHeader(title: 'Location'),
                  LocationCard(destination: destination),
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: () async {
                      final receipt = await Navigator.of(context)
                          .push<MobileVisitReceipt>(
                            MaterialPageRoute(
                              builder: (context) => TouristRegistrationPage(
                                api: api,
                                bootstrap: bootstrap,
                                initialDestination: destination,
                              ),
                            ),
                          );
                      if (receipt != null) onVisitSubmitted(receipt);
                    },
                    icon: const Icon(Icons.send_outlined),
                    label: const Text('Register Visit'),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final receipt = await Navigator.of(context)
                          .push<MobileFeedbackReceipt>(
                            MaterialPageRoute(
                              builder: (context) => FeedbackPage(
                                api: api,
                                destination: destination,
                              ),
                            ),
                          );
                      if (receipt != null) onFeedbackSubmitted(receipt);
                    },
                    icon: const Icon(Icons.star_border),
                    label: const Text('Share Feedback'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class FeedbackPage extends StatefulWidget {
  const FeedbackPage({super.key, required this.api, required this.destination});

  final TourismApi api;
  final Destination destination;

  @override
  State<FeedbackPage> createState() => _FeedbackPageState();
}

class _FeedbackPageState extends State<FeedbackPage> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _comment = TextEditingController();
  final TextEditingController _sanitation = TextEditingController();
  int _rating = 5;
  int _cleanliness = 5;
  bool _submitting = false;

  @override
  void dispose() {
    _name.dispose();
    _comment.dispose();
    _sanitation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Share Feedback',
      subtitle: widget.destination.name,
      children: [
        AppTextField(controller: _name, label: 'Your name'),
        RatingSelector(
          label: 'Destination rating',
          value: _rating,
          onChanged: (value) => setState(() => _rating = value),
        ),
        RatingSelector(
          label: 'Cleanliness rating',
          value: _cleanliness,
          onChanged: (value) => setState(() => _cleanliness = value),
        ),
        AppTextField(
          controller: _comment,
          label: 'What did you like?',
          maxLines: 4,
        ),
        AppTextField(
          controller: _sanitation,
          label: 'Sanitation condition notes',
          maxLines: 3,
        ),
        SubmitButton(
          label: 'Submit Feedback',
          loading: _submitting,
          onPressed: _submit,
        ),
      ],
    );
  }

  Future<void> _submit() async {
    if (_comment.text.trim().isEmpty) {
      showAppMessage(context, 'Feedback comment is required.');
      return;
    }

    setState(() => _submitting = true);

    try {
      final response = await widget.api.submitFeedback(
        destinationId: widget.destination.id,
        reviewer: _name.text.trim().isEmpty
            ? 'Mobile Tourist'
            : _name.text.trim(),
        rating: _rating,
        message: _comment.text.trim(),
        cleanlinessRating: _cleanliness,
        sanitationComment: _sanitation.text.trim(),
      );

      if (mounted) {
        final receipt = MobileFeedbackReceipt.fromResponse(
          response,
          destination: widget.destination,
          reviewer: _name.text.trim().isEmpty
              ? 'Mobile Tourist'
              : _name.text.trim(),
          rating: _rating,
        );
        await showSubmissionDialog(
          context,
          title: 'Feedback sent',
          referenceLabel: 'Feedback ID',
          referenceValue: receipt.reference,
          message:
              'Your feedback was saved to the Tourism Web System for review by the tourism office.',
          details: [
            'Destination: ${receipt.destination.name}',
            'Rating: ${receipt.rating}/5',
            'Reviewer: ${receipt.reviewer}',
          ],
        );
        if (mounted) Navigator.of(context).pop(receipt);
      }
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class FormSectionTitle extends StatelessWidget {
  const FormSectionTitle(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 8),
      child: Text(
        title,
        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
      ),
    );
  }
}

class TouristRegistrationPage extends StatefulWidget {
  const TouristRegistrationPage({
    super.key,
    required this.api,
    required this.bootstrap,
    this.initialDestination,
  });

  final TourismApi api;
  final MobileBootstrap bootstrap;
  final Destination? initialDestination;

  @override
  State<TouristRegistrationPage> createState() =>
      _TouristRegistrationPageState();
}

class _TouristRegistrationPageState extends State<TouristRegistrationPage> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _contact = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _countryOfOrigin = TextEditingController(
    text: 'Philippines',
  );
  final TextEditingController _parkingSpace = TextEditingController();
  DateTime _arrivalDate = DateTime.now();
  late Destination _destination;
  late RefItem _country;
  late RefItem _region;
  late RefItem _province;
  late RefItem _itinerary;
  late RefItem _travelMode;
  late RefItem _boatType;
  late RefItem _purpose;
  String _boatCapacityFare = '';
  int _visitors = 1;
  int _male = 0;
  int _female = 1;
  int _maubanin = 0;
  int _filipino = 1;
  int _foreign = 0;
  int _specialGroup = 0;
  int _age0To7 = 0;
  int _age8To59 = 1;
  int _age60Above = 0;
  bool _consentConfirmed = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _destination =
        widget.initialDestination ??
        widget.bootstrap.destinations.firstOrNull ??
        Destination.placeholder();
    _country =
        widget.bootstrap.countries.firstOrNull ??
        const RefItem(id: 1, name: 'Philippines');
    _region = _preferredRefItem(
      widget.bootstrap.regions,
      nameContains: 'CALABARZON',
      fallback: const RefItem(id: 4, name: 'CALABARZON Region'),
    );
    _province = _preferredProvinceForRegion(_region, nameContains: 'Quezon');
    _itinerary =
        widget.bootstrap.itineraries.firstOrNull ??
        const RefItem(id: 1, name: 'Day Tour');
    _travelMode =
        widget.bootstrap.travelModes.firstOrNull ??
        const RefItem(id: 1, name: 'Private Vehicle');
    _boatType =
        widget.bootstrap.boatTypes.firstOrNull ??
        const RefItem(id: 1, name: 'Public Boat');
    _purpose =
        widget.bootstrap.visitPurposes.firstOrNull ??
        const RefItem(id: 1, name: 'Leisure');
  }

  @override
  void dispose() {
    _name.dispose();
    _contact.dispose();
    _email.dispose();
    _countryOfOrigin.dispose();
    _parkingSpace.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Tourist Registration',
      subtitle: 'Help us welcome you',
      children: [
        const FormSectionTitle('Contact Info'),
        AppTextField(controller: _name, label: 'Full name'),
        AppTextField(controller: _contact, label: 'Contact number'),
        AppTextField(controller: _email, label: 'Email address'),
        CheckboxListTile(
          value: _consentConfirmed,
          onChanged: (value) {
            setState(() => _consentConfirmed = value ?? false);
          },
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text(
            'I consent to submit this visitor record to Mauban LGU Tourism.',
          ),
        ),
        const FormSectionTitle('Origin'),
        DropdownTile<RefItem>(
          label: 'Country',
          value: _country,
          items: widget.bootstrap.countries,
          itemLabel: (item) => item.name,
          onChanged: (item) {
            setState(() {
              _country = item;
              if (item.name.toLowerCase().contains('philippines')) {
                _countryOfOrigin.text = 'Philippines';
              }
            });
          },
        ),
        DropdownTile<RefItem>(
          label: 'Region',
          value: _region,
          items: widget.bootstrap.regions,
          itemLabel: (item) => item.name,
          onChanged: (item) {
            setState(() {
              _region = item;
              _province = _preferredProvinceForRegion(item);
            });
          },
        ),
        DropdownTile<RefItem>(
          label: 'Province',
          value: _province,
          items: _provincesForRegion(_region),
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _province = item),
        ),
        AppTextField(controller: _countryOfOrigin, label: 'Country of origin'),
        const FormSectionTitle('Trip Details'),
        PickerTile(
          icon: Icons.calendar_month_outlined,
          label: 'Arrival date',
          value: shortDate(_arrivalDate),
          onTap: _pickDate,
        ),
        DropdownTile<Destination>(
          label: 'Destination / Resort',
          value: _destination,
          items: widget.bootstrap.destinations,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _destination = item),
        ),
        DropdownTile<RefItem>(
          label: 'Itinerary',
          value: _itinerary,
          items: widget.bootstrap.itineraries,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _itinerary = item),
        ),
        CounterPanel(
          title: 'Your Group',
          counters: [
            CounterItem('Visitors', _visitors, (value) {
              setState(() => _setVisitors(value));
            }),
            CounterItem('Male', _male, (value) {
              setState(() {
                _male = clampInt(value, 0, _visitors);
                _female = _visitors - _male;
              });
            }),
            CounterItem('Female', _female, (value) {
              setState(() {
                _female = clampInt(value, 0, _visitors);
                _male = _visitors - _female;
              });
            }),
            CounterItem('Maubanin', _maubanin, (value) {
              setState(() {
                _maubanin = clampInt(value, 0, _visitors);
                _syncClassification();
              });
            }),
            CounterItem('Foreign', _foreign, (value) {
              setState(() {
                _foreign = clampInt(value, 0, _visitors);
                _syncClassification();
              });
            }),
          ],
        ),
        CounterPanel(
          title: 'Age and Special Groups',
          counters: [
            CounterItem('Senior/PWD/7 below', _specialGroup, (value) {
              setState(() {
                _specialGroup = clampInt(value, 0, _visitors);
              });
            }),
            CounterItem('Age 0-7', _age0To7, (value) {
              setState(() {
                _age0To7 = clampInt(value, 0, _visitors);
                _syncAgeGroups();
              });
            }),
            CounterItem('Age 8-59', _age8To59, (value) {
              setState(() => _setAge8To59(value));
            }),
            CounterItem('Age 60+', _age60Above, (value) {
              setState(() {
                _age60Above = clampInt(value, 0, _visitors);
                _syncAgeGroups();
              });
            }),
          ],
        ),
        DropdownTile<RefItem>(
          label: 'Vehicle classification',
          value: _travelMode,
          items: widget.bootstrap.travelModes,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _travelMode = item),
        ),
        DropdownTile<RefItem>(
          label: 'Boat classification',
          value: _boatType,
          items: widget.bootstrap.boatTypes,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _boatType = item),
        ),
        DropdownTile<String>(
          label: 'Boat capacity and fare',
          value: _boatCapacityFare,
          items: boatCapacityFareOptions,
          itemLabel: boatCapacityFareLabel,
          onChanged: (item) => setState(() => _boatCapacityFare = item),
        ),
        AppTextField(controller: _parkingSpace, label: 'Parking space'),
        DropdownTile<RefItem>(
          label: 'Purpose of travel',
          value: _purpose,
          items: widget.bootstrap.visitPurposes,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _purpose = item),
        ),
        SubmitButton(
          label: 'Submit Registration',
          loading: _submitting,
          onPressed: _submit,
        ),
      ],
    );
  }

  RefItem _preferredRefItem(
    List<RefItem> items, {
    String? nameContains,
    required RefItem fallback,
  }) {
    if (items.isEmpty) return fallback;
    if (nameContains == null) return items.first;

    final needle = nameContains.toLowerCase();
    for (final item in items) {
      if (item.name.toLowerCase().contains(needle)) return item;
    }

    return items.first;
  }

  List<RefItem> _provincesForRegion(RefItem region) {
    final provinces = widget.bootstrap.provinces
        .where((province) => province.regionId == region.id)
        .toList();

    return provinces.isEmpty ? widget.bootstrap.provinces : provinces;
  }

  RefItem _preferredProvinceForRegion(RefItem region, {String? nameContains}) {
    final provinces = _provincesForRegion(region);
    return _preferredRefItem(
      provinces,
      nameContains: nameContains,
      fallback: const RefItem(id: 1, name: 'Quezon', regionId: 4),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _arrivalDate,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );

    if (picked != null) {
      setState(() => _arrivalDate = picked);
    }
  }

  Future<void> _submit() async {
    final validationMessage = _validateRegistration();
    if (validationMessage != null) {
      showAppMessage(context, validationMessage);
      return;
    }

    setState(() => _submitting = true);

    try {
      final response = await widget.api.registerVisit(
        fullName: _name.text.trim(),
        contactNumber: _contact.text.trim(),
        email: _email.text.trim(),
        consentConfirmed: _consentConfirmed,
        arrivalDate: isoDate(_arrivalDate),
        countryId: _country.id,
        regionId: _region.id,
        provinceId: _province.id,
        countryOfOrigin: _countryOfOrigin.text.trim(),
        resortId: _destination.id,
        itineraryId: _itinerary.id,
        travelModeId: _travelMode.id,
        boatTypeId: _boatType.id,
        boatCapacityFare: _boatCapacityFare.trim(),
        parkingSpace: _parkingSpace.text.trim(),
        visitPurposeId: _purpose.id,
        totalVisitors: _visitors,
        totalMale: _male,
        totalFemale: _female,
        filipinoCount: _filipino,
        maubaninCount: _maubanin,
        foreignerCount: _foreign,
        specialGroupCount: _specialGroup,
        age0To7: _age0To7,
        age8To59: _age8To59,
        age60Above: _age60Above,
      );

      if (mounted) {
        final receipt = MobileVisitReceipt.fromResponse(
          response,
          destination: _destination,
          arrivalDate: _arrivalDate,
          totalVisitors: _visitors,
        );
        await showSubmissionDialog(
          context,
          title: 'Visit registered',
          referenceLabel: 'Survey ID',
          referenceValue: receipt.reference,
          message:
              'This record was saved to the Tourism Web System and can be checked in Booking Management.',
          details: [
            'Destination: ${receipt.destination.name}',
            'Visitors: ${receipt.totalVisitors}',
            'Arrival date: ${shortDate(receipt.arrivalDate)}',
            'Status: ${receipt.displayStatus}',
          ],
        );
        if (mounted) Navigator.of(context).pop(receipt);
      }
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String? _validateRegistration() {
    final name = _name.text.trim();
    final contact = _contact.text.trim();
    final email = _email.text.trim();
    final countryOfOrigin = _countryOfOrigin.text.trim();

    if (name.isEmpty) return 'Full name is required.';
    if (contact.isEmpty) return 'Contact number is required.';
    if (email.isNotEmpty && !email.contains('@')) {
      return 'Enter a valid email address or leave email blank.';
    }
    if (!_consentConfirmed) {
      return 'Consent is required before submitting.';
    }
    if (_destination.id == 0 || widget.bootstrap.destinations.isEmpty) {
      return 'No destination is loaded from the Tourism Web System yet.';
    }
    if (countryOfOrigin.isEmpty) return 'Country of origin is required.';
    if (_visitors < 1) return 'At least one visitor is required.';
    if (_male + _female != _visitors) {
      return 'Male and female counts must equal total visitors.';
    }
    if (_filipino + _maubanin + _foreign != _visitors) {
      return 'Filipino, Maubanin, and foreigner counts must equal total visitors.';
    }
    if (_age0To7 + _age8To59 + _age60Above != _visitors) {
      return 'Age group counts must equal total visitors.';
    }
    if (_specialGroup > _visitors) {
      return 'Special group count cannot exceed total visitors.';
    }

    return null;
  }

  void _setVisitors(int value) {
    _visitors = clampInt(value, 1, 99);
    _male = clampInt(_male, 0, _visitors);
    _female = _visitors - _male;
    _maubanin = clampInt(_maubanin, 0, _visitors);
    _foreign = clampInt(_foreign, 0, _visitors - _maubanin);
    _syncClassification();
    _specialGroup = clampInt(_specialGroup, 0, _visitors);
    _syncAgeGroups();
  }

  void _syncClassification() {
    if (_maubanin + _foreign > _visitors) {
      _foreign = clampInt(_visitors - _maubanin, 0, _visitors);
    }
    _filipino = clampInt(_visitors - _maubanin - _foreign, 0, _visitors);
  }

  void _syncAgeGroups() {
    if (_age0To7 + _age60Above > _visitors) {
      _age60Above = clampInt(_visitors - _age0To7, 0, _visitors);
    }
    _age8To59 = clampInt(_visitors - _age0To7 - _age60Above, 0, _visitors);
  }

  void _setAge8To59(int value) {
    _age8To59 = clampInt(value, 0, _visitors);
    if (_age0To7 + _age8To59 > _visitors) {
      _age0To7 = clampInt(_visitors - _age8To59, 0, _visitors);
    }
    _age60Above = clampInt(_visitors - _age0To7 - _age8To59, 0, _visitors);
  }
}

class HouseholdSurveyPage extends StatefulWidget {
  const HouseholdSurveyPage({
    super.key,
    required this.api,
    required this.barangays,
  });

  final TourismApi api;
  final List<BarangayItem> barangays;

  @override
  State<HouseholdSurveyPage> createState() => _HouseholdSurveyPageState();
}

class _HouseholdSurveyPageState extends State<HouseholdSurveyPage> {
  final TextEditingController _head = TextEditingController();
  final TextEditingController _address = TextEditingController();
  final TextEditingController _waterSource = TextEditingController();
  final TextEditingController _remarks = TextEditingController();
  final TextEditingController _latitude = TextEditingController();
  final TextEditingController _longitude = TextEditingController();
  late String _barangay;
  String _toiletType = 'water_sealed';
  String _waterLevel = 'level_3';
  String _wasteDisposal = 'collected';
  int _male = 1;
  int _female = 1;
  bool _submitting = false;
  bool _locating = false;
  bool _locationConfirmed = false;
  bool _consentConfirmed = false;

  @override
  void initState() {
    super.initState();
    _barangay = widget.barangays.firstOrNull?.name ?? 'Poblacion';
  }

  @override
  void dispose() {
    _head.dispose();
    _address.dispose();
    _waterSource.dispose();
    _remarks.dispose();
    _latitude.dispose();
    _longitude.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Household Survey',
      subtitle: 'Submit household sanitation profile',
      children: [
        AppTextField(controller: _head, label: 'Household head'),
        DropdownTile<String>(
          label: 'Barangay',
          value: _barangay,
          items: widget.barangays.map((item) => item.name).toList(),
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _barangay = item),
        ),
        AppTextField(controller: _address, label: 'Address'),
        CounterPanel(
          title: 'Household Members',
          counters: [
            CounterItem('Male', _male, (value) {
              setState(() => _male = clampInt(value, 0, 99));
            }),
            CounterItem('Female', _female, (value) {
              setState(() => _female = clampInt(value, 0, 99));
            }),
          ],
        ),
        DataSourceBanner(
          icon: Icons.groups_outlined,
          title: '${_male + _female} household member(s)',
          text:
              'Household survey records are saved separately from establishment inspections.',
        ),
        const SizedBox(height: 12),
        DropdownTile<String>(
          label: 'Toilet facility',
          value: _toiletType,
          items: const ['water_sealed', 'pour_flush', 'pit_latrine', 'none'],
          itemLabel: householdToiletLabel,
          onChanged: (item) => setState(() => _toiletType = item),
        ),
        DropdownTile<String>(
          label: 'Water access level',
          value: _waterLevel,
          items: const ['level_1', 'level_2', 'level_3'],
          itemLabel: householdWaterLabel,
          onChanged: (item) => setState(() => _waterLevel = item),
        ),
        AppTextField(controller: _waterSource, label: 'Water source'),
        DropdownTile<String>(
          label: 'Waste disposal',
          value: _wasteDisposal,
          items: const ['collected', 'composted', 'burned', 'dumped'],
          itemLabel: householdWasteLabel,
          onChanged: (item) => setState(() => _wasteDisposal = item),
        ),
        AppTextField(controller: _remarks, label: 'Remarks', maxLines: 3),
        LocationCapturePanel(
          latitude: _latitude.text,
          longitude: _longitude.text,
          locating: _locating,
          onCapture: _captureLocation,
          title: 'Household Location',
          emptyText: 'No household location captured yet',
        ),
        Row(
          children: [
            Expanded(
              child: AppTextField(
                controller: _latitude,
                label: 'Latitude',
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() => _locationConfirmed = false),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: AppTextField(
                controller: _longitude,
                label: 'Longitude',
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() => _locationConfirmed = false),
              ),
            ),
          ],
        ),
        LocationConfirmationPanel(
          latitude: _latitude.text,
          longitude: _longitude.text,
          confirmed: _locationConfirmed,
          onChanged: _setLocation,
          onConfirm: () => setState(() => _locationConfirmed = true),
        ),
        ConsentCheckPanel(
          checked: _consentConfirmed,
          onChanged: (value) => setState(() => _consentConfirmed = value),
        ),
        SubmitButton(
          label: 'Submit Household Survey',
          loading: _submitting,
          onPressed: _submit,
        ),
      ],
    );
  }

  Future<void> _submit() async {
    if (_head.text.trim().isEmpty) {
      showAppMessage(context, 'Household head is required.');
      return;
    }
    if (_barangay.trim().isEmpty) {
      showAppMessage(context, 'Barangay is required.');
      return;
    }
    if (_male + _female <= 0) {
      showAppMessage(context, 'Household member count is required.');
      return;
    }
    if (latLngFromText(_latitude.text, _longitude.text) == null) {
      showAppMessage(context, 'Capture or tap the household map location.');
      return;
    }
    if (!_locationConfirmed) {
      showAppMessage(
        context,
        'Confirm the household GIS pin before submitting.',
      );
      return;
    }
    if (!_consentConfirmed) {
      showAppMessage(context, 'Privacy consent is required before submitting.');
      return;
    }

    setState(() => _submitting = true);

    try {
      final response = await widget.api.submitHouseholdSurvey(
        householdHead: _head.text.trim(),
        barangay: _barangay,
        address: _address.text.trim(),
        maleCount: _male,
        femaleCount: _female,
        toiletType: _toiletType,
        waterLevel: _waterLevel,
        waterSource: _waterSource.text.trim(),
        wasteDisposal: _wasteDisposal,
        remarks: _remarks.text.trim(),
        latitude: _latitude.text.trim(),
        longitude: _longitude.text.trim(),
      );

      if (mounted) {
        await showSubmissionDialog(
          context,
          title: 'Survey submitted',
          referenceLabel: 'Household Code',
          referenceValue: '${response['household_code'] ?? 'Saved'}',
          message: 'Saved to Sanitation Web System.',
          details: [
            'Barangay: $_barangay',
            'Total members: ${_male + _female}',
            'Status: ${householdStatusLabel('${response['status'] ?? ''}')}',
          ],
        );
        if (mounted) Navigator.of(context).pop(true);
      }
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _captureLocation() async {
    setState(() => _locating = true);

    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        throw Exception('Please turn on location services first.');
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception('Location permission is required.');
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      setState(() {
        _latitude.text = position.latitude.toStringAsFixed(6);
        _longitude.text = position.longitude.toStringAsFixed(6);
        _locationConfirmed = false;
      });
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _setLocation(LatLng point) {
    setState(() {
      _latitude.text = point.latitude.toStringAsFixed(6);
      _longitude.text = point.longitude.toStringAsFixed(6);
      _locationConfirmed = false;
    });
  }
}

class SanitationReportPage extends StatefulWidget {
  const SanitationReportPage({
    super.key,
    required this.api,
    required this.barangays,
    this.initialDraft,
  });

  final TourismApi api;
  final List<BarangayItem> barangays;
  final SanitationReportDraft? initialDraft;

  @override
  State<SanitationReportPage> createState() => _SanitationReportPageState();
}

const sanitationReportCategories = [
  'Public restroom',
  'Public market',
  'Household surroundings',
  'Water source',
  'Garbage/Waste',
  'Pest/Rodents',
  'Other sanitation concern',
];

const sanitationReportPriorities = ['low', 'medium', 'high'];

class _SanitationReportPageState extends State<SanitationReportPage> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _contact = TextEditingController();
  final TextEditingController _description = TextEditingController();
  final TextEditingController _latitude = TextEditingController();
  final TextEditingController _longitude = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();
  XFile? _photo;
  String _category = sanitationReportCategories.first;
  String _priority = 'medium';
  late String _barangay;
  bool _submitting = false;
  bool _locating = false;
  bool _locationConfirmed = false;
  bool _consentConfirmed = false;
  bool _anonymous = false;

  @override
  void initState() {
    super.initState();
    final draft = widget.initialDraft;
    _barangay =
        draft?.barangay ?? widget.barangays.firstOrNull?.name ?? 'Poblacion';
    if (draft != null) {
      _name.text = draft.name;
      _contact.text = draft.contactNumber;
      _category = draft.category;
      _priority = draft.priority;
      _description.text = draft.description;
      _latitude.text = draft.latitude;
      _longitude.text = draft.longitude;
      _anonymous = draft.isAnonymous;
      _locationConfirmed =
          latLngFromText(draft.latitude, draft.longitude) != null;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _contact.dispose();
    _description.dispose();
    _latitude.dispose();
    _longitude.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final categoryItems = [
      if (!sanitationReportCategories.contains(_category)) _category,
      ...sanitationReportCategories,
    ];
    final priorityItems = [
      if (!sanitationReportPriorities.contains(_priority)) _priority,
      ...sanitationReportPriorities,
    ];

    return FormPageScaffold(
      title: 'Community Report',
      subtitle: 'Household and public-area sanitation concern',
      children: [
        const DataSourceBanner(
          icon: Icons.home_work_outlined,
          title: 'Household-linked community report',
          text:
              'Use this for public or household-area concerns. Establishment compliance stays under inspections and permits.',
        ),
        const SizedBox(height: 12),
        CheckboxListTile(
          value: _anonymous,
          onChanged: (value) {
            setState(() => _anonymous = value ?? false);
          },
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text('Submit without name'),
          subtitle: const Text(
            'Contact number is optional, but needed if you want follow-up updates.',
          ),
        ),
        if (!_anonymous) AppTextField(controller: _name, label: 'Your name'),
        AppTextField(
          controller: _contact,
          label: _anonymous
              ? 'Contact number (optional)'
              : 'Contact number for status tracking',
        ),
        DropdownTile<String>(
          label: 'Category',
          value: _category,
          items: categoryItems,
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _category = item),
        ),
        DropdownTile<String>(
          label: 'Urgency',
          value: _priority,
          items: priorityItems,
          itemLabel: sanitationPriorityLabel,
          onChanged: (item) => setState(() => _priority = item),
        ),
        DropdownTile<String>(
          label: 'Barangay',
          value: _barangay,
          items: widget.barangays.map((item) => item.name).toList(),
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _barangay = item),
        ),
        AppTextField(
          controller: _description,
          label: 'Description',
          maxLines: 4,
        ),
        PhotoPickerPanel(
          photoName: _photo?.name,
          onCamera: () => _pickPhoto(ImageSource.camera),
          onGallery: () => _pickPhoto(ImageSource.gallery),
          onClear: _photo == null ? null : () => setState(() => _photo = null),
        ),
        LocationCapturePanel(
          latitude: _latitude.text,
          longitude: _longitude.text,
          locating: _locating,
          onCapture: _captureLocation,
        ),
        Row(
          children: [
            Expanded(
              child: AppTextField(
                controller: _latitude,
                label: 'Latitude',
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() => _locationConfirmed = false),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: AppTextField(
                controller: _longitude,
                label: 'Longitude',
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() => _locationConfirmed = false),
              ),
            ),
          ],
        ),
        LocationConfirmationPanel(
          latitude: _latitude.text,
          longitude: _longitude.text,
          confirmed: _locationConfirmed,
          onChanged: _setLocation,
          onConfirm: () => setState(() => _locationConfirmed = true),
        ),
        ConsentCheckPanel(
          checked: _consentConfirmed,
          onChanged: (value) => setState(() => _consentConfirmed = value),
        ),
        OutlinedButton.icon(
          onPressed: _submitting ? null : _saveDraft,
          icon: const Icon(Icons.save_outlined),
          label: const Text('Save Draft'),
        ),
        const SizedBox(height: 10),
        SubmitButton(
          label: 'Submit Community Report',
          loading: _submitting,
          onPressed: _submit,
        ),
      ],
    );
  }

  Future<void> _submit() async {
    final contact = _contact.text.trim();

    if (!_anonymous && contact.isEmpty) {
      showAppMessage(
        context,
        'Contact number is required for status tracking.',
      );
      return;
    }
    if (_description.text.trim().isEmpty) {
      showAppMessage(context, 'Description is required.');
      return;
    }
    if (latLngFromText(_latitude.text, _longitude.text) == null) {
      showAppMessage(context, 'Capture or tap the report map location.');
      return;
    }
    if (!_locationConfirmed) {
      showAppMessage(
        context,
        'Confirm the community report GIS pin before submitting.',
      );
      return;
    }
    if (!_consentConfirmed) {
      showAppMessage(context, 'Privacy consent is required before submitting.');
      return;
    }

    setState(() => _submitting = true);

    try {
      final response = await widget.api.submitSanitationReport(
        name: _anonymous ? '' : _name.text.trim(),
        contactNumber: contact,
        category: _category,
        priority: _priority,
        barangay: _barangay,
        description: _description.text.trim(),
        photo: _photo,
        latitude: _latitude.text.trim(),
        longitude: _longitude.text.trim(),
      );

      if (mounted) {
        final receipt = MobileSanitationReceipt.fromResponse(
          response,
          category: _category,
          barangay: _barangay,
        );
        await showSubmissionDialog(
          context,
          title: 'Report submitted',
          referenceLabel: 'Complaint ID',
          referenceValue: receipt.reference,
          message: 'Saved to Sanitation Web System.',
          details: [
            'Category: ${receipt.category}',
            'Urgency: ${receipt.priorityLabel}',
            'Barangay: ${receipt.barangay}',
            if (contact.isEmpty)
              'Keep the complaint ID to track this anonymous report.',
          ],
        );
        if (widget.initialDraft != null) {
          await SanitationDraftStore.removeReport(widget.initialDraft!.id);
        }
        if (mounted) Navigator.of(context).pop(receipt);
      }
    } catch (error) {
      await SanitationDraftStore.upsertReport(_buildDraft());
      if (mounted) {
        showAppMessage(
          context,
          'Submission failed. Draft saved for pending sync.',
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _pickPhoto(ImageSource source) async {
    try {
      final picked = await _imagePicker.pickImage(
        source: source,
        imageQuality: 80,
        maxWidth: 1600,
      );
      if (picked != null) {
        setState(() => _photo = picked);
      }
    } catch (error) {
      if (mounted) showAppMessage(context, 'Photo capture failed: $error');
    }
  }

  Future<void> _captureLocation() async {
    setState(() => _locating = true);

    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        throw Exception('Please turn on location services first.');
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception('Location permission is required.');
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      setState(() {
        _latitude.text = position.latitude.toStringAsFixed(6);
        _longitude.text = position.longitude.toStringAsFixed(6);
        _locationConfirmed = false;
      });
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _setLocation(LatLng point) {
    setState(() {
      _latitude.text = point.latitude.toStringAsFixed(6);
      _longitude.text = point.longitude.toStringAsFixed(6);
      _locationConfirmed = false;
    });
  }

  Future<void> _saveDraft() async {
    await SanitationDraftStore.upsertReport(_buildDraft());
    if (mounted) {
      showAppMessage(context, 'Draft saved for pending sync.');
      Navigator.of(context).pop();
    }
  }

  SanitationReportDraft _buildDraft() {
    return SanitationReportDraft(
      id:
          widget.initialDraft?.id ??
          DateTime.now().millisecondsSinceEpoch.toString(),
      name: _name.text.trim(),
      contactNumber: _contact.text.trim(),
      category: _category,
      priority: _priority,
      barangay: _barangay,
      description: _description.text.trim(),
      latitude: _latitude.text.trim(),
      longitude: _longitude.text.trim(),
      isAnonymous: _anonymous,
      createdAt:
          widget.initialDraft?.createdAt ?? DateTime.now().toIso8601String(),
    );
  }
}

class PhotoPickerPanel extends StatelessWidget {
  const PhotoPickerPanel({
    super.key,
    required this.photoName,
    required this.onCamera,
    required this.onGallery,
    this.onClear,
  });

  final String? photoName;
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Supporting Photo',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 6),
            Text(
              photoName ?? 'No photo selected',
              style: const TextStyle(color: AppColors.muted),
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.tonalIcon(
                  onPressed: onCamera,
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Camera'),
                ),
                OutlinedButton.icon(
                  onPressed: onGallery,
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('Gallery'),
                ),
                if (onClear != null)
                  IconButton.filledTonal(
                    onPressed: onClear,
                    icon: const Icon(Icons.close),
                    tooltip: 'Remove photo',
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class LocationCapturePanel extends StatelessWidget {
  const LocationCapturePanel({
    super.key,
    required this.latitude,
    required this.longitude,
    required this.locating,
    required this.onCapture,
    this.title = 'Report Location',
    this.emptyText = 'No location captured yet',
  });

  final String latitude;
  final String longitude;
  final bool locating;
  final VoidCallback onCapture;
  final String title;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    final hasLocation = latitude.isNotEmpty && longitude.isNotEmpty;

    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: const CircleAvatar(
          backgroundColor: Color(0xffe9f8ef),
          child: Icon(Icons.my_location_outlined, color: AppColors.green),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text(
          hasLocation ? '$latitude, $longitude' : emptyText,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: FilledButton.tonalIcon(
          onPressed: locating ? null : onCapture,
          icon: locating
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.gps_fixed),
          label: Text(locating ? 'Getting' : 'Use GPS'),
        ),
      ),
    );
  }
}

class NotificationPage extends StatelessWidget {
  const NotificationPage({super.key, required this.notifications});

  final List<AppNotification> notifications;

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Notifications',
      subtitle: 'Tourism and community updates',
      children: notifications
          .map(
            (item) => Card(
              elevation: 0,
              color: Colors.white,
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: item.color.withValues(alpha: 0.14),
                  child: Icon(item.icon, color: item.color),
                ),
                title: Text(
                  item.title,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                subtitle: Text(item.message),
              ),
            ),
          )
          .toList(),
    );
  }
}

class VisitHistoryPage extends StatelessWidget {
  const VisitHistoryPage({super.key, required this.visits});

  final List<MobileVisitReceipt> visits;

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Visit History',
      subtitle: 'Submitted tourism registrations',
      children: visits.isEmpty
          ? [
              const EmptyState(
                icon: Icons.route_outlined,
                title: 'No submitted visits yet',
              ),
            ]
          : visits.map((visit) => VisitReceiptCard(receipt: visit)).toList(),
    );
  }
}

class FeedbackHistoryPage extends StatelessWidget {
  const FeedbackHistoryPage({super.key, required this.feedbackHistory});

  final List<MobileFeedbackReceipt> feedbackHistory;

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'My Feedback',
      subtitle: 'Feedback sent to the tourism office',
      children: feedbackHistory.isEmpty
          ? [
              const EmptyState(
                icon: Icons.feedback_outlined,
                title: 'No feedback submitted yet',
              ),
            ]
          : feedbackHistory
                .map((feedback) => FeedbackReceiptCard(receipt: feedback))
                .toList(),
    );
  }
}

class SanitationHistoryPage extends StatelessWidget {
  const SanitationHistoryPage({super.key, required this.reports});

  final List<MobileSanitationReceipt> reports;

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Community Reports',
      subtitle: 'Reports sent to the Sanitary Section',
      children: reports.isEmpty
          ? [
              const EmptyState(
                icon: Icons.health_and_safety_outlined,
                title: 'No reports submitted yet',
              ),
            ]
          : reports
                .map((report) => SanitationReceiptCard(receipt: report))
                .toList(),
    );
  }
}

class VisitReceiptCard extends StatelessWidget {
  const VisitReceiptCard({super.key, required this.receipt});

  final MobileVisitReceipt receipt;

  @override
  Widget build(BuildContext context) {
    return ReceiptCard(
      icon: Icons.confirmation_number_outlined,
      title: receipt.destination.name,
      reference: receipt.reference,
      lines: [
        '${receipt.totalVisitors} visitor(s)',
        shortDate(receipt.arrivalDate),
        'Status: ${receipt.displayStatus}',
      ],
    );
  }
}

class FeedbackReceiptCard extends StatelessWidget {
  const FeedbackReceiptCard({super.key, required this.receipt});

  final MobileFeedbackReceipt receipt;

  @override
  Widget build(BuildContext context) {
    return ReceiptCard(
      icon: Icons.star_outline,
      title: receipt.destination.name,
      reference: receipt.reference,
      lines: ['Rating: ${receipt.rating}/5', 'Reviewer: ${receipt.reviewer}'],
    );
  }
}

class SanitationReceiptCard extends StatelessWidget {
  const SanitationReceiptCard({super.key, required this.receipt});

  final MobileSanitationReceipt receipt;

  @override
  Widget build(BuildContext context) {
    final lines = [
      'Barangay: ${receipt.barangay}',
      'Urgency: ${receipt.priorityLabel}',
      'Status: ${receipt.statusLabel}',
      if (receipt.actionTaken.trim().isNotEmpty)
        'Action: ${receipt.actionTaken.trim()}',
      if (receipt.reportedDate.trim().isNotEmpty)
        'Reported: ${receipt.reportedDate}',
    ];

    return ReceiptCard(
      icon: Icons.health_and_safety_outlined,
      title: receipt.category,
      reference: receipt.reference,
      lines: lines,
    );
  }
}

class LocationConfirmationPanel extends StatelessWidget {
  const LocationConfirmationPanel({
    super.key,
    required this.latitude,
    required this.longitude,
    required this.confirmed,
    required this.onChanged,
    required this.onConfirm,
  });

  final String latitude;
  final String longitude;
  final bool confirmed;
  final ValueChanged<LatLng> onChanged;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    final point = latLngFromText(latitude, longitude);
    final center = point ?? const LatLng(14.185, 121.731);

    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Confirm GIS Pin',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                StatusPill(text: confirmed ? 'Confirmed' : 'Needs Review'),
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'Tap the map to adjust the exact location before saving.',
              style: TextStyle(color: AppColors.muted, fontSize: 12),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 220,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: FlutterMap(
                  key: ValueKey('${center.latitude},${center.longitude}'),
                  options: MapOptions(
                    initialCenter: center,
                    initialZoom: point == null ? 12 : 16,
                    minZoom: 8,
                    maxZoom: 18,
                    onTap: (_, tappedPoint) => onChanged(tappedPoint),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'mauban_sanitation_mobile',
                    ),
                    if (point != null)
                      MarkerLayer(
                        markers: [
                          Marker(
                            point: point,
                            width: 42,
                            height: 42,
                            child: const MapPin(),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            FilledButton.tonalIcon(
              onPressed: point == null ? null : onConfirm,
              icon: const Icon(Icons.check_circle_outline),
              label: Text(confirmed ? 'Location Confirmed' : 'Confirm Pin'),
            ),
          ],
        ),
      ),
    );
  }
}

class ConsentCheckPanel extends StatelessWidget {
  const ConsentCheckPanel({
    super.key,
    required this.checked,
    required this.onChanged,
  });

  final bool checked;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: CheckboxListTile(
        value: checked,
        onChanged: (value) => onChanged(value ?? false),
        title: const Text(
          'Privacy and consent',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: const Text(
          'I confirm that the submitted name, contact number, photo, and GPS location may be used by the Sanitary Section for validation and follow-up.',
        ),
        controlAffinity: ListTileControlAffinity.leading,
      ),
    );
  }
}

class ReceiptCard extends StatelessWidget {
  const ReceiptCard({
    super.key,
    required this.icon,
    required this.title,
    required this.reference,
    required this.lines,
  });

  final IconData icon;
  final String title;
  final String reference;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: const Color(0xffdcfce7),
          child: Icon(icon, color: AppColors.green),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(['Ref: $reference', ...lines].join('\n')),
        ),
      ),
    );
  }
}

class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: AppColors.green),
            const SizedBox(height: 10),
            Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
            ),
            Text(
              label,
              style: const TextStyle(
                color: AppColors.muted,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          children: [
            Icon(icon, size: 34, color: AppColors.muted),
            const SizedBox(height: 10),
            Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
          ],
        ),
      ),
    );
  }
}

class SanitationMobileShell extends StatefulWidget {
  const SanitationMobileShell({
    super.key,
    required this.api,
    required this.bootstrap,
    required this.onRefresh,
    this.onLogout,
  });

  final TourismApi api;
  final SanitationBootstrap bootstrap;
  final Future<SanitationBootstrap> Function() onRefresh;
  final VoidCallback? onLogout;

  @override
  State<SanitationMobileShell> createState() => _SanitationMobileShellState();
}

class _SanitationMobileShellState extends State<SanitationMobileShell> {
  final List<MobileSanitationReceipt> _reports = [];
  final List<MobileSanitationInspectionReceipt> _inspections = [];
  List<SanitationReportDraft> _drafts = [];
  late SanitationBootstrap _bootstrap;
  int _index = 0;
  bool _refreshing = false;

  @override
  void initState() {
    super.initState();
    _bootstrap = widget.bootstrap;
    _loadDrafts();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      SanitationDashboardPage(
        bootstrap: _bootstrap,
        reports: _reports,
        inspections: _inspections,
        onOpenInspection: _openInspection,
        onOpenReport: _openReport,
        onOpenHouseholdSurvey: _openHouseholdSurvey,
        onOpenPermits: _openPermits,
        onOpenTab: (index) => setState(() => _index = index),
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
      SanitationEstablishmentsPage(
        establishments: _bootstrap.establishments,
        onOpenInspection: _openInspection,
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
      SanitationMapPage(
        establishments: _bootstrap.establishments,
        householdRecords: _bootstrap.householdRecords,
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
      SanitationReportsPage(
        reports: _reports,
        drafts: _drafts,
        complaints: _bootstrap.complaints,
        householdRecords: _bootstrap.householdRecords,
        onOpenReport: _openReport,
        onOpenReportTracker: _openReportTracker,
        onEditDraft: _editReportDraft,
        onRetryDraft: _retryReportDraft,
        onDeleteDraft: _deleteReportDraft,
        onOpenHouseholdSurvey: _openHouseholdSurvey,
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
      SanitationActionsPage(
        bootstrap: _bootstrap,
        inspections: _inspections,
        onOpenInspection: _openInspection,
        onOpenPermits: _openPermits,
        onOpenPermitVerification: _openPermitVerification,
        onOpenReportTracker: _openReportTracker,
        onOpenHouseholdSurvey: _openHouseholdSurvey,
        onOpenNotifications: _openNotifications,
        onLogout: widget.onLogout,
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
    ];

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refreshBootstrap,
          child: pages[_index],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(
            icon: Icon(Icons.apartment_outlined),
            label: 'Establish',
          ),
          NavigationDestination(icon: Icon(Icons.map_outlined), label: 'Map'),
          NavigationDestination(
            icon: Icon(Icons.flag_outlined),
            label: 'Community',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  Future<void> _openReport() async {
    final receipt = await Navigator.of(context).push<MobileSanitationReceipt>(
      MaterialPageRoute(
        builder: (context) => SanitationReportPage(
          api: widget.api,
          barangays: widget.bootstrap.barangays,
        ),
      ),
    );

    if (receipt != null) {
      setState(() => _reports.insert(0, receipt));
      await _refreshBootstrap(silent: true);
    }

    await _loadDrafts();
  }

  Future<void> _editReportDraft(SanitationReportDraft draft) async {
    final receipt = await Navigator.of(context).push<MobileSanitationReceipt>(
      MaterialPageRoute(
        builder: (context) => SanitationReportPage(
          api: widget.api,
          barangays: widget.bootstrap.barangays,
          initialDraft: draft,
        ),
      ),
    );

    if (receipt != null) {
      setState(() => _reports.insert(0, receipt));
      await _refreshBootstrap(silent: true);
    }

    await _loadDrafts();
  }

  Future<void> _retryReportDraft(SanitationReportDraft draft) async {
    if ((!draft.isAnonymous && draft.contactNumber.trim().isEmpty) ||
        draft.description.trim().isEmpty) {
      showAppMessage(context, 'Edit the draft before retrying.');
      return;
    }

    if (latLngFromText(draft.latitude, draft.longitude) == null) {
      showAppMessage(context, 'Edit the draft and confirm a GIS pin first.');
      return;
    }

    try {
      final response = await widget.api.submitSanitationReportDraft(draft);
      final receipt = MobileSanitationReceipt.fromJson(response);
      await SanitationDraftStore.removeReport(draft.id);
      if (!mounted) return;
      setState(() => _reports.insert(0, receipt));
      await _loadDrafts();
      await _refreshBootstrap(silent: true);
      if (mounted) showAppMessage(context, 'Draft synced successfully.');
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    }
  }

  Future<void> _deleteReportDraft(SanitationReportDraft draft) async {
    await SanitationDraftStore.removeReport(draft.id);
    await _loadDrafts();
    if (mounted) showAppMessage(context, 'Draft deleted.');
  }

  Future<void> _openInspection([SanitationEstablishment? establishment]) async {
    final receipt = await Navigator.of(context)
        .push<MobileSanitationInspectionReceipt>(
          MaterialPageRoute(
            builder: (context) => SanitationInspectionPage(
              api: widget.api,
              bootstrap: _bootstrap,
              initialEstablishment: establishment,
            ),
          ),
        );

    if (receipt != null) {
      setState(() => _inspections.insert(0, receipt));
      await _refreshBootstrap(silent: true);
    }
  }

  Future<void> _openHouseholdSurvey() async {
    final submitted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (context) => HouseholdSurveyPage(
          api: widget.api,
          barangays: _bootstrap.barangays,
        ),
      ),
    );

    if (submitted == true) {
      await _refreshBootstrap(silent: true);
    }
  }

  Future<void> _openPermits() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) =>
            SanitationPermitsPage(establishments: _bootstrap.establishments),
      ),
    );
  }

  Future<void> _openPermitVerification() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => PermitVerificationPage(api: widget.api),
      ),
    );
  }

  Future<void> _openReportTracker() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ReportTrackerPage(api: widget.api),
      ),
    );
  }

  Future<void> _openNotifications() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) =>
            NotificationPage(notifications: _bootstrap.notifications),
      ),
    );
  }

  Future<void> _refreshBootstrap({bool silent = false}) async {
    if (_refreshing) return;
    setState(() => _refreshing = true);

    final updated = await widget.onRefresh();
    if (!mounted) return;

    setState(() {
      _bootstrap = updated;
      _refreshing = false;
    });

    if (!silent) {
      showAppMessage(
        context,
        updated.isOffline
            ? 'Cannot reach Sanitary Web System.'
            : 'Sanitation records refreshed.',
      );
    }
  }

  Future<void> _loadDrafts() async {
    final drafts = await SanitationDraftStore.loadReports();
    if (mounted) setState(() => _drafts = drafts);
  }
}

class SanitationDashboardPage extends StatelessWidget {
  const SanitationDashboardPage({
    super.key,
    required this.bootstrap,
    required this.reports,
    required this.inspections,
    required this.onOpenInspection,
    required this.onOpenReport,
    required this.onOpenHouseholdSurvey,
    required this.onOpenPermits,
    required this.onOpenTab,
    required this.onRefresh,
    required this.refreshing,
  });

  final SanitationBootstrap bootstrap;
  final List<MobileSanitationReceipt> reports;
  final List<MobileSanitationInspectionReceipt> inspections;
  final ValueChanged<SanitationEstablishment?> onOpenInspection;
  final VoidCallback onOpenReport;
  final VoidCallback onOpenHouseholdSurvey;
  final VoidCallback onOpenPermits;
  final ValueChanged<int> onOpenTab;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    final violationCount = bootstrap.establishments
        .where((item) => item.complianceStatus == 'violation')
        .length;
    final pendingPermitCount = bootstrap.establishments
        .where((item) => item.permitStatus != 'active')
        .length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Dashboard',
          onRefresh: onRefresh,
          refreshing: refreshing,
          onNotifications: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) =>
                    NotificationPage(notifications: bootstrap.notifications),
              ),
            );
          },
        ),
        Text(
          'Welcome, Sanitary Inspector',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
        ),
        Text(
          shortDate(DateTime.now()),
          style: const TextStyle(color: AppColors.muted),
        ),
        const SizedBox(height: 14),
        DataSourceBanner(
          icon: bootstrap.isOffline
              ? Icons.cloud_off_outlined
              : Icons.cloud_done_outlined,
          title: bootstrap.isOffline
              ? 'Cannot reach Sanitary Web System'
              : 'Connected to Sanitary Web System',
          text: bootstrap.isOffline
              ? bootstrap.offlineMessage
              : '${bootstrap.establishments.length} establishment records loaded.',
          warning: bootstrap.isOffline,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: StatCard(
                label: 'Establishments',
                value: '${bootstrap.establishments.length}',
                icon: Icons.apartment_outlined,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatCard(
                label: 'Inspections',
                value: '${bootstrap.inspections.length + inspections.length}',
                icon: Icons.fact_check_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: StatCard(
                label: 'Violations',
                value: '$violationCount',
                icon: Icons.warning_amber_outlined,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatCard(
                label: 'Permit Follow-up',
                value: '$pendingPermitCount',
                icon: Icons.badge_outlined,
              ),
            ),
          ],
        ),
        SectionHeader(title: 'Quick Actions'),
        Row(
          children: [
            QuickAction(
              icon: Icons.add_task_outlined,
              label: 'Inspection',
              onTap: () => onOpenInspection(null),
            ),
            QuickAction(
              icon: Icons.flag_outlined,
              label: 'Community',
              onTap: onOpenReport,
            ),
            QuickAction(
              icon: Icons.assignment_outlined,
              label: 'Household',
              onTap: onOpenHouseholdSurvey,
            ),
            QuickAction(
              icon: Icons.map_outlined,
              label: 'GIS Map',
              onTap: () => onOpenTab(2),
            ),
          ],
        ),
        SectionHeader(title: 'Urgent Alerts'),
        ...bootstrap.establishments
            .where(
              (item) =>
                  item.complianceStatus == 'violation' ||
                  item.permitStatus != 'active',
            )
            .take(3)
            .map(
              (item) => SanitationAlertCard(
                title: item.businessName,
                subtitle: '${item.barangay} - ${item.statusLabel}',
                status: item.complianceStatus,
              ),
            ),
        SectionHeader(title: 'Recent Activity'),
        if (inspections.isEmpty && reports.isEmpty)
          const EmptyState(
            icon: Icons.history_outlined,
            title: 'No mobile activity yet',
          )
        else ...[
          ...inspections
              .take(2)
              .map(
                (item) => ReceiptCard(
                  icon: Icons.fact_check_outlined,
                  title: item.establishmentName,
                  reference: item.reference,
                  lines: [
                    'Inspector: ${item.inspectorName}',
                    'Status: ${sanitationStatusLabel(item.status)}',
                  ],
                ),
              ),
          ...reports
              .take(2)
              .map((report) => SanitationReceiptCard(receipt: report)),
        ],
      ],
    );
  }
}

class SanitationEstablishmentsPage extends StatefulWidget {
  const SanitationEstablishmentsPage({
    super.key,
    required this.establishments,
    required this.onOpenInspection,
    required this.onRefresh,
    required this.refreshing,
  });

  final List<SanitationEstablishment> establishments;
  final ValueChanged<SanitationEstablishment> onOpenInspection;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  State<SanitationEstablishmentsPage> createState() =>
      _SanitationEstablishmentsPageState();
}

class _SanitationEstablishmentsPageState
    extends State<SanitationEstablishmentsPage> {
  String _search = '';
  String _type = 'All Types';
  String _barangay = 'All Barangays';
  String _status = 'All Status';
  String _permit = 'All Permits';

  @override
  Widget build(BuildContext context) {
    final types = [
      'All Types',
      ...widget.establishments.map((item) => item.businessTypeName).toSet(),
    ];
    final barangays = [
      'All Barangays',
      ...widget.establishments.map((item) => item.barangay).toSet(),
    ];
    final query = _search.toLowerCase().trim();
    final filtered = widget.establishments.where((item) {
      final matchesSearch =
          item.businessName.toLowerCase().contains(query) ||
          item.barangay.toLowerCase().contains(query) ||
          item.businessTypeName.toLowerCase().contains(query);
      final matchesType =
          _type == 'All Types' || item.businessTypeName == _type;
      final matchesBarangay =
          _barangay == 'All Barangays' || item.barangay == _barangay;
      final matchesStatus =
          _status == 'All Status' || item.complianceStatus == _status;
      final matchesPermit =
          _permit == 'All Permits' || item.permitStatus == _permit;
      return matchesSearch &&
          matchesType &&
          matchesBarangay &&
          matchesStatus &&
          matchesPermit;
    }).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Establishments',
          onRefresh: widget.onRefresh,
          refreshing: widget.refreshing,
        ),
        SearchBox(
          hint: 'Search establishments...',
          onChanged: (value) => setState(() => _search = value),
        ),
        const SizedBox(height: 12),
        DropdownTile<String>(
          label: 'Type filter',
          value: _type,
          items: types,
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _type = item),
        ),
        DropdownTile<String>(
          label: 'Barangay filter',
          value: _barangay,
          items: barangays,
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _barangay = item),
        ),
        DropdownTile<String>(
          label: 'Compliance status',
          value: _status,
          items: const [
            'All Status',
            'good_standing',
            'upcoming',
            'for_completion',
            'violation',
            'no_permit',
          ],
          itemLabel: (item) =>
              item == 'All Status' ? item : sanitationStatusLabel(item),
          onChanged: (item) => setState(() => _status = item),
        ),
        DropdownTile<String>(
          label: 'Permit status',
          value: _permit,
          items: const [
            'All Permits',
            'active',
            'renewal_due',
            'conditional',
            'suspended',
            'no_permit',
          ],
          itemLabel: (item) =>
              item == 'All Permits' ? item : permitStatusLabel(item),
          onChanged: (item) => setState(() => _permit = item),
        ),
        Text(
          '${filtered.length} establishment(s) found',
          style: const TextStyle(color: AppColors.muted),
        ),
        const SizedBox(height: 10),
        if (filtered.isEmpty)
          const EmptyState(
            icon: Icons.apartment_outlined,
            title: 'No establishments found',
          )
        else
          ...filtered
              .take(80)
              .map(
                (item) => SanitationEstablishmentCard(
                  establishment: item,
                  onInspection: () => widget.onOpenInspection(item),
                ),
              ),
      ],
    );
  }
}

class SanitationMapPage extends StatefulWidget {
  const SanitationMapPage({
    super.key,
    required this.establishments,
    required this.householdRecords,
    required this.onRefresh,
    required this.refreshing,
  });

  final List<SanitationEstablishment> establishments;
  final List<HouseholdSanitationItem> householdRecords;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  State<SanitationMapPage> createState() => _SanitationMapPageState();
}

class _SanitationMapPageState extends State<SanitationMapPage> {
  bool _showHouseholds = false;

  @override
  Widget build(BuildContext context) {
    final establishmentPins = widget.establishments
        .where((item) => item.hasCoordinates)
        .toList();
    final householdPins = widget.householdRecords
        .where((item) => item.hasCoordinates)
        .toList();
    final pinCount = _showHouseholds
        ? householdPins.length
        : establishmentPins.length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'GIS Map',
          onRefresh: widget.onRefresh,
          refreshing: widget.refreshing,
        ),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('Establishments')),
            ButtonSegment(value: true, label: Text('Households')),
          ],
          selected: {_showHouseholds},
          onSelectionChanged: (value) =>
              setState(() => _showHouseholds = value.first),
        ),
        const SizedBox(height: 12),
        DataSourceBanner(
          icon: Icons.map_outlined,
          title: '$pinCount mapped records',
          text: _showHouseholds
              ? 'Household survey coordinates are displayed separately from establishments.'
              : 'Establishment inspection records are displayed separately from household surveys.',
          warning: pinCount == 0,
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 360,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: FlutterMap(
              options: MapOptions(
                initialCenter: const LatLng(14.185, 121.731),
                initialZoom: 12,
                minZoom: 8,
                maxZoom: 18,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'mauban_sanitation_mobile',
                ),
                MarkerLayer(
                  markers:
                      (_showHouseholds
                              ? householdPins.map(
                                  (item) => Marker(
                                    point: LatLng(
                                      item.latitude,
                                      item.longitude,
                                    ),
                                    width: 42,
                                    height: 42,
                                    child: const MapPin(),
                                  ),
                                )
                              : establishmentPins.map(
                                  (item) => Marker(
                                    point: LatLng(
                                      item.latitude,
                                      item.longitude,
                                    ),
                                    width: 42,
                                    height: 42,
                                    child: const MapPin(),
                                  ),
                                ))
                          .toList(),
                ),
              ],
            ),
          ),
        ),
        SectionHeader(
          title: _showHouseholds
              ? 'Mapped Households'
              : 'Mapped Establishments',
        ),
        if (_showHouseholds)
          ...widget.householdRecords
              .take(20)
              .map(
                (item) => SimpleInfoCard(
                  icon: Icons.home_work_outlined,
                  title: item.householdHead,
                  subtitle: '${item.householdCode} - ${item.barangay}',
                  trailing: householdStatusLabel(item.status),
                ),
              )
        else
          ...widget.establishments
              .take(20)
              .map(
                (item) => SimpleInfoCard(
                  icon: Icons.apartment_outlined,
                  title: item.businessName,
                  subtitle: '${item.businessTypeName} - ${item.barangay}',
                  trailing: item.statusLabel,
                ),
              ),
      ],
    );
  }
}

class SanitationReportsPage extends StatelessWidget {
  const SanitationReportsPage({
    super.key,
    required this.reports,
    required this.drafts,
    required this.complaints,
    required this.householdRecords,
    required this.onOpenReport,
    required this.onOpenReportTracker,
    required this.onEditDraft,
    required this.onRetryDraft,
    required this.onDeleteDraft,
    required this.onOpenHouseholdSurvey,
    required this.onRefresh,
    required this.refreshing,
  });

  final List<MobileSanitationReceipt> reports;
  final List<SanitationReportDraft> drafts;
  final List<SanitationComplaintItem> complaints;
  final List<HouseholdSanitationItem> householdRecords;
  final VoidCallback onOpenReport;
  final VoidCallback onOpenReportTracker;
  final ValueChanged<SanitationReportDraft> onEditDraft;
  final ValueChanged<SanitationReportDraft> onRetryDraft;
  final ValueChanged<SanitationReportDraft> onDeleteDraft;
  final VoidCallback onOpenHouseholdSurvey;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Community Reports',
          onRefresh: onRefresh,
          refreshing: refreshing,
        ),
        DataSourceBanner(
          icon: Icons.home_work_outlined,
          title: 'Household + community sanitation',
          text:
              '${householdRecords.length} household record(s) and ${complaints.length} active community report(s) loaded from the Sanitary Web System.',
          warning: householdRecords.isEmpty && complaints.isEmpty,
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: onOpenHouseholdSurvey,
          icon: const Icon(Icons.assignment_outlined),
          label: const Text('Household Survey'),
        ),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: onOpenReport,
          icon: const Icon(Icons.flag_outlined),
          label: const Text('New Community Report'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: onOpenReportTracker,
          icon: const Icon(Icons.manage_search_outlined),
          label: const Text('Track Report Status'),
        ),
        if (drafts.isNotEmpty) ...[
          SectionHeader(title: 'Pending Sync Drafts'),
          ...drafts.map(
            (item) => SanitationDraftCard(
              draft: item,
              onEdit: () => onEditDraft(item),
              onRetry: () => onRetryDraft(item),
              onDelete: () => onDeleteDraft(item),
            ),
          ),
        ],
        SectionHeader(title: 'Submitted Community Reports'),
        if (reports.isEmpty)
          const EmptyState(
            icon: Icons.flag_outlined,
            title: 'No community reports submitted yet',
          )
        else
          ...reports.map((item) => SanitationReceiptCard(receipt: item)),
        SectionHeader(title: 'Violations & Alerts'),
        if (complaints.isEmpty)
          const EmptyState(
            icon: Icons.notifications_none_outlined,
            title: 'No complaint alerts loaded',
          )
        else
          ...complaints
              .take(20)
              .map(
                (item) => SanitationAlertCard(
                  title: item.category,
                  subtitle: '${item.barangay} - ${item.description}',
                  status: item.priority,
                ),
              ),
      ],
    );
  }
}

class SanitationDraftCard extends StatelessWidget {
  const SanitationDraftCard({
    super.key,
    required this.draft,
    required this.onEdit,
    required this.onRetry,
    required this.onDelete,
  });

  final SanitationReportDraft draft;
  final VoidCallback onEdit;
  final VoidCallback onRetry;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(
                  backgroundColor: Color(0xfffff3bd),
                  child: Icon(
                    Icons.sync_problem_outlined,
                    color: Color(0xff9a6700),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        draft.category,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        '${draft.barangay} - ${sanitationPriorityLabel(draft.priority)} - Pending sync',
                        style: const TextStyle(color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (draft.description.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                draft.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.tonalIcon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.cloud_upload_outlined),
                  label: const Text('Retry Sync'),
                ),
                OutlinedButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Edit'),
                ),
                IconButton.filledTonal(
                  onPressed: onDelete,
                  icon: const Icon(Icons.delete_outline),
                  tooltip: 'Delete draft',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class ReportTrackerPage extends StatefulWidget {
  const ReportTrackerPage({super.key, required this.api});

  final TourismApi api;

  @override
  State<ReportTrackerPage> createState() => _ReportTrackerPageState();
}

class _ReportTrackerPageState extends State<ReportTrackerPage> {
  final TextEditingController _contact = TextEditingController();
  final TextEditingController _reference = TextEditingController();
  List<MobileSanitationReceipt> _reports = [];
  bool _loading = false;
  bool _searched = false;

  @override
  void dispose() {
    _contact.dispose();
    _reference.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Track Status',
      subtitle: 'Search community sanitation reports',
      children: [
        DataSourceBanner(
          icon: Icons.manage_search_outlined,
          title: 'Report Status Tracking',
          text:
              'Use the contact number used during submission or the complaint ID from the receipt.',
        ),
        const SizedBox(height: 12),
        AppTextField(
          controller: _contact,
          label: 'Contact number',
          keyboardType: TextInputType.phone,
        ),
        AppTextField(controller: _reference, label: 'Complaint ID'),
        SubmitButton(
          label: 'Track Reports',
          loading: _loading,
          loadingLabel: 'Checking...',
          onPressed: _loadReports,
        ),
        SectionHeader(title: 'Results'),
        if (!_searched)
          const EmptyState(
            icon: Icons.manage_search_outlined,
            title: 'Enter contact or complaint ID',
          )
        else if (_reports.isEmpty)
          const EmptyState(
            icon: Icons.search_off_outlined,
            title: 'No matching reports found',
          )
        else
          ..._reports.map((item) => SanitationReceiptCard(receipt: item)),
      ],
    );
  }

  Future<void> _loadReports() async {
    if (_contact.text.trim().isEmpty && _reference.text.trim().isEmpty) {
      showAppMessage(context, 'Enter a contact number or complaint ID.');
      return;
    }

    setState(() => _loading = true);

    try {
      final reports = await widget.api.fetchSanitationReportHistory(
        contact: _contact.text,
        reference: _reference.text,
      );
      if (mounted) {
        setState(() {
          _reports = reports;
          _searched = true;
        });
      }
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}

class PermitVerificationPage extends StatefulWidget {
  const PermitVerificationPage({super.key, required this.api});

  final TourismApi api;

  @override
  State<PermitVerificationPage> createState() => _PermitVerificationPageState();
}

class _PermitVerificationPageState extends State<PermitVerificationPage> {
  final TextEditingController _code = TextEditingController();
  PermitVerificationResult? _result;
  bool _loading = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Verify Permit',
      subtitle: 'QR/manual sanitary permit authentication',
      children: [
        DataSourceBanner(
          icon: Icons.qr_code_scanner_outlined,
          title: 'QR-Based Permit Authentication',
          text:
              'Paste scanned QR text or enter the sanitary permit number to verify the establishment record.',
        ),
        const SizedBox(height: 12),
        AppTextField(controller: _code, label: 'QR text or permit number'),
        SubmitButton(
          label: 'Verify Permit',
          loading: _loading,
          loadingLabel: 'Verifying...',
          onPressed: _verify,
        ),
        if (_result != null) ...[
          SectionHeader(title: 'Verification Result'),
          PermitVerificationCard(result: _result!),
        ],
      ],
    );
  }

  Future<void> _verify() async {
    if (_code.text.trim().isEmpty) {
      showAppMessage(context, 'Enter or scan a sanitary permit code.');
      return;
    }

    setState(() => _loading = true);

    try {
      final result = await widget.api.verifySanitaryPermit(_code.text);
      if (mounted) setState(() => _result = result);
    } catch (error) {
      if (mounted) {
        setState(() => _result = null);
        showAppMessage(context, error.toString());
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}

class PermitVerificationCard extends StatelessWidget {
  const PermitVerificationCard({super.key, required this.result});

  final PermitVerificationResult result;

  @override
  Widget build(BuildContext context) {
    final establishment = result.establishment;

    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(
                  backgroundColor: Color(0xffdcfce7),
                  child: Icon(Icons.verified_outlined, color: AppColors.green),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        establishment.businessName,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        establishment.businessTypeName,
                        style: const TextStyle(color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            PermitDetailRow(
              icon: Icons.confirmation_number_outlined,
              label: 'Permit Number',
              value: establishment.permitNumber.isEmpty
                  ? result.code
                  : establishment.permitNumber,
            ),
            PermitDetailRow(
              icon: Icons.verified_user_outlined,
              label: 'Permit Status',
              value: result.permitStatusLabel,
            ),
            PermitDetailRow(
              icon: Icons.health_and_safety_outlined,
              label: 'Compliance Status',
              value: result.complianceStatusLabel,
            ),
            PermitDetailRow(
              icon: Icons.event_outlined,
              label: 'Expiry Date',
              value: result.expiryDate.isEmpty
                  ? 'Not recorded'
                  : result.expiryDate,
            ),
          ],
        ),
      ),
    );
  }
}

class PermitDetailRow extends StatelessWidget {
  const PermitDetailRow({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          Icon(icon, color: AppColors.green),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
                Text(
                  value,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class SanitationActionsPage extends StatelessWidget {
  const SanitationActionsPage({
    super.key,
    required this.bootstrap,
    required this.inspections,
    required this.onOpenInspection,
    required this.onOpenPermits,
    required this.onOpenPermitVerification,
    required this.onOpenReportTracker,
    required this.onOpenHouseholdSurvey,
    required this.onOpenNotifications,
    this.onLogout,
    required this.onRefresh,
    required this.refreshing,
  });

  final SanitationBootstrap bootstrap;
  final List<MobileSanitationInspectionReceipt> inspections;
  final ValueChanged<SanitationEstablishment?> onOpenInspection;
  final VoidCallback onOpenPermits;
  final VoidCallback onOpenPermitVerification;
  final VoidCallback onOpenReportTracker;
  final VoidCallback onOpenHouseholdSurvey;
  final VoidCallback onOpenNotifications;
  final VoidCallback? onLogout;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Sanitary Monitor',
          onRefresh: onRefresh,
          refreshing: refreshing,
        ),
        ProfileLink(
          icon: Icons.fact_check_outlined,
          label: 'New Establishment Inspection',
          onTap: () => onOpenInspection(null),
        ),
        ProfileLink(
          icon: Icons.badge_outlined,
          label: 'Sanitary Permits',
          onTap: onOpenPermits,
        ),
        ProfileLink(
          icon: Icons.qr_code_scanner_outlined,
          label: 'Verify QR Permit',
          onTap: onOpenPermitVerification,
        ),
        ProfileLink(
          icon: Icons.manage_search_outlined,
          label: 'Track Community Report',
          onTap: onOpenReportTracker,
        ),
        ProfileLink(
          icon: Icons.assignment_outlined,
          label: 'Household Survey',
          onTap: onOpenHouseholdSurvey,
        ),
        ProfileLink(
          icon: Icons.notifications_outlined,
          label: 'Notifications',
          onTap: onOpenNotifications,
        ),
        if (onLogout != null)
          ProfileLink(
            icon: Icons.logout_outlined,
            label: 'Sign out',
            onTap: onLogout!,
          ),
        SectionHeader(title: 'Submitted Inspections'),
        if (inspections.isEmpty)
          const EmptyState(
            icon: Icons.fact_check_outlined,
            title: 'No mobile inspections submitted yet',
          )
        else
          ...inspections.map(
            (item) => ReceiptCard(
              icon: Icons.fact_check_outlined,
              title: item.establishmentName,
              reference: item.reference,
              lines: [
                'Inspector: ${item.inspectorName}',
                'Date: ${item.inspectionDate}',
                'Status: ${sanitationStatusLabel(item.status)}',
              ],
            ),
          ),
      ],
    );
  }
}

class SanitationTopBar extends StatelessWidget {
  const SanitationTopBar({
    super.key,
    required this.title,
    this.onRefresh,
    this.refreshing = false,
    this.onNotifications,
  });

  final String title;
  final Future<void> Function()? onRefresh;
  final bool refreshing;
  final VoidCallback? onNotifications;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: [
          const Icon(Icons.menu, color: AppColors.deepGreen),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
            ),
          ),
          if (onRefresh != null)
            IconButton.filledTonal(
              onPressed: refreshing ? null : () => onRefresh?.call(),
              icon: refreshing
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh),
            ),
          if (onRefresh != null) const SizedBox(width: 8),
          IconButton.filledTonal(
            onPressed: onNotifications,
            icon: const Icon(Icons.notifications_outlined),
          ),
        ],
      ),
    );
  }
}

class SanitationEstablishmentCard extends StatelessWidget {
  const SanitationEstablishmentCard({
    super.key,
    required this.establishment,
    required this.onInspection,
  });

  final SanitationEstablishment establishment;
  final VoidCallback onInspection;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: sanitationStatusColor(
            establishment.complianceStatus,
          ).withValues(alpha: 0.14),
          child: Icon(
            Icons.apartment_outlined,
            color: sanitationStatusColor(establishment.complianceStatus),
          ),
        ),
        title: Text(
          establishment.businessName,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Text(
          '${establishment.businessTypeName}\n${establishment.barangay} - ${establishment.ownerName}',
        ),
        isThreeLine: true,
        trailing: FilledButton.tonal(
          onPressed: onInspection,
          child: const Text('Inspect'),
        ),
      ),
    );
  }
}

class SanitationAlertCard extends StatelessWidget {
  const SanitationAlertCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.status,
  });

  final String title;
  final String subtitle;
  final String status;

  @override
  Widget build(BuildContext context) {
    final color = sanitationStatusColor(status);
    return Card(
      elevation: 0,
      color: color.withValues(alpha: 0.08),
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(Icons.warning_amber_outlined, color: color),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
        trailing: StatusPill(text: sanitationStatusLabel(status)),
      ),
    );
  }
}

class SimpleInfoCard extends StatelessWidget {
  const SimpleInfoCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(icon, color: AppColors.green),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text(subtitle),
        trailing: StatusPill(text: trailing),
      ),
    );
  }
}

class SanitationPermitsPage extends StatelessWidget {
  const SanitationPermitsPage({super.key, required this.establishments});

  final List<SanitationEstablishment> establishments;

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Sanitary Permits',
      subtitle: 'Permit monitoring for establishments',
      children: [
        if (establishments.isEmpty)
          const EmptyState(
            icon: Icons.badge_outlined,
            title: 'No permit records loaded',
          )
        else
          ...establishments
              .take(80)
              .map(
                (item) => Card(
                  elevation: 0,
                  color: Colors.white,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.badge_outlined,
                              color: AppColors.green,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.businessName,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  Text(
                                    [
                                      item.permitNumber.isEmpty
                                          ? 'No permit number'
                                          : item.permitNumber,
                                      item.permitExpiryDate.isEmpty
                                          ? 'No expiry date'
                                          : 'Expires: ${item.permitExpiryDate}',
                                    ].join('\n'),
                                    style: const TextStyle(
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            StatusPill(text: item.permitStatusLabel),
                          ],
                        ),
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: () => showSubmissionDialog(
                              context,
                              title: 'Permit follow-up noted',
                              referenceLabel: 'Permit',
                              referenceValue: item.permitNumber.isEmpty
                                  ? item.businessName
                                  : item.permitNumber,
                              message:
                                  'Prepared as a mobile follow-up note for permit monitoring.',
                              details: [
                                'Establishment: ${item.businessName}',
                                'Status: ${item.permitStatusLabel}',
                              ],
                            ),
                            icon: const Icon(Icons.event_repeat_outlined),
                            label: const Text('Follow up permit'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
      ],
    );
  }
}

class SanitationInspectionPage extends StatefulWidget {
  const SanitationInspectionPage({
    super.key,
    required this.api,
    required this.bootstrap,
    this.initialEstablishment,
  });

  final TourismApi api;
  final SanitationBootstrap bootstrap;
  final SanitationEstablishment? initialEstablishment;

  @override
  State<SanitationInspectionPage> createState() =>
      _SanitationInspectionPageState();
}

class _SanitationInspectionPageState extends State<SanitationInspectionPage> {
  final TextEditingController _inspector = TextEditingController();
  final TextEditingController _findings = TextEditingController();
  final TextEditingController _remarks = TextEditingController();
  late SanitationEstablishment _establishment;
  late DateTime _inspectionDate;
  late DateTime _nextDueDate;
  String _status = 'good_standing';
  List<InspectionChecklistDraft> _checks = [];
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _establishment =
        widget.initialEstablishment ??
        widget.bootstrap.establishments.firstOrNull ??
        SanitationEstablishment.placeholder();
    _inspectionDate = DateTime.now();
    _nextDueDate = _suggestedDueDate(_inspectionDate, _establishment);
    _checks = _defaultChecksFor(_establishment);
  }

  @override
  void dispose() {
    _inspector.dispose();
    _findings.dispose();
    _remarks.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'New Inspection',
      subtitle: 'Establishment inspection only',
      children: [
        DropdownTile<SanitationEstablishment>(
          label: 'Select Establishment',
          value: _establishment,
          items: widget.bootstrap.establishments,
          itemLabel: (item) => item.businessName,
          onChanged: (item) {
            setState(() {
              _establishment = item;
              _nextDueDate = _suggestedDueDate(_inspectionDate, item);
              _checks = _defaultChecksFor(item);
              _findings.clear();
              _status = 'good_standing';
            });
          },
        ),
        AppTextField(controller: _inspector, label: 'Inspector name'),
        PickerTile(
          icon: Icons.calendar_month_outlined,
          label: 'Inspection date',
          value: shortDate(_inspectionDate),
          onTap: _pickInspectionDate,
        ),
        PickerTile(
          icon: Icons.event_repeat_outlined,
          label: 'Next due date',
          value: shortDate(_nextDueDate),
          onTap: _pickNextDueDate,
        ),
        DropdownTile<String>(
          label: 'Inspection status',
          value: _status,
          items: const [
            'good_standing',
            'upcoming',
            'for_completion',
            'violation',
          ],
          itemLabel: sanitationStatusLabel,
          onChanged: (item) => setState(() => _status = item),
        ),
        InspectionChecklistPanel(checks: _checks, onToggle: _toggleCheck),
        AppTextField(controller: _findings, label: 'Findings', maxLines: 3),
        AppTextField(
          controller: _remarks,
          label: 'Remarks / observations',
          maxLines: 3,
        ),
        SubmitButton(
          label: 'Submit Inspection',
          loading: _submitting,
          onPressed: _submit,
        ),
      ],
    );
  }

  List<InspectionChecklistDraft> _defaultChecksFor(
    SanitationEstablishment establishment,
  ) {
    final businessType = widget.bootstrap.businessTypes.firstWhereOrNull(
      (item) => item.id == establishment.businessTypeId,
    );
    final requirements = businessType?.requirements ?? const [];

    if (requirements.isEmpty) {
      return const [
        InspectionChecklistDraft('Proper waste disposal system', true),
        InspectionChecklistDraft('Clean water supply available', true),
        InspectionChecklistDraft('Functional toilet facilities', true),
        InspectionChecklistDraft('Food handling area is clean', true),
        InspectionChecklistDraft('Valid sanitary permit displayed', true),
      ];
    }

    return requirements
        .map((item) => InspectionChecklistDraft(item.requirementName, true))
        .toList();
  }

  DateTime _suggestedDueDate(
    DateTime date,
    SanitationEstablishment establishment,
  ) {
    final months = establishment.inspectionFrequency == 'quarterly' ? 3 : 1;
    return DateTime(date.year, date.month + months, date.day);
  }

  Future<void> _pickInspectionDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _inspectionDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked == null) return;
    setState(() {
      _inspectionDate = picked;
      _nextDueDate = _suggestedDueDate(picked, _establishment);
    });
  }

  Future<void> _pickNextDueDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _nextDueDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (picked != null) setState(() => _nextDueDate = picked);
  }

  void _toggleCheck(int index) {
    setState(() {
      final current = _checks[index];
      _checks[index] = InspectionChecklistDraft(
        current.requirementName,
        !current.isComplied,
      );
      if (_checks.any((item) => !item.isComplied)) {
        _status = 'for_completion';
        if (_findings.text.trim().isEmpty) {
          _findings.text = 'Some checklist items need correction.';
        }
      } else {
        _status = 'good_standing';
        if (_findings.text.trim() == 'Some checklist items need correction.') {
          _findings.clear();
        }
      }
    });
  }

  Future<void> _submit() async {
    if (_establishment.id == 0 || widget.bootstrap.establishments.isEmpty) {
      showAppMessage(context, 'No establishment records loaded.');
      return;
    }
    if (_inspector.text.trim().isEmpty) {
      showAppMessage(context, 'Inspector name is required.');
      return;
    }
    if (_checks.isEmpty) {
      showAppMessage(context, 'Inspection checklist is required.');
      return;
    }
    if (_checks.any((item) => !item.isComplied) && _status == 'good_standing') {
      showAppMessage(context, 'Update the status for unchecked items.');
      return;
    }

    setState(() => _submitting = true);

    try {
      final response = await widget.api.submitSanitationInspection(
        establishmentId: _establishment.id,
        inspectorName: _inspector.text.trim(),
        inspectionDate: isoDate(_inspectionDate),
        nextDueDate: isoDate(_nextDueDate),
        findings: _findings.text.trim(),
        remarks: _remarks.text.trim(),
        statusAfterInspection: _status,
        checklistItems: _checks,
      );

      if (mounted) {
        final receipt = MobileSanitationInspectionReceipt.fromResponse(
          response,
          establishment: _establishment,
          inspectorName: _inspector.text.trim(),
          status: _status,
          inspectionDate: isoDate(_inspectionDate),
        );
        await showSubmissionDialog(
          context,
          title: 'Inspection submitted',
          referenceLabel: 'Inspection ID',
          referenceValue: receipt.reference,
          message: 'Saved to Sanitation Web System.',
          details: [
            'Establishment: ${receipt.establishmentName}',
            'Inspector: ${receipt.inspectorName}',
            'Status: ${sanitationStatusLabel(receipt.status)}',
            'Separate from household survey records.',
          ],
        );
        if (mounted) Navigator.of(context).pop(receipt);
      }
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class InspectionChecklistPanel extends StatelessWidget {
  const InspectionChecklistPanel({
    super.key,
    required this.checks,
    required this.onToggle,
  });

  final List<InspectionChecklistDraft> checks;
  final ValueChanged<int> onToggle;

  @override
  Widget build(BuildContext context) {
    final completed = checks.where((item) => item.isComplied).length;
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Sanitation Checklist',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                Text('$completed/${checks.length}'),
              ],
            ),
            const SizedBox(height: 8),
            ...checks.asMap().entries.map(
              (entry) => CheckboxListTile(
                value: entry.value.isComplied,
                onChanged: (_) => onToggle(entry.key),
                contentPadding: EdgeInsets.zero,
                title: Text(entry.value.requirementName),
                controlAffinity: ListTileControlAffinity.leading,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SanitationStandaloneApp extends StatelessWidget {
  const SanitationStandaloneApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mauban Sanitation & Community',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.deepGreen,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: AppColors.canvas,
        fontFamily: 'Arial',
        useMaterial3: true,
      ),
      home: const SanitationStandaloneBootstrap(),
    );
  }
}

class SanitationStandaloneBootstrap extends StatefulWidget {
  const SanitationStandaloneBootstrap({super.key});

  @override
  State<SanitationStandaloneBootstrap> createState() =>
      _SanitationStandaloneBootstrapState();
}

class _SanitationStandaloneBootstrapState
    extends State<SanitationStandaloneBootstrap> {
  final TourismApi _api = const TourismApi();
  late Future<SanitationBootstrap> _bootstrapFuture;

  @override
  void initState() {
    super.initState();
    _bootstrapFuture = _api.fetchSanitationBootstrap();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<SanitationBootstrap>(
      future: _bootstrapFuture,
      initialData: SanitationBootstrap.fallback(
        message: 'Loading live sanitation records...',
      ),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          return const SanitationLoadingScreen();
        }

        final data = snapshot.data ?? SanitationBootstrap.fallback();
        return SanitationAccessGateway(
          api: _api,
          bootstrap: data,
          onRefresh: _api.fetchSanitationBootstrap,
        );
      },
    );
  }
}

class SanitationAccessGateway extends StatefulWidget {
  const SanitationAccessGateway({
    super.key,
    required this.api,
    required this.bootstrap,
    required this.onRefresh,
  });

  final TourismApi api;
  final SanitationBootstrap bootstrap;
  final Future<SanitationBootstrap> Function() onRefresh;

  @override
  State<SanitationAccessGateway> createState() =>
      _SanitationAccessGatewayState();
}

class _SanitationAccessGatewayState extends State<SanitationAccessGateway> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  bool _signedIn = false;
  bool _signingIn = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_signedIn) {
      return SanitationMobileShell(
        api: widget.api,
        bootstrap: widget.bootstrap,
        onRefresh: widget.onRefresh,
        onLogout: _signOut,
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(18),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 12,
                    ),
                    decoration: const BoxDecoration(
                      color: AppColors.green,
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(18),
                      ),
                    ),
                    child: const Text(
                      'Login Page',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Card(
                    margin: EdgeInsets.zero,
                    elevation: 0,
                    color: Colors.white,
                    shape: const RoundedRectangleBorder(
                      borderRadius: BorderRadius.vertical(
                        bottom: Radius.circular(18),
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Center(
                            child: Image.asset(
                              'assets/tourism_logo.jpg',
                              width: 76,
                              height: 76,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'Sanitation Section',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w900),
                          ),
                          const Text(
                            'Sign in to continue',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: AppColors.muted,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 18),
                          _GatewaySection(
                            icon: Icons.admin_panel_settings_outlined,
                            title: 'Admin Login',
                            children: [
                              TextField(
                                controller: _email,
                                keyboardType: TextInputType.emailAddress,
                                decoration: const InputDecoration(
                                  labelText: 'Email',
                                  hintText: 'admin@example.com',
                                ),
                              ),
                              const SizedBox(height: 10),
                              TextField(
                                controller: _password,
                                obscureText: true,
                                decoration: const InputDecoration(
                                  labelText: 'Password',
                                  hintText: 'Password',
                                ),
                              ),
                              const SizedBox(height: 12),
                              FilledButton(
                                onPressed: _signingIn ? null : _signIn,
                                child: Text(
                                  _signingIn
                                      ? 'Signing in...'
                                      : 'Sign in as Admin',
                                ),
                              ),
                            ],
                          ),
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Row(
                              children: [
                                Expanded(child: Divider()),
                                Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 12),
                                  child: Text(
                                    'OR',
                                    style: TextStyle(
                                      color: AppColors.muted,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                                Expanded(child: Divider()),
                              ],
                            ),
                          ),
                          _GatewaySection(
                            icon: Icons.flag_outlined,
                            title: 'Community Concern',
                            text:
                                'No account needed. Report unsanitary conditions right away.',
                            children: [
                              OutlinedButton(
                                onPressed: _openCommunityReport,
                                child: const Text('Continue as Guest'),
                              ),
                            ],
                          ),
                          if (widget.bootstrap.isOffline) ...[
                            const SizedBox(height: 14),
                            DataSourceBanner(
                              icon: Icons.cloud_off_outlined,
                              title: 'Backend not reachable',
                              text: widget.bootstrap.offlineMessage,
                              warning: true,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _signIn() async {
    if (_email.text.trim().isEmpty || _password.text.trim().isEmpty) {
      showAppMessage(context, 'Enter admin email and password.');
      return;
    }

    setState(() => _signingIn = true);
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (!mounted) return;
    setState(() {
      _signingIn = false;
      _signedIn = true;
    });
    showAppMessage(context, 'Signed in to sanitation staff mode.');
  }

  void _signOut() {
    setState(() {
      _signedIn = false;
      _password.clear();
    });
  }

  Future<void> _openCommunityReport() async {
    final receipt = await Navigator.of(context).push<MobileSanitationReceipt>(
      MaterialPageRoute(
        builder: (context) => SanitationReportPage(
          api: widget.api,
          barangays: widget.bootstrap.barangays,
        ),
      ),
    );

    if (receipt != null && mounted) {
      showAppMessage(context, 'Community report ${receipt.reference} sent.');
    }
  }
}

class _GatewaySection extends StatelessWidget {
  const _GatewaySection({
    required this.icon,
    required this.title,
    this.text,
    required this.children,
  });

  final IconData icon;
  final String title;
  final String? text;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: AppColors.green.withValues(alpha: 0.12),
                child: Icon(icon, color: AppColors.green),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    if (text != null)
                      Text(
                        text!,
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontSize: 12,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class SanitationLoadingScreen extends StatelessWidget {
  const SanitationLoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text(
                'Loading sanitation records...',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class TourismApi {
  const TourismApi();
  static const Duration _requestTimeout = Duration(seconds: 8);

  Future<MobileBootstrap> fetchBootstrap() async {
    try {
      final data = await _get('/mobile/tourism/bootstrap/');
      return MobileBootstrap.fromJson(data);
    } catch (_) {
      return MobileBootstrap.fallback();
    }
  }

  Future<SanitationBootstrap> fetchSanitationBootstrap() async {
    try {
      final data = await _get('/mobile/sanitation/bootstrap/');
      return SanitationBootstrap.fromJson(data);
    } catch (error) {
      debugPrint('Sanitation bootstrap failed: $error');
      return SanitationBootstrap.fallback(
        message: 'Connection failed via $apiBaseUrl: ${conciseError(error)}',
      );
    }
  }

  Future<List<MobileSanitationReceipt>> fetchSanitationReportHistory({
    required String contact,
    required String reference,
  }) async {
    final data = await _getWithQuery('/mobile/sanitation/reports/history/', {
      if (contact.trim().isNotEmpty) 'contact': contact.trim(),
      if (reference.trim().isNotEmpty) 'reference': reference.trim(),
    });
    return parseList(data['rows'], MobileSanitationReceipt.fromJson);
  }

  Future<PermitVerificationResult> verifySanitaryPermit(String code) async {
    final data = await _getWithQuery('/mobile/sanitation/permits/verify/', {
      'code': code.trim(),
    });
    return PermitVerificationResult.fromJson(data);
  }

  Future<Map<String, dynamic>> registerVisit({
    required String fullName,
    required String contactNumber,
    required String email,
    required bool consentConfirmed,
    required String arrivalDate,
    required int countryId,
    required int regionId,
    required int provinceId,
    required String countryOfOrigin,
    required int resortId,
    required int itineraryId,
    required int travelModeId,
    required int boatTypeId,
    required String boatCapacityFare,
    required String parkingSpace,
    required int visitPurposeId,
    required int totalVisitors,
    required int totalMale,
    required int totalFemale,
    required int filipinoCount,
    required int maubaninCount,
    required int foreignerCount,
    required int specialGroupCount,
    required int age0To7,
    required int age8To59,
    required int age60Above,
  }) {
    return _post('/mobile/tourism/register-visit/', {
      'full_name': fullName,
      'contact_number': contactNumber,
      'email': email,
      'consent_confirmed': consentConfirmed,
      'arrival_date': arrivalDate,
      'country_id': countryId,
      'region_id': regionId,
      'province_id': provinceId,
      'country_of_origin': countryOfOrigin,
      'resort_id': resortId,
      'itinerary_id': itineraryId,
      'travel_mode_id': travelModeId,
      'boat_type_id': boatTypeId,
      'boat_capacity_fare': boatCapacityFare,
      'parking_space': parkingSpace,
      'visit_purpose_id': visitPurposeId,
      'total_visitors': totalVisitors,
      'total_male': totalMale,
      'total_female': totalFemale,
      'filipino_count': filipinoCount,
      'maubanin_count': maubaninCount,
      'foreigner_count': foreignerCount,
      'special_group_count': specialGroupCount,
      'age_0_7': age0To7,
      'age_8_59': age8To59,
      'age_60_above': age60Above,
    });
  }

  Future<Map<String, dynamic>> submitFeedback({
    required int destinationId,
    required String reviewer,
    required int rating,
    required String message,
    required int cleanlinessRating,
    required String sanitationComment,
  }) {
    return _post('/mobile/tourism/feedback/', {
      'destination_id': destinationId,
      'reviewer': reviewer,
      'rating': rating,
      'message': message,
      'cleanliness_rating': cleanlinessRating,
      'sanitation_comment': sanitationComment,
    });
  }

  Future<Map<String, dynamic>> submitSanitationReport({
    required String name,
    required String contactNumber,
    required String category,
    required String priority,
    required String barangay,
    required String description,
    XFile? photo,
    required String latitude,
    required String longitude,
  }) {
    final fields = {
      'complainant_name': name,
      'contact_number': contactNumber,
      'category': category,
      'priority': priority,
      'barangay': barangay,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
    };

    if (photo != null) {
      return _multipartPost('/mobile/sanitation/reports/', fields, photo);
    }

    return _post('/mobile/sanitation/reports/', fields);
  }

  Future<Map<String, dynamic>> submitSanitationReportDraft(
    SanitationReportDraft draft,
  ) {
    return submitSanitationReport(
      name: draft.name,
      contactNumber: draft.contactNumber,
      category: draft.category,
      priority: draft.priority,
      barangay: draft.barangay,
      description: draft.description,
      latitude: draft.latitude,
      longitude: draft.longitude,
    );
  }

  Future<Map<String, dynamic>> submitHouseholdSurvey({
    required String householdHead,
    required String barangay,
    required String address,
    required int maleCount,
    required int femaleCount,
    required String toiletType,
    required String waterLevel,
    required String waterSource,
    required String wasteDisposal,
    required String remarks,
    required String latitude,
    required String longitude,
  }) {
    return _post('/mobile/sanitation/household-surveys/', {
      'household_head': householdHead,
      'barangay': barangay,
      'address': address,
      'male_count': maleCount,
      'female_count': femaleCount,
      'toilet_type': toiletType,
      'water_level': waterLevel,
      'water_source': waterSource,
      'waste_disposal': wasteDisposal,
      'remarks': remarks,
      'latitude': latitude,
      'longitude': longitude,
    });
  }

  Future<Map<String, dynamic>> submitSanitationInspection({
    required int establishmentId,
    required String inspectorName,
    required String inspectionDate,
    required String nextDueDate,
    required String findings,
    required String remarks,
    required String statusAfterInspection,
    required List<InspectionChecklistDraft> checklistItems,
  }) {
    return _post('/mobile/sanitation/inspections/', {
      'establishment': establishmentId,
      'inspector_name': inspectorName,
      'inspection_date': inspectionDate,
      'next_due_date': nextDueDate,
      'findings': findings,
      'remarks': remarks,
      'status_after_inspection': statusAfterInspection,
      'is_draft': false,
      'checklist_items': checklistItems
          .map(
            (item) => {
              'requirement_name': item.requirementName,
              'is_complied': item.isComplied,
              'notes': '',
            },
          )
          .toList(),
    });
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final response = await http
        .get(Uri.parse('$apiBaseUrl$path'))
        .timeout(_requestTimeout);
    return _decode(response);
  }

  Future<Map<String, dynamic>> _getWithQuery(
    String path,
    Map<String, String> query,
  ) async {
    final uri = Uri.parse('$apiBaseUrl$path').replace(queryParameters: query);
    final response = await http.get(uri).timeout(_requestTimeout);
    return _decode(response);
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, Object?> body,
  ) async {
    final response = await http
        .post(
          Uri.parse('$apiBaseUrl$path'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(_requestTimeout);
    return _decode(response);
  }

  Future<Map<String, dynamic>> _multipartPost(
    String path,
    Map<String, String> fields,
    XFile photo,
  ) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$apiBaseUrl$path'),
    );
    request.fields.addAll(fields);
    request.files.add(
      http.MultipartFile.fromBytes(
        'photo',
        await photo.readAsBytes(),
        filename: photo.name,
      ),
    );

    final streamed = await request.send().timeout(_requestTimeout);
    final response = await http.Response.fromStream(streamed);
    return _decode(response);
  }

  Map<String, dynamic> _decode(http.Response response) {
    final decoded = jsonDecode(response.body.isEmpty ? '{}' : response.body);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded as Map<String, dynamic>;
    }

    if (decoded is Map<String, dynamic> && decoded['detail'] != null) {
      throw Exception(decoded['detail']);
    }

    if (decoded is Map<String, dynamic>) {
      final errors = decoded.entries
          .map((entry) {
            final value = entry.value;
            if (value is List) return '${entry.key}: ${value.join(', ')}';
            return '${entry.key}: $value';
          })
          .join('\n');

      if (errors.isNotEmpty) throw Exception(errors);
    }

    throw Exception('Request failed with status ${response.statusCode}.');
  }
}

class MobileBootstrap {
  const MobileBootstrap({
    required this.destinations,
    required this.featuredDestinations,
    required this.countries,
    required this.regions,
    required this.provinces,
    required this.itineraries,
    required this.travelModes,
    required this.boatTypes,
    required this.visitPurposes,
    required this.barangays,
    required this.notifications,
    this.isOffline = false,
  });

  final List<Destination> destinations;
  final List<Destination> featuredDestinations;
  final List<RefItem> countries;
  final List<RefItem> regions;
  final List<RefItem> provinces;
  final List<RefItem> itineraries;
  final List<RefItem> travelModes;
  final List<RefItem> boatTypes;
  final List<RefItem> visitPurposes;
  final List<BarangayItem> barangays;
  final List<AppNotification> notifications;
  final bool isOffline;

  factory MobileBootstrap.fromJson(Map<String, dynamic> json) {
    final refs = json['referenceTables'] as Map<String, dynamic>? ?? {};
    return MobileBootstrap(
      destinations: parseList(json['destinations'], Destination.fromJson),
      featuredDestinations: parseList(
        json['featuredDestinations'],
        Destination.fromJson,
      ),
      countries: parseList(refs['countries'], RefItem.fromJson),
      regions: parseList(refs['regions'], RefItem.fromJson),
      provinces: parseList(refs['provinces'], RefItem.fromJson),
      itineraries: parseList(refs['itineraries'], RefItem.fromJson),
      travelModes: parseList(refs['travelModes'], RefItem.fromJson),
      boatTypes: parseList(refs['boatTypes'], RefItem.fromJson),
      visitPurposes: parseList(refs['visitPurposes'], RefItem.fromJson),
      barangays: parseList(json['barangays'], BarangayItem.fromJson),
      notifications: parseList(json['notifications'], AppNotification.fromJson),
      isOffline: false,
    );
  }

  factory MobileBootstrap.fallback() {
    return MobileBootstrap(
      destinations: const [],
      featuredDestinations: const [],
      countries: const [RefItem(id: 1, name: 'Philippines')],
      regions: const [RefItem(id: 4, name: 'CALABARZON Region')],
      provinces: const [RefItem(id: 1, name: 'Quezon')],
      itineraries: const [
        RefItem(id: 2, name: 'Day Tour'),
        RefItem(id: 1, name: 'Overnight'),
        RefItem(id: 3, name: '2 Nights'),
      ],
      travelModes: const [
        RefItem(id: 1, name: 'Private Vehicle'),
        RefItem(id: 2, name: 'Public Utility Vehicle'),
      ],
      boatTypes: const [
        RefItem(id: 1, name: 'Public Boat'),
        RefItem(id: 2, name: 'Private Boat'),
      ],
      visitPurposes: const [
        RefItem(id: 1, name: 'Leisure'),
        RefItem(id: 3, name: 'Business'),
      ],
      barangays: const [
        BarangayItem(id: 1, name: 'Poblacion'),
        BarangayItem(id: 2, name: 'San Isidro'),
        BarangayItem(id: 3, name: 'Cagsiay'),
      ],
      notifications: AppNotification.fallback(),
      isOffline: true,
    );
  }
}

class SanitationBootstrap {
  const SanitationBootstrap({
    required this.businessTypes,
    required this.establishments,
    required this.inspections,
    required this.complaints,
    required this.householdRecords,
    required this.barangays,
    required this.notifications,
    this.offlineMessage = 'Only submitted reports in this session are visible.',
    this.isOffline = false,
  });

  final List<SanitationBusinessType> businessTypes;
  final List<SanitationEstablishment> establishments;
  final List<SanitationInspectionItem> inspections;
  final List<SanitationComplaintItem> complaints;
  final List<HouseholdSanitationItem> householdRecords;
  final List<BarangayItem> barangays;
  final List<AppNotification> notifications;
  final String offlineMessage;
  final bool isOffline;

  factory SanitationBootstrap.fromJson(Map<String, dynamic> json) {
    return SanitationBootstrap(
      businessTypes: parseList(
        json['businessTypes'],
        SanitationBusinessType.fromJson,
      ),
      establishments: parseList(
        json['establishments'],
        SanitationEstablishment.fromJson,
      ),
      inspections: parseList(
        json['inspections'],
        SanitationInspectionItem.fromJson,
      ),
      complaints: parseList(
        (json['complaintData'] as Map<String, dynamic>?)?['rows'],
        SanitationComplaintItem.fromJson,
      ),
      householdRecords: parseList(
        json['householdRecords'],
        HouseholdSanitationItem.fromJson,
      ),
      barangays: parseList(json['barangays'], BarangayItem.fromJson),
      notifications: parseList(json['notifications'], AppNotification.fromJson),
      isOffline: false,
    );
  }

  factory SanitationBootstrap.fallback({String? message}) {
    return SanitationBootstrap(
      businessTypes: const [],
      establishments: const [],
      inspections: const [],
      complaints: const [],
      householdRecords: const [],
      barangays: const [
        BarangayItem(id: 1, name: 'Poblacion'),
        BarangayItem(id: 2, name: 'San Isidro'),
        BarangayItem(id: 3, name: 'Cagsiay'),
      ],
      notifications: const [
        AppNotification(
          id: 'offline-sanitation',
          title: 'Cannot reach Sanitary Web System',
          message: 'Connect the backend API to load establishment records.',
          type: 'sanitation',
        ),
      ],
      offlineMessage:
          message ?? 'Only submitted reports in this session are visible.',
      isOffline: true,
    );
  }
}

class SanitationBusinessType {
  const SanitationBusinessType({
    required this.id,
    required this.name,
    required this.inspectionFrequency,
    required this.requirements,
  });

  final int id;
  final String name;
  final String inspectionFrequency;
  final List<SanitationRequirement> requirements;

  factory SanitationBusinessType.fromJson(Map<String, dynamic> json) {
    return SanitationBusinessType(
      id: jsonInt(json['id']),
      name: '${json['name'] ?? ''}',
      inspectionFrequency: '${json['inspection_frequency'] ?? 'monthly'}',
      requirements: parseList(
        json['requirements'],
        SanitationRequirement.fromJson,
      ),
    );
  }
}

class SanitationRequirement {
  const SanitationRequirement({required this.requirementName});

  final String requirementName;

  factory SanitationRequirement.fromJson(Map<String, dynamic> json) {
    return SanitationRequirement(
      requirementName: '${json['requirement_name'] ?? ''}',
    );
  }
}

class SanitationEstablishment {
  const SanitationEstablishment({
    required this.id,
    required this.businessName,
    required this.ownerName,
    required this.businessTypeId,
    required this.businessTypeName,
    required this.inspectionFrequency,
    required this.barangay,
    required this.address,
    required this.permitNumber,
    required this.permitExpiryDate,
    required this.complianceStatus,
    required this.statusLabel,
    required this.permitStatus,
    required this.permitStatusLabel,
    required this.latitude,
    required this.longitude,
  });

  final int id;
  final String businessName;
  final String ownerName;
  final int businessTypeId;
  final String businessTypeName;
  final String inspectionFrequency;
  final String barangay;
  final String address;
  final String permitNumber;
  final String permitExpiryDate;
  final String complianceStatus;
  final String statusLabel;
  final String permitStatus;
  final String permitStatusLabel;
  final double latitude;
  final double longitude;

  bool get hasCoordinates => latitude.abs() > 0.001 && longitude.abs() > 0.001;

  factory SanitationEstablishment.fromJson(Map<String, dynamic> json) {
    return SanitationEstablishment(
      id: jsonInt(json['id']),
      businessName: '${json['business_name'] ?? 'Establishment'}',
      ownerName: '${json['owner_name'] ?? ''}',
      businessTypeId: jsonInt(json['business_type']),
      businessTypeName: '${json['business_type_name'] ?? 'Establishment'}',
      inspectionFrequency: '${json['inspection_frequency'] ?? 'monthly'}',
      barangay: '${json['barangay'] ?? 'Unspecified'}',
      address: '${json['address'] ?? ''}',
      permitNumber: '${json['permit_number'] ?? ''}',
      permitExpiryDate: '${json['permit_expiry_date'] ?? ''}',
      complianceStatus: '${json['compliance_status'] ?? 'upcoming'}',
      statusLabel: '${json['compliance_status_label'] ?? 'Upcoming'}',
      permitStatus: '${json['permit_status'] ?? 'renewal_due'}',
      permitStatusLabel: '${json['permit_status_label'] ?? 'Renewal Due'}',
      latitude: jsonDouble(json['latitude']),
      longitude: jsonDouble(json['longitude']),
    );
  }

  static SanitationEstablishment placeholder() {
    return const SanitationEstablishment(
      id: 0,
      businessName: 'No establishment loaded',
      ownerName: '',
      businessTypeId: 0,
      businessTypeName: 'Establishment',
      inspectionFrequency: 'monthly',
      barangay: 'Unspecified',
      address: '',
      permitNumber: '',
      permitExpiryDate: '',
      complianceStatus: 'upcoming',
      statusLabel: 'Upcoming',
      permitStatus: 'renewal_due',
      permitStatusLabel: 'Renewal Due',
      latitude: 0,
      longitude: 0,
    );
  }
}

class SanitationInspectionItem {
  const SanitationInspectionItem({
    required this.id,
    required this.establishmentName,
    required this.inspectorName,
    required this.inspectionDate,
    required this.status,
  });

  final int id;
  final String establishmentName;
  final String inspectorName;
  final String inspectionDate;
  final String status;

  factory SanitationInspectionItem.fromJson(Map<String, dynamic> json) {
    return SanitationInspectionItem(
      id: jsonInt(json['id']),
      establishmentName: '${json['establishment_name'] ?? 'Establishment'}',
      inspectorName: '${json['inspector_name'] ?? ''}',
      inspectionDate: '${json['inspection_date'] ?? ''}',
      status: '${json['status_after_inspection'] ?? 'upcoming'}',
    );
  }
}

class SanitationComplaintItem {
  const SanitationComplaintItem({
    required this.reference,
    required this.category,
    required this.barangay,
    required this.description,
    required this.status,
    required this.statusLabel,
    required this.priority,
    required this.actionTaken,
  });

  final String reference;
  final String category;
  final String barangay;
  final String description;
  final String status;
  final String statusLabel;
  final String priority;
  final String actionTaken;

  factory SanitationComplaintItem.fromJson(Map<String, dynamic> json) {
    return SanitationComplaintItem(
      reference: '${json['complaint_id'] ?? json['id'] ?? ''}',
      category: '${json['category'] ?? 'Sanitation concern'}',
      barangay: '${json['barangay'] ?? 'Unspecified'}',
      description: '${json['description'] ?? ''}',
      status: '${json['status'] ?? 'pending'}',
      statusLabel:
          '${json['status_label'] ?? sanitationStatusLabel('${json['status'] ?? 'pending'}')}',
      priority: '${json['priority'] ?? 'medium'}',
      actionTaken: '${json['action_taken'] ?? ''}',
    );
  }
}

class HouseholdSanitationItem {
  const HouseholdSanitationItem({
    required this.householdCode,
    required this.householdHead,
    required this.barangay,
    required this.status,
    required this.latitude,
    required this.longitude,
  });

  final String householdCode;
  final String householdHead;
  final String barangay;
  final String status;
  final double latitude;
  final double longitude;

  bool get hasCoordinates => latitude.abs() > 0.001 && longitude.abs() > 0.001;

  factory HouseholdSanitationItem.fromJson(Map<String, dynamic> json) {
    return HouseholdSanitationItem(
      householdCode: '${json['household_code'] ?? ''}',
      householdHead: '${json['household_head'] ?? 'Household'}',
      barangay: '${json['barangay'] ?? 'Unspecified'}',
      status: '${json['status'] ?? 'good_standing'}',
      latitude: jsonDouble(json['latitude']),
      longitude: jsonDouble(json['longitude']),
    );
  }
}

class InspectionChecklistDraft {
  const InspectionChecklistDraft(this.requirementName, this.isComplied);

  final String requirementName;
  final bool isComplied;
}

class MobileUserProfile {
  const MobileUserProfile({
    required this.name,
    required this.email,
    required this.contactNumber,
  });

  final String name;
  final String email;
  final String contactNumber;

  factory MobileUserProfile.guest() {
    return const MobileUserProfile(name: '', email: '', contactNumber: '');
  }

  bool get isGuest => name.trim().isEmpty;

  String get displayName => isGuest ? 'Mauban Tourism' : name.trim();

  String get initials {
    if (isGuest) return 'MT';
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'MT';
    return parts
        .take(2)
        .map((part) => part.characters.first.toUpperCase())
        .join();
  }

  MobileUserProfile copyWith({
    String? name,
    String? email,
    String? contactNumber,
  }) {
    return MobileUserProfile(
      name: cleanProfileValue(name) ?? this.name,
      email: cleanProfileValue(email) ?? this.email,
      contactNumber: cleanProfileValue(contactNumber) ?? this.contactNumber,
    );
  }
}

class Destination {
  const Destination({
    required this.id,
    required this.name,
    required this.type,
    required this.location,
    required this.description,
    required this.rating,
    required this.imageKey,
    required this.monthlyArrivals,
    required this.hasMayorPermit,
    required this.access,
    required this.latitude,
    required this.longitude,
  });

  final int id;
  final String name;
  final String type;
  final String location;
  final String description;
  final double rating;
  final String imageKey;
  final int monthlyArrivals;
  final bool hasMayorPermit;
  final String access;
  final double latitude;
  final double longitude;

  bool get hasCoordinates => latitude.abs() > 0.001 && longitude.abs() > 0.001;
  String get permitLabel =>
      hasMayorPermit ? 'Mayor\'s permit verified' : 'Permit not verified';
  String get visitorsLabel =>
      '${formatCount(monthlyArrivals)} visitor arrivals';

  factory Destination.fromJson(Map<String, dynamic> json) {
    return Destination(
      id: jsonInt(json['resort_id']),
      name: cleanDestinationName('${json['resort_name'] ?? 'Destination'}'),
      type: '${json['type'] ?? 'Tourism Site'}',
      location: '${json['location'] ?? 'Mauban, Quezon'}',
      description: '${json['short_description'] ?? ''}',
      rating: jsonDouble(json['tourism_rating'], 4.5),
      imageKey: '${json['image_key'] ?? ''}',
      monthlyArrivals: jsonInt(json['monthly_arrivals']),
      hasMayorPermit: jsonBool(json['with_mayors_permit']),
      access: '${json['access'] ?? ''}',
      latitude: jsonDouble(json['latitude'], 14.18),
      longitude: jsonDouble(json['longitude'], 121.73),
    );
  }

  static Destination placeholder() {
    return const Destination(
      id: 0,
      name: 'No destination loaded',
      type: 'Tourism Site',
      location: 'Mauban, Quezon',
      description: 'Connect to the web system to load ranked destinations.',
      rating: 0,
      imageKey: '',
      monthlyArrivals: 0,
      hasMayorPermit: false,
      access: '',
      latitude: 14.185,
      longitude: 121.731,
    );
  }
}

class RefItem {
  const RefItem({
    required this.id,
    required this.name,
    this.regionId,
    this.code = '',
  });

  final int id;
  final String name;
  final int? regionId;
  final String code;

  factory RefItem.fromJson(Map<String, dynamic> json) {
    return RefItem(
      id: jsonInt(json['id']),
      name: '${json['name'] ?? ''}',
      regionId: jsonNullableInt(json['region_id']),
      code: '${json['code'] ?? ''}',
    );
  }

  @override
  bool operator ==(Object other) {
    return other is RefItem &&
        other.id == id &&
        other.regionId == regionId &&
        other.name == name;
  }

  @override
  int get hashCode => Object.hash(id, regionId, name);
}

class BarangayItem {
  const BarangayItem({required this.id, required this.name});

  final int id;
  final String name;

  factory BarangayItem.fromJson(Map<String, dynamic> json) {
    return BarangayItem(id: jsonInt(json['id']), name: '${json['name'] ?? ''}');
  }
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
  });

  final String id;
  final String title;
  final String message;
  final String type;

  IconData get icon {
    if (type == 'sanitation') return Icons.health_and_safety_outlined;
    if (type == 'tourism') return Icons.explore_outlined;
    return Icons.info_outline;
  }

  Color get color {
    if (type == 'sanitation') return Colors.orange;
    if (type == 'tourism') return AppColors.green;
    return Colors.blue;
  }

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: '${json['id'] ?? ''}',
      title: '${json['title'] ?? 'Notification'}',
      message: '${json['message'] ?? ''}',
      type: '${json['type'] ?? 'info'}',
    );
  }

  static List<AppNotification> fallback() {
    return const [
      AppNotification(
        id: 'welcome',
        title: 'Welcome to Mauban',
        message:
            'Explore destinations, guides, maps, and registration services.',
        type: 'tourism',
      ),
      AppNotification(
        id: 'report',
        title: 'Community Report Available',
        message: 'Residents can submit sanitation concerns to the LGU.',
        type: 'sanitation',
      ),
    ];
  }
}

class MobileVisitReceipt {
  const MobileVisitReceipt({
    required this.reference,
    required this.destination,
    required this.arrivalDate,
    required this.totalVisitors,
    required this.status,
    required this.fullName,
    required this.contactNumber,
    required this.email,
  });

  final String reference;
  final Destination destination;
  final DateTime arrivalDate;
  final int totalVisitors;
  final String status;
  final String fullName;
  final String contactNumber;
  final String email;
  String get displayStatus => statusLabel(status);

  factory MobileVisitReceipt.fromResponse(
    Map<String, dynamic> json, {
    required Destination destination,
    required DateTime arrivalDate,
    required int totalVisitors,
  }) {
    return MobileVisitReceipt(
      reference: '${json['survey_id'] ?? 'Pending sync'}',
      destination: destination,
      arrivalDate: arrivalDate,
      totalVisitors: jsonInt(json['total_visitors'], totalVisitors),
      status: '${json['status'] ?? 'pending'}',
      fullName: '${json['full_name'] ?? ''}',
      contactNumber: '${json['contact_number'] ?? ''}',
      email: '${json['email'] ?? ''}',
    );
  }
}

class MobileFeedbackReceipt {
  const MobileFeedbackReceipt({
    required this.reference,
    required this.destination,
    required this.reviewer,
    required this.rating,
  });

  final String reference;
  final Destination destination;
  final String reviewer;
  final int rating;

  factory MobileFeedbackReceipt.fromResponse(
    Map<String, dynamic> json, {
    required Destination destination,
    required String reviewer,
    required int rating,
  }) {
    return MobileFeedbackReceipt(
      reference: '${json['id'] ?? 'Pending sync'}',
      destination: destination,
      reviewer: '${json['reviewer'] ?? reviewer}',
      rating: jsonInt(json['rating'], rating),
    );
  }
}

class MobileSanitationReceipt {
  const MobileSanitationReceipt({
    required this.reference,
    required this.category,
    required this.barangay,
    required this.status,
    required this.statusLabel,
    required this.priority,
    required this.priorityLabel,
    required this.actionTaken,
    required this.reportedDate,
  });

  final String reference;
  final String category;
  final String barangay;
  final String status;
  final String statusLabel;
  final String priority;
  final String priorityLabel;
  final String actionTaken;
  final String reportedDate;

  factory MobileSanitationReceipt.fromResponse(
    Map<String, dynamic> json, {
    required String category,
    required String barangay,
  }) {
    return MobileSanitationReceipt.fromJson(
      json,
      fallbackCategory: category,
      fallbackBarangay: barangay,
    );
  }

  factory MobileSanitationReceipt.fromJson(
    Map<String, dynamic> json, {
    String fallbackCategory = 'Sanitation concern',
    String fallbackBarangay = 'Unspecified',
  }) {
    final status = '${json['status'] ?? 'pending'}';
    final priority = '${json['priority'] ?? 'medium'}';
    return MobileSanitationReceipt(
      reference: '${json['complaint_id'] ?? 'Pending sync'}',
      category: '${json['category'] ?? fallbackCategory}',
      barangay: '${json['barangay'] ?? fallbackBarangay}',
      status: status,
      statusLabel: '${json['status_label'] ?? sanitationStatusLabel(status)}',
      priority: priority,
      priorityLabel:
          '${json['priority_label'] ?? sanitationPriorityLabel(priority)}',
      actionTaken: '${json['action_taken'] ?? ''}',
      reportedDate: '${json['reported_date'] ?? ''}',
    );
  }
}

class SanitationReportDraft {
  const SanitationReportDraft({
    required this.id,
    required this.name,
    required this.contactNumber,
    required this.category,
    required this.priority,
    required this.barangay,
    required this.description,
    required this.latitude,
    required this.longitude,
    required this.isAnonymous,
    required this.createdAt,
  });

  final String id;
  final String name;
  final String contactNumber;
  final String category;
  final String priority;
  final String barangay;
  final String description;
  final String latitude;
  final String longitude;
  final bool isAnonymous;
  final String createdAt;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'contact_number': contactNumber,
      'category': category,
      'priority': priority,
      'barangay': barangay,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
      'is_anonymous': isAnonymous,
      'created_at': createdAt,
    };
  }

  factory SanitationReportDraft.fromJson(Map<String, dynamic> json) {
    return SanitationReportDraft(
      id: '${json['id'] ?? DateTime.now().millisecondsSinceEpoch}',
      name: '${json['name'] ?? ''}',
      contactNumber: '${json['contact_number'] ?? ''}',
      category: '${json['category'] ?? sanitationReportCategories.first}',
      priority: '${json['priority'] ?? 'medium'}',
      barangay: '${json['barangay'] ?? 'Poblacion'}',
      description: '${json['description'] ?? ''}',
      latitude: '${json['latitude'] ?? ''}',
      longitude: '${json['longitude'] ?? ''}',
      isAnonymous: json['is_anonymous'] == true,
      createdAt: '${json['created_at'] ?? ''}',
    );
  }

  SanitationReportDraft copyWith({
    String? id,
    String? name,
    String? contactNumber,
    String? category,
    String? priority,
    String? barangay,
    String? description,
    String? latitude,
    String? longitude,
    bool? isAnonymous,
    String? createdAt,
  }) {
    return SanitationReportDraft(
      id: id ?? this.id,
      name: name ?? this.name,
      contactNumber: contactNumber ?? this.contactNumber,
      category: category ?? this.category,
      priority: priority ?? this.priority,
      barangay: barangay ?? this.barangay,
      description: description ?? this.description,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      isAnonymous: isAnonymous ?? this.isAnonymous,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

class SanitationDraftStore {
  const SanitationDraftStore._();

  static Future<List<SanitationReportDraft>> loadReports() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(sanitationReportDraftsKey) ?? [];
    return raw
        .map((item) {
          try {
            return SanitationReportDraft.fromJson(
              Map<String, dynamic>.from(jsonDecode(item) as Map),
            );
          } catch (_) {
            return null;
          }
        })
        .whereType<SanitationReportDraft>()
        .toList();
  }

  static Future<void> saveReports(List<SanitationReportDraft> drafts) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      sanitationReportDraftsKey,
      drafts.map((item) => jsonEncode(item.toJson())).toList(),
    );
  }

  static Future<void> upsertReport(SanitationReportDraft draft) async {
    final drafts = await loadReports();
    final index = drafts.indexWhere((item) => item.id == draft.id);
    if (index >= 0) {
      drafts[index] = draft;
    } else {
      drafts.insert(0, draft);
    }
    await saveReports(drafts);
  }

  static Future<void> removeReport(String id) async {
    final drafts = await loadReports();
    drafts.removeWhere((item) => item.id == id);
    await saveReports(drafts);
  }
}

class PermitVerificationResult {
  const PermitVerificationResult({
    required this.verified,
    required this.code,
    required this.establishment,
    required this.permitStatusLabel,
    required this.complianceStatusLabel,
    required this.expiryDate,
  });

  final bool verified;
  final String code;
  final SanitationEstablishment establishment;
  final String permitStatusLabel;
  final String complianceStatusLabel;
  final String expiryDate;

  factory PermitVerificationResult.fromJson(Map<String, dynamic> json) {
    final permit = Map<String, dynamic>.from(json['permit'] as Map? ?? {});
    final permitStatus = '${permit['permit_status'] ?? ''}';
    final complianceStatus = '${permit['compliance_status'] ?? ''}';
    return PermitVerificationResult(
      verified: jsonBool(json['verified']),
      code: '${json['code'] ?? ''}',
      establishment: SanitationEstablishment.fromJson(
        Map<String, dynamic>.from(json['establishment'] as Map? ?? {}),
      ),
      permitStatusLabel:
          '${permit['permit_status_label'] ?? sanitationStatusLabel(permitStatus)}',
      complianceStatusLabel:
          '${permit['compliance_status_label'] ?? sanitationStatusLabel(complianceStatus)}',
      expiryDate: '${permit['permit_expiry_date'] ?? ''}',
    );
  }
}

class MobileSanitationInspectionReceipt {
  const MobileSanitationInspectionReceipt({
    required this.reference,
    required this.establishmentName,
    required this.inspectorName,
    required this.inspectionDate,
    required this.status,
  });

  final String reference;
  final String establishmentName;
  final String inspectorName;
  final String inspectionDate;
  final String status;

  factory MobileSanitationInspectionReceipt.fromResponse(
    Map<String, dynamic> json, {
    required SanitationEstablishment establishment,
    required String inspectorName,
    required String status,
    required String inspectionDate,
  }) {
    return MobileSanitationInspectionReceipt(
      reference: '${json['id'] ?? 'Saved'}',
      establishmentName:
          '${json['establishment_name'] ?? establishment.businessName}',
      inspectorName: '${json['inspector_name'] ?? inspectorName}',
      inspectionDate: '${json['inspection_date'] ?? inspectionDate}',
      status: '${json['status_after_inspection'] ?? status}',
    );
  }
}

class AppHeader extends StatelessWidget {
  const AppHeader({super.key, required this.onOpenNotifications});

  final VoidCallback onOpenNotifications;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Image.asset('assets/tourism_logo.jpg', width: 34, height: 34),
        const SizedBox(width: 8),
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome to',
                style: TextStyle(fontSize: 11, color: AppColors.muted),
              ),
              Text(
                'Mauban Tourism',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
              ),
            ],
          ),
        ),
        IconButton(
          onPressed: onOpenNotifications,
          icon: const Icon(Icons.notifications_outlined),
        ),
      ],
    );
  }
}

class PageTitle extends StatelessWidget {
  const PageTitle({super.key, required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(
              color: AppColors.muted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class SearchBox extends StatelessWidget {
  const SearchBox({super.key, required this.hint, this.onChanged});

  final String hint;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      onChanged: onChanged,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Icon(Icons.search),
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
      ),
    );
  }
}

class HeroCard extends StatelessWidget {
  const HeroCard({super.key, required this.destination});

  final Destination destination;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Stack(
        children: [
          DestinationImage(destination: destination, height: 170),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.65),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 16,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  destination.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  destination.location,
                  style: const TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 6),
                VisitorPill(destination: destination, dark: true),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class DestinationImage extends StatelessWidget {
  const DestinationImage({
    super.key,
    required this.destination,
    this.height,
    this.width,
  });

  final Destination destination;
  final double? height;
  final double? width;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      imageAssetFor(destination.imageKey),
      height: height,
      width: width ?? double.infinity,
      fit: BoxFit.cover,
    );
  }
}

class QuickAction extends StatelessWidget {
  const QuickAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Column(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.green.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: AppColors.green),
              ),
              const SizedBox(height: 7),
              Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.action,
    this.onTap,
  });

  final String title;
  final String? action;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 22, bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
          ),
          if (action != null)
            TextButton(onPressed: onTap, child: Text(action!)),
        ],
      ),
    );
  }
}

class DestinationTile extends StatelessWidget {
  const DestinationTile({
    super.key,
    required this.destination,
    required this.onTap,
  });

  final Destination destination;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 170,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Stack(
            fit: StackFit.expand,
            children: [
              DestinationImage(destination: destination),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.72),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 12,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      destination.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      destination.type,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 6),
                    VisitorPill(destination: destination, dark: true),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class DestinationListCard extends StatelessWidget {
  const DestinationListCard({
    super.key,
    required this.destination,
    required this.onTap,
  });

  final Destination destination;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: DestinationImage(
                  destination: destination,
                  width: 86,
                  height: 72,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      destination.name,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      destination.location,
                      style: const TextStyle(
                        color: AppColors.muted,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      destination.visitorsLabel,
                      style: const TextStyle(
                        color: AppColors.deepGreen,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        RatingPill(rating: destination.rating),
                        const SizedBox(width: 8),
                        Expanded(child: StatusPill(text: destination.type)),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}

class RatingPill extends StatelessWidget {
  const RatingPill({super.key, required this.rating});

  final double rating;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xfffff3bd),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.star, size: 14, color: Color(0xffe6a100)),
          const SizedBox(width: 3),
          Text(
            rating.toStringAsFixed(1),
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}

class VisitorPill extends StatelessWidget {
  const VisitorPill({super.key, required this.destination, this.dark = false});

  final Destination destination;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: dark
            ? Colors.white.withValues(alpha: 0.18)
            : const Color(0xffecfdf3),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.groups_outlined,
            size: 14,
            color: dark ? Colors.white : AppColors.green,
          ),
          const SizedBox(width: 4),
          Text(
            '${formatCount(destination.monthlyArrivals)} visits',
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              color: dark ? Colors.white : AppColors.deepGreen,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class PermitPill extends StatelessWidget {
  const PermitPill({super.key, required this.verified});

  final bool verified;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: verified ? const Color(0xffdcfce7) : const Color(0xfffff3bd),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            verified ? Icons.verified_outlined : Icons.info_outline,
            size: 14,
            color: verified ? AppColors.green : const Color(0xff9a6700),
          ),
          const SizedBox(width: 4),
          Text(
            verified ? 'Permit verified' : 'Permit not verified',
            style: TextStyle(
              fontSize: 11,
              color: verified ? AppColors.green : const Color(0xff9a6700),
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xffdcfce7),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontSize: 11,
          color: AppColors.green,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.icon,
    required this.title,
    required this.text,
    required this.color,
  });

  final IconData icon;
  final String title;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.green),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 3),
                Text(
                  text,
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class DataSourceBanner extends StatelessWidget {
  const DataSourceBanner({
    super.key,
    required this.icon,
    required this.title,
    required this.text,
    this.warning = false,
  });

  final IconData icon;
  final String title;
  final String text;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: warning ? const Color(0xfffff3bd) : const Color(0xffecfdf3),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: warning ? const Color(0xffffd267) : const Color(0xffb7e8c6),
        ),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.green),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 3),
                Text(
                  text,
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class MapPin extends StatelessWidget {
  const MapPin({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.green,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 8,
            offset: Offset(0, 3),
          ),
        ],
      ),
      child: const Icon(Icons.location_on, color: Colors.white, size: 24),
    );
  }
}

class TripSummaryCard extends StatelessWidget {
  const TripSummaryCard({super.key, required this.destination});

  final Destination? destination;

  @override
  Widget build(BuildContext context) {
    final item = destination;
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Your Trip',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
            ),
            const SizedBox(height: 12),
            if (item == null)
              const EmptyState(
                icon: Icons.travel_explore_outlined,
                title: 'No trip destination loaded yet',
              )
            else
              DestinationListCard(destination: item, onTap: () {}),
            const Divider(),
            const Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                MiniTripStat(
                  icon: Icons.group_outlined,
                  label: 'Tourists',
                  value: '1',
                ),
                MiniTripStat(
                  icon: Icons.calendar_month_outlined,
                  label: 'Visit',
                  value: 'Soon',
                ),
                MiniTripStat(
                  icon: Icons.place_outlined,
                  label: 'Status',
                  value: 'Planning',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class MiniTripStat extends StatelessWidget {
  const MiniTripStat({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: AppColors.green),
        const SizedBox(height: 5),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w900)),
        Text(
          label,
          style: const TextStyle(color: AppColors.muted, fontSize: 11),
        ),
      ],
    );
  }
}

class PlanVisitForm extends StatefulWidget {
  const PlanVisitForm({super.key, required this.destinations});

  final List<Destination> destinations;

  @override
  State<PlanVisitForm> createState() => _PlanVisitFormState();
}

class _PlanVisitFormState extends State<PlanVisitForm> {
  late Destination _destination;
  DateTime? _date;
  final TextEditingController _activities = TextEditingController();
  final List<String> _itinerary = [];

  @override
  void initState() {
    super.initState();
    _destination = widget.destinations.firstOrNull ?? Destination.placeholder();
  }

  @override
  void dispose() {
    _activities.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.destinations.isEmpty) {
      return const Card(
        elevation: 0,
        color: Colors.white,
        child: Padding(
          padding: EdgeInsets.all(14),
          child: EmptyState(
            icon: Icons.travel_explore_outlined,
            title: 'No destinations available for planning yet',
          ),
        ),
      );
    }

    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DropdownTile<Destination>(
              label: 'Destination',
              value: _destination,
              items: widget.destinations,
              itemLabel: (item) => item.name,
              onChanged: (item) => setState(() => _destination = item),
            ),
            PickerTile(
              icon: Icons.calendar_month_outlined,
              label: 'Date',
              value: _date == null ? 'Pick a date' : shortDate(_date!),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: DateTime.now(),
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (picked != null) setState(() => _date = picked);
              },
            ),
            AppTextField(
              controller: _activities,
              label: 'Activities',
              maxLines: 3,
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: () {
                setState(() {
                  _itinerary.add(
                    '${_destination.name} - ${_activities.text.trim().isEmpty ? 'Visit and explore' : _activities.text.trim()}',
                  );
                  _activities.clear();
                });
              },
              icon: const Icon(Icons.add),
              label: const Text('Add to itinerary'),
            ),
            const SizedBox(height: 12),
            const Text(
              'Your Itinerary',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            if (_itinerary.isEmpty)
              const Text(
                'No stops yet. Add your first stop above.',
                style: TextStyle(color: AppColors.muted),
              )
            else
              ..._itinerary.map(
                (item) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.check_circle_outline),
                  title: Text(item),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class LocationCard extends StatelessWidget {
  const LocationCard({super.key, required this.destination});

  final Destination destination;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: ListTile(
        leading: const CircleAvatar(
          backgroundColor: Color(0xffdcfce7),
          child: Icon(Icons.navigation_outlined, color: AppColors.green),
        ),
        title: const Text(
          'View on map',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Text('${destination.latitude}, ${destination.longitude}'),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class DestinationFactsPanel extends StatelessWidget {
  const DestinationFactsPanel({super.key, required this.destination});

  final Destination destination;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            FactRow(
              icon: Icons.groups_outlined,
              label: 'Visitor arrivals',
              value: destination.visitorsLabel,
            ),
            FactRow(
              icon: Icons.category_outlined,
              label: 'Category',
              value: destination.type,
            ),
            FactRow(
              icon: Icons.verified_outlined,
              label: 'Permit status',
              value: destination.permitLabel,
            ),
            FactRow(
              icon: Icons.route_outlined,
              label: 'Access',
              value: destination.access.isEmpty
                  ? 'Not specified'
                  : destination.access,
            ),
          ],
        ),
      ),
    );
  }
}

class FactRow extends StatelessWidget {
  const FactRow({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Icon(icon, color: AppColors.green, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: AppColors.muted,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ],
      ),
    );
  }
}

class AmenityChip extends StatelessWidget {
  const AmenityChip({super.key, required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(icon, size: 16),
      label: Text(label),
      backgroundColor: const Color(0xffe9f8ef),
      side: BorderSide.none,
    );
  }
}

class FormPageScaffold extends StatelessWidget {
  const FormPageScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
          children: [
            Text(
              subtitle,
              style: const TextStyle(
                color: AppColors.muted,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 16),
            ...children,
          ],
        ),
      ),
    );
  }
}

class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.controller,
    required this.label,
    this.maxLines = 1,
    this.keyboardType,
    this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final int maxLines;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        keyboardType: keyboardType,
        onChanged: onChanged,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.border),
          ),
        ),
      ),
    );
  }
}

class DropdownTile<T> extends StatelessWidget {
  const DropdownTile({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.itemLabel,
    required this.onChanged,
  });

  final String label;
  final T value;
  final List<T> items;
  final String Function(T item) itemLabel;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final choices = items.isEmpty ? [value] : items;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DropdownButtonFormField<T>(
        initialValue: value,
        items: choices
            .map(
              (item) => DropdownMenuItem<T>(
                value: item,
                child: Text(itemLabel(item), overflow: TextOverflow.ellipsis),
              ),
            )
            .toList(),
        onChanged: (item) {
          if (item != null) onChanged(item);
        },
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.border),
          ),
        ),
      ),
    );
  }
}

class PickerTile extends StatelessWidget {
  const PickerTile({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Icon(icon, color: AppColors.green),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.muted,
                      ),
                    ),
                    Text(
                      value,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CounterPanel extends StatelessWidget {
  const CounterPanel({super.key, required this.title, required this.counters});

  final String title;
  final List<CounterItem> counters;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            ...counters.map((item) => CounterRow(item: item)),
          ],
        ),
      ),
    );
  }
}

class CounterRow extends StatelessWidget {
  const CounterRow({super.key, required this.item});

  final CounterItem item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              item.label,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          IconButton.filledTonal(
            onPressed: item.value > 0
                ? () => item.onChanged(item.value - 1)
                : null,
            icon: const Icon(Icons.remove),
          ),
          SizedBox(
            width: 38,
            child: Center(
              child: Text(
                '${item.value}',
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
          ),
          IconButton.filledTonal(
            onPressed: () => item.onChanged(item.value + 1),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
    );
  }
}

class CounterItem {
  const CounterItem(this.label, this.value, this.onChanged);

  final String label;
  final int value;
  final ValueChanged<int> onChanged;
}

class RatingSelector extends StatelessWidget {
  const RatingSelector({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Row(
            children: List.generate(
              5,
              (index) => IconButton(
                onPressed: () => onChanged(index + 1),
                icon: Icon(
                  index < value ? Icons.star : Icons.star_border,
                  color: const Color(0xffe6a100),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class SubmitButton extends StatelessWidget {
  const SubmitButton({
    super.key,
    required this.label,
    required this.loading,
    required this.onPressed,
    this.loadingLabel = 'Submitting...',
  });

  final String label;
  final bool loading;
  final VoidCallback onPressed;
  final String loadingLabel;

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: loading ? null : onPressed,
      icon: loading
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.send_outlined),
      label: Text(loading ? loadingLabel : label),
    );
  }
}

class ProfileTile extends StatelessWidget {
  const ProfileTile({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: ListTile(
        leading: Icon(icon),
        title: Text(
          label,
          style: const TextStyle(fontSize: 12, color: AppColors.muted),
        ),
        subtitle: Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
    );
  }
}

class ProfileLink extends StatelessWidget {
  const ProfileLink({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: ListTile(
        onTap: onTap,
        leading: Icon(icon),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class AppColors {
  static const green = Color(0xff28a84a);
  static const deepGreen = Color(0xff0c6b3f);
  static const canvas = Color(0xfff2f7f4);
  static const ink = Color(0xff111827);
  static const muted = Color(0xff6b7280);
  static const border = Color(0xffd8e1dc);
}

class IntroItem {
  const IntroItem({
    required this.icon,
    required this.title,
    required this.text,
    required this.color,
  });

  final IconData icon;
  final String title;
  final String text;
  final Color color;
}

extension FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;

  T? firstWhereOrNull(bool Function(T item) test) {
    for (final item in this) {
      if (test(item)) return item;
    }
    return null;
  }
}

List<T> parseList<T>(Object? value, T Function(Map<String, dynamic>) parser) {
  if (value is! List) return [];
  return value
      .whereType<Map>()
      .map((item) => parser(Map<String, dynamic>.from(item)))
      .toList();
}

int jsonInt(Object? value, [int fallback = 0]) {
  if (value is int) return value;
  return int.tryParse('$value') ?? fallback;
}

int? jsonNullableInt(Object? value) {
  if (value == null) return null;
  if (value is int) return value;
  return int.tryParse('$value');
}

bool jsonBool(Object? value, [bool fallback = false]) {
  if (value is bool) return value;
  final text = '$value'.toLowerCase().trim();
  if (text == 'true' || text == '1' || text == 'yes') return true;
  if (text == 'false' || text == '0' || text == 'no') return false;
  return fallback;
}

double jsonDouble(Object? value, [double fallback = 0]) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? fallback;
}

LatLng? latLngFromText(String latitude, String longitude) {
  final lat = double.tryParse(latitude.trim());
  final lng = double.tryParse(longitude.trim());
  if (lat == null || lng == null) return null;
  if (lat.abs() < 0.001 || lng.abs() < 0.001) return null;
  return LatLng(lat, lng);
}

int clampInt(int value, int min, int max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

String imageAssetFor(String imageKey) {
  switch (imageKey) {
    case 'cagbalete':
      return 'assets/destinations/cagbalete.jpg';
    case 'dampalitan-island':
      return 'assets/destinations/dampalitan.jpg';
    case 'mauban-lighthouse':
      return 'assets/destinations/mauban_lighthouse.jpg';
    case 'mt-pinagbanderahan':
      return 'assets/destinations/mt_pinagbanderahan.jpg';
    case 'puting-buhangin':
      return 'assets/destinations/puting_buhangin.jpg';
    default:
      return 'assets/mauban_map.png';
  }
}

String isoDate(DateTime date) {
  return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}

String shortDate(DateTime date) {
  return '${date.month}/${date.day}/${date.year}';
}

String? cleanProfileValue(String? value) {
  final trimmed = value?.trim() ?? '';
  return trimmed.isEmpty ? null : trimmed;
}

String cleanDestinationName(String value) {
  var cleaned = value.trim().replaceAll(RegExp(r'\s+'), ' ');
  while (cleaned.endsWith('(') || cleaned.endsWith('[')) {
    cleaned = cleaned.substring(0, cleaned.length - 1).trim();
  }
  return cleaned.isEmpty ? 'Unnamed Destination' : cleaned;
}

String boatCapacityFareLabel(String value) {
  return value.isEmpty ? 'Select capacity and fare' : value;
}

String statusLabel(String value) {
  switch (value) {
    case 'pending':
      return 'Pending';
    case 'arrived':
      return 'Arrived';
    case 'no_show':
      return 'No-show';
    default:
      return value.isEmpty ? 'Pending' : value;
  }
}

String sanitationPriorityLabel(String value) {
  switch (value) {
    case 'high':
      return 'Urgent';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return value.isEmpty ? 'Medium' : value;
  }
}

String sanitationStatusLabel(String value) {
  switch (value) {
    case 'good_standing':
      return 'Good Standing';
    case 'upcoming':
      return 'Upcoming';
    case 'for_completion':
      return 'For Completion';
    case 'violation':
      return 'Violation';
    case 'no_permit':
      return 'No Permit';
    case 'active':
      return 'Active';
    case 'renewal_due':
      return 'Renewal Due';
    case 'conditional':
      return 'Conditional';
    case 'suspended':
      return 'Suspended';
    case 'pending':
      return 'Pending';
    case 'investigating':
      return 'Under Investigation';
    case 'resolved':
      return 'Resolved';
    case 'rejected':
      return 'Rejected';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return value.isEmpty ? 'Pending' : value;
  }
}

String permitStatusLabel(String value) => sanitationStatusLabel(value);

String householdStatusLabel(String value) {
  switch (value) {
    case 'good_standing':
      return 'Good Standing';
    case 'for_completion':
      return 'For Completion';
    case 'violation':
      return 'Violation';
    default:
      return value.isEmpty ? 'Good Standing' : value;
  }
}

Color sanitationStatusColor(String value) {
  switch (value) {
    case 'good_standing':
    case 'active':
    case 'low':
    case 'resolved':
      return AppColors.green;
    case 'upcoming':
    case 'for_completion':
    case 'renewal_due':
    case 'conditional':
    case 'medium':
    case 'pending':
    case 'investigating':
      return const Color(0xffd59b00);
    case 'violation':
    case 'no_permit':
    case 'suspended':
    case 'high':
    case 'rejected':
      return Colors.red;
    default:
      return AppColors.muted;
  }
}

String formatCount(int value) {
  final text = value.toString();
  final buffer = StringBuffer();
  for (var index = 0; index < text.length; index += 1) {
    final remaining = text.length - index;
    buffer.write(text[index]);
    if (remaining > 1 && remaining % 3 == 1) buffer.write(',');
  }
  return buffer.toString();
}

String householdToiletLabel(String value) {
  switch (value) {
    case 'water_sealed':
      return 'Water-sealed';
    case 'pour_flush':
      return 'Pour-flush';
    case 'pit_latrine':
      return 'Pit latrine';
    case 'none':
      return 'No toilet facility';
    default:
      return value;
  }
}

String householdWaterLabel(String value) {
  switch (value) {
    case 'level_1':
      return 'Level I';
    case 'level_2':
      return 'Level II';
    case 'level_3':
      return 'Level III';
    default:
      return value;
  }
}

String householdWasteLabel(String value) {
  switch (value) {
    case 'collected':
      return 'Collected by LGU';
    case 'composted':
      return 'Composted';
    case 'burned':
      return 'Burned';
    case 'dumped':
      return 'Dumped';
    default:
      return value;
  }
}

void showAppMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message.replaceFirst('Exception: ', ''))),
  );
}

Future<void> showSubmissionDialog(
  BuildContext context, {
  required String title,
  required String referenceLabel,
  required String referenceValue,
  required String message,
  List<String> details = const [],
}) {
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      icon: const Icon(Icons.check_circle, color: AppColors.green, size: 34),
      title: Text(title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xffecfdf3),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xffb7e8c6)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  referenceLabel,
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
                const SizedBox(height: 4),
                Text(
                  referenceValue,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                  ),
                ),
              ],
            ),
          ),
          if (details.isNotEmpty) ...[
            const SizedBox(height: 12),
            ...details.map(
              (detail) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.check_circle_outline,
                      color: AppColors.green,
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Expanded(child: Text(detail)),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
      actions: [
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Done'),
        ),
      ],
    ),
  );
}
