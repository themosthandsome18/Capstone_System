import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:8000/api',
);

void main() {
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
  final List<MobileSanitationReceipt> _sanitationHistory = [];

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomePage(
        bootstrap: widget.bootstrap,
        onOpenTab: _openTab,
        onOpenDestination: _openDestination,
        onOpenNotifications: _openNotifications,
        onOpenSanitationReport: _openSanitationReport,
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
        onOpenSanitationReport: _openSanitationReport,
      ),
      ProfilePage(
        onOpenReport: _openSanitationReport,
        visits: _visitHistory,
        feedbackHistory: _feedbackHistory,
        sanitationReports: _sanitationHistory,
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

  Future<void> _openSanitationReport() async {
    final receipt = await Navigator.of(context).push<MobileSanitationReceipt>(
      MaterialPageRoute(
        builder: (context) => SanitationReportPage(
          api: widget.api,
          barangays: widget.bootstrap.barangays,
        ),
      ),
    );

    if (receipt != null) {
      _addSanitationReport(receipt);
    }
  }

  void _addVisit(MobileVisitReceipt receipt) {
    setState(() {
      _visitHistory.insert(0, receipt);
    });
  }

  void _addFeedback(MobileFeedbackReceipt receipt) {
    setState(() {
      _feedbackHistory.insert(0, receipt);
    });
  }

  void _addSanitationReport(MobileSanitationReceipt receipt) {
    setState(() {
      _sanitationHistory.insert(0, receipt);
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
      text: 'Submit tourism feedback and community sanitation reports.',
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
    required this.onOpenTab,
    required this.onOpenDestination,
    required this.onOpenNotifications,
    required this.onOpenSanitationReport,
  });

  final MobileBootstrap bootstrap;
  final ValueChanged<int> onOpenTab;
  final ValueChanged<Destination> onOpenDestination;
  final VoidCallback onOpenNotifications;
  final VoidCallback onOpenSanitationReport;

  @override
  Widget build(BuildContext context) {
    final featured = bootstrap.featuredDestinations.isNotEmpty
        ? bootstrap.featuredDestinations
        : bootstrap.destinations.take(4).toList();
    final heroDestination =
        featured.firstOrNull ?? Destination.fallback().first;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        AppHeader(onOpenNotifications: onOpenNotifications),
        const SizedBox(height: 12),
        SearchBox(hint: 'Search destinations, resorts...'),
        const SizedBox(height: 14),
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
            QuickAction(
              icon: Icons.report_outlined,
              label: 'Report',
              onTap: onOpenSanitationReport,
            ),
          ],
        ),
        SectionHeader(
          title: 'Featured Destinations',
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
        SectionHeader(
          title: 'Popular Resorts',
          action: 'Map',
          onTap: () => onOpenTab(2),
        ),
        ...bootstrap.destinations
            .take(4)
            .map(
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
          icon: Icons.cloud_done_outlined,
          title: '${widget.destinations.length} destinations loaded',
          text:
              'These records come from the same backend database used by the web admin system.',
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
    required this.onOpenSanitationReport,
  });

  final MobileBootstrap bootstrap;
  final List<MobileVisitReceipt> visits;
  final VoidCallback onRegisterVisit;
  final VoidCallback onOpenSanitationReport;

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
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: onOpenSanitationReport,
          icon: const Icon(Icons.report_outlined),
          label: const Text('Submit community sanitation report'),
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
    required this.onOpenReport,
    required this.visits,
    required this.feedbackHistory,
    required this.sanitationReports,
  });

  final VoidCallback onOpenReport;
  final List<MobileVisitReceipt> visits;
  final List<MobileFeedbackReceipt> feedbackHistory;
  final List<MobileSanitationReceipt> sanitationReports;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        const PageTitle(
          title: 'Profile',
          subtitle: 'Tourist and resident services',
        ),
        const SizedBox(height: 8),
        const CircleAvatar(
          radius: 42,
          backgroundColor: Color(0xffd8f5e4),
          child: Text(
            'TA',
            style: TextStyle(
              color: AppColors.green,
              fontWeight: FontWeight.w900,
              fontSize: 24,
            ),
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'Trish Anne Huidem',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
        ),
        const Text(
          'Tourist - Visitor Profile',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.muted),
        ),
        const SizedBox(height: 20),
        const ProfileTile(
          icon: Icons.email_outlined,
          label: 'Email',
          value: 'trish@example.com',
        ),
        const ProfileTile(
          icon: Icons.phone_outlined,
          label: 'Contact',
          value: '+63 912 345 6789',
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
        ProfileLink(
          icon: Icons.health_and_safety_outlined,
          label: 'Sanitation Reports (${sanitationReports.length})',
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) =>
                  SanitationHistoryPage(reports: sanitationReports),
            ),
          ),
        ),
        ProfileLink(
          icon: Icons.report_outlined,
          label: 'Report Sanitation Concern',
          onTap: onOpenReport,
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
                  Row(
                    children: [
                      RatingPill(rating: destination.rating),
                      const SizedBox(width: 8),
                      Text(
                        destination.location,
                        style: const TextStyle(color: AppColors.muted),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    destination.description,
                    style: const TextStyle(height: 1.45),
                  ),
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
          message: 'Your comment is now available to the tourism office.',
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
  DateTime _arrivalDate = DateTime.now();
  late Destination _destination;
  late RefItem _itinerary;
  late RefItem _travelMode;
  late RefItem _boatType;
  late RefItem _purpose;
  int _visitors = 1;
  int _male = 0;
  int _female = 1;
  int _maubanin = 0;
  int _filipino = 1;
  int _foreign = 0;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _destination =
        widget.initialDestination ??
        widget.bootstrap.destinations.firstOrNull ??
        Destination.fallback().first;
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
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Tourist Registration',
      subtitle: 'Help us welcome you',
      children: [
        AppTextField(controller: _name, label: 'Full name'),
        AppTextField(controller: _contact, label: 'Contact number'),
        AppTextField(controller: _email, label: 'Email address'),
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
              setState(() {
                _visitors = value;
                _female = _visitors - _male;
                _filipino = _visitors - _maubanin - _foreign;
              });
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
                _filipino = clampInt(
                  _visitors - _maubanin - _foreign,
                  0,
                  _visitors,
                );
              });
            }),
            CounterItem('Foreign', _foreign, (value) {
              setState(() {
                _foreign = clampInt(value, 0, _visitors);
                _filipino = clampInt(
                  _visitors - _maubanin - _foreign,
                  0,
                  _visitors,
                );
              });
            }),
          ],
        ),
        DropdownTile<RefItem>(
          label: 'Travel mode',
          value: _travelMode,
          items: widget.bootstrap.travelModes,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _travelMode = item),
        ),
        DropdownTile<RefItem>(
          label: 'Boat type',
          value: _boatType,
          items: widget.bootstrap.boatTypes,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _boatType = item),
        ),
        DropdownTile<RefItem>(
          label: 'Purpose of visit',
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
    if (_name.text.trim().isEmpty || _contact.text.trim().isEmpty) {
      showAppMessage(context, 'Name and contact number are required.');
      return;
    }

    setState(() => _submitting = true);

    try {
      final response = await widget.api.registerVisit(
        fullName: _name.text.trim(),
        contactNumber: _contact.text.trim(),
        email: _email.text.trim(),
        arrivalDate: isoDate(_arrivalDate),
        resortId: _destination.id,
        itineraryId: _itinerary.id,
        travelModeId: _travelMode.id,
        boatTypeId: _boatType.id,
        visitPurposeId: _purpose.id,
        totalVisitors: _visitors,
        totalMale: _male,
        totalFemale: _female,
        filipinoCount: _filipino,
        maubaninCount: _maubanin,
        foreignerCount: _foreign,
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
          message: 'This record was saved for Tourism Office monitoring.',
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

class SanitationReportPage extends StatefulWidget {
  const SanitationReportPage({
    super.key,
    required this.api,
    required this.barangays,
  });

  final TourismApi api;
  final List<BarangayItem> barangays;

  @override
  State<SanitationReportPage> createState() => _SanitationReportPageState();
}

class _SanitationReportPageState extends State<SanitationReportPage> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _contact = TextEditingController();
  final TextEditingController _description = TextEditingController();
  final TextEditingController _photo = TextEditingController();
  final TextEditingController _latitude = TextEditingController();
  final TextEditingController _longitude = TextEditingController();
  String _category = 'Improper waste disposal';
  late String _barangay;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _barangay = widget.barangays.firstOrNull?.name ?? 'Poblacion';
  }

  @override
  void dispose() {
    _name.dispose();
    _contact.dispose();
    _description.dispose();
    _photo.dispose();
    _latitude.dispose();
    _longitude.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Community Report',
      subtitle: 'Submit sanitation concern',
      children: [
        AppTextField(controller: _name, label: 'Your name'),
        AppTextField(controller: _contact, label: 'Contact number'),
        DropdownTile<String>(
          label: 'Category',
          value: _category,
          items: const [
            'Improper waste disposal',
            'Unsafe water source',
            'Drainage concern',
            'Food handling concern',
            'Other sanitation concern',
          ],
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _category = item),
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
        AppTextField(controller: _photo, label: 'Photo filename / note'),
        Row(
          children: [
            Expanded(
              child: AppTextField(controller: _latitude, label: 'Latitude'),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: AppTextField(controller: _longitude, label: 'Longitude'),
            ),
          ],
        ),
        SubmitButton(
          label: 'Submit Sanitation Report',
          loading: _submitting,
          onPressed: _submit,
        ),
      ],
    );
  }

  Future<void> _submit() async {
    if (_description.text.trim().isEmpty) {
      showAppMessage(context, 'Description is required.');
      return;
    }

    setState(() => _submitting = true);

    try {
      final response = await widget.api.submitSanitationReport(
        name: _name.text.trim(),
        contactNumber: _contact.text.trim(),
        category: _category,
        barangay: _barangay,
        description: _description.text.trim(),
        photoDocumentation: _photo.text.trim(),
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
          message: 'This concern was saved for the Sanitary Section.',
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
      title: 'Sanitation Reports',
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
        'Status: ${receipt.status}',
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
    return ReceiptCard(
      icon: Icons.health_and_safety_outlined,
      title: receipt.category,
      reference: receipt.reference,
      lines: ['Barangay: ${receipt.barangay}', 'Status: ${receipt.status}'],
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
  });

  final TourismApi api;
  final MobileBootstrap bootstrap;

  @override
  State<SanitationMobileShell> createState() => _SanitationMobileShellState();
}

class _SanitationMobileShellState extends State<SanitationMobileShell> {
  final List<MobileSanitationReceipt> _reports = [];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sanitary Mobile Reporting')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
          children: [
            const PageTitle(
              title: 'Sanitary Report',
              subtitle: 'Community sanitation concern submission',
            ),
            Row(
              children: [
                Expanded(
                  child: StatCard(
                    label: 'Submitted',
                    value: '${_reports.length}',
                    icon: Icons.assignment_turned_in_outlined,
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: StatCard(
                    label: 'Default Status',
                    value: 'Pending',
                    icon: Icons.pending_actions_outlined,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: _openReport,
              icon: const Icon(Icons.add_location_alt_outlined),
              label: const Text('Submit New Report'),
            ),
            SectionHeader(title: 'Recent Reports'),
            if (_reports.isEmpty)
              const EmptyState(
                icon: Icons.health_and_safety_outlined,
                title: 'No reports submitted yet',
              )
            else
              ..._reports.map(
                (report) => SanitationReceiptCard(receipt: report),
              ),
            const InfoBanner(
              icon: Icons.privacy_tip_outlined,
              title: 'Privacy Reminder',
              text:
                  'Only submit accurate location and contact information for official follow-up.',
              color: Color(0xfffff3bd),
            ),
          ],
        ),
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
    }
  }
}

class SanitationStandaloneApp extends StatelessWidget {
  const SanitationStandaloneApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mauban Sanitation',
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
  late Future<MobileBootstrap> _bootstrapFuture;

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
        return SanitationMobileShell(api: _api, bootstrap: data);
      },
    );
  }
}

class TourismApi {
  const TourismApi();

  Future<MobileBootstrap> fetchBootstrap() async {
    try {
      final data = await _get('/mobile/tourism/bootstrap/');
      return MobileBootstrap.fromJson(data);
    } catch (_) {
      return MobileBootstrap.fallback();
    }
  }

  Future<Map<String, dynamic>> registerVisit({
    required String fullName,
    required String contactNumber,
    required String email,
    required String arrivalDate,
    required int resortId,
    required int itineraryId,
    required int travelModeId,
    required int boatTypeId,
    required int visitPurposeId,
    required int totalVisitors,
    required int totalMale,
    required int totalFemale,
    required int filipinoCount,
    required int maubaninCount,
    required int foreignerCount,
  }) {
    return _post('/mobile/tourism/register-visit/', {
      'full_name': fullName,
      'contact_number': contactNumber,
      'email': email,
      'arrival_date': arrivalDate,
      'resort_id': resortId,
      'itinerary_id': itineraryId,
      'travel_mode_id': travelModeId,
      'boat_type_id': boatTypeId,
      'visit_purpose_id': visitPurposeId,
      'total_visitors': totalVisitors,
      'total_male': totalMale,
      'total_female': totalFemale,
      'filipino_count': filipinoCount,
      'maubanin_count': maubaninCount,
      'foreigner_count': foreignerCount,
      'age_8_59': totalVisitors,
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
    required String barangay,
    required String description,
    required String photoDocumentation,
    required String latitude,
    required String longitude,
  }) {
    return _post('/mobile/sanitation/reports/', {
      'complainant_name': name,
      'contact_number': contactNumber,
      'category': category,
      'barangay': barangay,
      'description': description,
      'photo_documentation': photoDocumentation,
      'latitude': latitude,
      'longitude': longitude,
    });
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final response = await http.get(Uri.parse('$apiBaseUrl$path'));
    return _decode(response);
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, Object?> body,
  ) async {
    final response = await http.post(
      Uri.parse('$apiBaseUrl$path'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
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
    );
  }

  factory MobileBootstrap.fallback() {
    return MobileBootstrap(
      destinations: Destination.fallback(),
      featuredDestinations: Destination.fallback().take(4).toList(),
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
  final double latitude;
  final double longitude;

  bool get hasCoordinates => latitude.abs() > 0.001 && longitude.abs() > 0.001;

  factory Destination.fromJson(Map<String, dynamic> json) {
    return Destination(
      id: jsonInt(json['resort_id']),
      name: '${json['resort_name'] ?? 'Destination'}',
      type: '${json['type'] ?? 'Tourism Site'}',
      location: '${json['location'] ?? 'Mauban, Quezon'}',
      description: '${json['short_description'] ?? ''}',
      rating: jsonDouble(json['tourism_rating'], 4.5),
      imageKey: '${json['image_key'] ?? ''}',
      monthlyArrivals: jsonInt(json['monthly_arrivals']),
      latitude: jsonDouble(json['latitude'], 14.18),
      longitude: jsonDouble(json['longitude'], 121.73),
    );
  }

  static List<Destination> fallback() {
    return const [
      Destination(
        id: 1,
        name: 'Cagbalete Island',
        type: 'Island',
        location: 'Mauban, Quezon',
        description:
            'White-sand island destination known for sandbars, beach camping, and weekend eco escapes.',
        rating: 4.8,
        imageKey: 'cagbalete',
        monthlyArrivals: 1860,
        latitude: 14.25,
        longitude: 121.82,
      ),
      Destination(
        id: 2,
        name: 'Dampalitan Island',
        type: 'Island',
        location: 'Mauban, Quezon',
        description:
            'Popular beach area for day tours, group outings, and quiet coastal stays.',
        rating: 4.6,
        imageKey: 'dampalitan-island',
        monthlyArrivals: 1495,
        latitude: 14.20,
        longitude: 121.83,
      ),
      Destination(
        id: 3,
        name: 'Puting Buhangin Cove',
        type: 'Beach',
        location: 'Mauban, Quezon',
        description:
            'Scenic cove known for bright sand, clear water, and relaxed beach activities.',
        rating: 4.5,
        imageKey: 'puting-buhangin',
        monthlyArrivals: 1160,
        latitude: 14.18,
        longitude: 121.74,
      ),
      Destination(
        id: 5,
        name: 'Mauban Lighthouse',
        type: 'Landmark',
        location: 'Mauban, Quezon',
        description:
            'Historic lighthouse stop for educational tours and cultural orientation.',
        rating: 4.3,
        imageKey: 'mauban-lighthouse',
        monthlyArrivals: 820,
        latitude: 14.19,
        longitude: 121.73,
      ),
    ];
  }
}

class RefItem {
  const RefItem({required this.id, required this.name});

  final int id;
  final String name;

  factory RefItem.fromJson(Map<String, dynamic> json) {
    return RefItem(id: jsonInt(json['id']), name: '${json['name'] ?? ''}');
  }
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
  });

  final String reference;
  final Destination destination;
  final DateTime arrivalDate;
  final int totalVisitors;
  final String status;

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
  });

  final String reference;
  final String category;
  final String barangay;
  final String status;

  factory MobileSanitationReceipt.fromResponse(
    Map<String, dynamic> json, {
    required String category,
    required String barangay,
  }) {
    return MobileSanitationReceipt(
      reference: '${json['complaint_id'] ?? 'Pending sync'}',
      category: '${json['category'] ?? category}',
      barangay: '${json['barangay'] ?? barangay}',
      status: '${json['status'] ?? 'pending'}',
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
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        RatingPill(rating: destination.rating),
                        const SizedBox(width: 8),
                        StatusPill(text: destination.type),
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
  });

  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xffecfdf3),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xffb7e8c6)),
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
    final item = destination ?? Destination.fallback().first;
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
    _destination =
        widget.destinations.firstOrNull ?? Destination.fallback().first;
  }

  @override
  void dispose() {
    _activities.dispose();
    super.dispose();
  }

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
  });

  final TextEditingController controller;
  final String label;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
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
  });

  final String label;
  final bool loading;
  final VoidCallback onPressed;

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
      label: Text(loading ? 'Submitting...' : label),
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

double jsonDouble(Object? value, [double fallback = 0]) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? fallback;
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
    case 'kwebang-lampas':
      return 'assets/destinations/kwebang_lampas.jpg';
    case 'mauban-lighthouse':
      return 'assets/destinations/mauban_lighthouse.jpg';
    case 'mt-pinagbanderahan':
      return 'assets/destinations/mt_pinagbanderahan.jpg';
    case 'puting-buhangin':
      return 'assets/destinations/puting_buhangin.jpg';
    default:
      return 'assets/destinations/cagbalete.jpg';
  }
}

String isoDate(DateTime date) {
  return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}

String shortDate(DateTime date) {
  return '${date.month}/${date.day}/${date.year}';
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
