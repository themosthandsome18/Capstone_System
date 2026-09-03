part of '../main.dart';

class MobileShell extends StatefulWidget {
  const MobileShell({
    super.key,
    required this.api,
    required this.bootstrap,
    this.onSignOut,
  });

  final TourismApi api;
  final MobileBootstrap bootstrap;
  final VoidCallback? onSignOut;

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
        onSignOut: widget.onSignOut,
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

class HomePage extends StatefulWidget {
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
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String _selectedCategory = 'All';
  String _search = '';

  final List<Map<String, dynamic>> _categories = const [
    {'name': 'All', 'icon': Icons.explore_outlined, 'label': 'All Places'},
    {'name': 'Beach Resort', 'icon': Icons.beach_access_outlined, 'label': 'Beaches'},
    {'name': 'Camping Resort', 'icon': Icons.cabin_outlined, 'label': 'Resorts'},
    {'name': 'Hidden Gems', 'icon': Icons.diamond_outlined, 'label': 'Hidden Gems'},
    {'name': 'Heritage', 'icon': Icons.account_balance_outlined, 'label': 'Heritage'},
    {'name': 'Nature', 'icon': Icons.water_drop_outlined, 'label': 'Nature'},
  ];

  @override
  Widget build(BuildContext context) {
    // 1. Popular Resorts for the Slide Show (Top visited / featured)
    final popularResorts = widget.bootstrap.featuredDestinations.isNotEmpty
        ? widget.bootstrap.featuredDestinations
        : widget.bootstrap.destinations.take(5).toList();

    // 2. Hidden Gems & Lesser-Known / Emerging Spots (to promote quiet and emerging spots)
    final hiddenGems = widget.bootstrap.destinations.where((d) {
      final name = d.name.toLowerCase();
      final type = d.type.toLowerCase();
      return name.contains('tent') ||
          name.contains('nilandingan') ||
          name.contains('rio') ||
          name.contains('jovencio') ||
          name.contains('aguho') ||
          name.contains('escaparde') ||
          name.contains('pinay') ||
          type.contains('falls') ||
          type.contains('camp') ||
          d.monthlyArrivals < 100;
    }).take(6).toList();

    // 3. Filter destinations by category & search query
    final filteredDestinations = widget.bootstrap.destinations.where((d) {
      final matchesSearch = _search.isEmpty ||
          d.name.toLowerCase().contains(_search.toLowerCase()) ||
          d.location.toLowerCase().contains(_search.toLowerCase()) ||
          d.description.toLowerCase().contains(_search.toLowerCase());

      final matchesCategory = _selectedCategory == 'All' ||
          (_selectedCategory == 'Hidden Gems' && hiddenGems.any((h) => h.id == d.id)) ||
          d.type.toLowerCase().contains(_selectedCategory.toLowerCase()) ||
          (_selectedCategory == 'Nature' && (d.type.toLowerCase().contains('falls') || d.type.toLowerCase().contains('nature'))) ||
          (_selectedCategory == 'Heritage' && (d.type.toLowerCase().contains('heritage') || d.type.toLowerCase().contains('historical')));

      return matchesSearch && matchesCategory;
    }).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        // Top Header
        AppHeader(
          onOpenNotifications: widget.onOpenNotifications,
          hasUnread: widget.bootstrap.notifications.isNotEmpty,
        ),
        const SizedBox(height: 16),

        // Welcoming Hero Header
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF0F766E), Color(0xFF115E59)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF0F766E).withValues(alpha: 0.25),
                blurRadius: 14,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.auto_awesome, size: 12, color: Color(0xFFFFD700)),
                        SizedBox(width: 4),
                        Text(
                          'MUNICIPALITY OF MAUBAN',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                widget.profile.isGuest
                    ? 'Mabuhay, Explorer! 🌊'
                    : 'Mabuhay, ${widget.profile.displayName}! 🌊',
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Welcome to the historic jewel of Lamon Bay — home to the white sandbars of Cagbalete Island, cascading waterfalls, and world-class Buntal weaving craftsmanship.',
                style: TextStyle(
                  color: Color(0xFFCCFBF1),
                  fontSize: 12.5,
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Search Box
        SearchBox(
          hint: 'Search resorts, beaches, waterfalls, heritage...',
          onChanged: (value) => setState(() => _search = value.trim()),
        ),
        const SizedBox(height: 14),

        // Category Filter Chips
        SizedBox(
          height: 38,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _categories.length,
            separatorBuilder: (context, index) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final cat = _categories[index];
              final isSelected = _selectedCategory == cat['name'];

              return GestureDetector(
                onTap: () {
                  setState(() {
                    _selectedCategory = cat['name'] as String;
                  });
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: isSelected ? AppColors.green : Colors.white,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: isSelected ? AppColors.green : const Color(0xFFE2E8F0),
                    ),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: AppColors.green.withValues(alpha: 0.28),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ]
                        : null,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        cat['icon'] as IconData,
                        size: 15,
                        color: isSelected ? Colors.white : AppColors.muted,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        cat['label'] as String,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                          color: isSelected ? Colors.white : AppColors.ink,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 20),

        // Show Slide Show and Highlights only when not actively searching / when on 'All'
        if (_search.isEmpty && _selectedCategory == 'All') ...[
          // Section Title: Most Popular Resorts Slideshow
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '🔥 Most Popular Resorts',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
              ),
              TextButton(
                onPressed: () => widget.onOpenTab(1),
                child: const Text('View all', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          ),
          const SizedBox(height: 6),

          // Auto-Sliding Featured Resorts Slideshow
          FeaturedResortsSlideshow(
            destinations: popularResorts,
            onTapDestination: widget.onOpenDestination,
          ),
          const SizedBox(height: 24),

          // Section: Discover the Beauty & Heritage of Mauban
          const _MaubanTownHighlightsCard(),
          const SizedBox(height: 24),

          // Section: Hidden Gems & Peaceful Stays (Promoting lesser-known resorts)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '💎 Hidden Gems of Mauban',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Peaceful glamping, quiet beaches & eco-spots',
                    style: TextStyle(color: AppColors.muted, fontSize: 12),
                  ),
                ],
              ),
              IconButton(
                icon: const Icon(Icons.arrow_forward, color: AppColors.green),
                onPressed: () => widget.onOpenTab(1),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 195,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: hiddenGems.length,
              separatorBuilder: (context, index) => const SizedBox(width: 12),
              itemBuilder: (context, index) => _HiddenGemCard(
                destination: hiddenGems[index],
                onTap: () => widget.onOpenDestination(hiddenGems[index]),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Section: Town Information & Travel Essentials
          const _MaubanTownGuideSection(),
          const SizedBox(height: 14),
        ],

        // Filtered / All Destinations List Section
        SectionHeader(
          title: _selectedCategory == 'All'
              ? (_search.isNotEmpty ? 'Search Results' : 'All Destinations & Resorts')
              : '$_selectedCategory Spots',
          action: 'View Map',
          onTap: () => widget.onOpenTab(2),
        ),
        if (filteredDestinations.isEmpty)
          const EmptyState(
            icon: Icons.travel_explore_outlined,
            title: 'No destinations match your search or filter',
          )
        else
          ...filteredDestinations.map(
            (destination) => DestinationListCard(
              destination: destination,
              onTap: () => widget.onOpenDestination(destination),
            ),
          ),
        const SizedBox(height: 12),

        const InfoBanner(
          icon: Icons.event_available_outlined,
          title: 'Upcoming: Fiesta de Mauban & Buntal Festival',
          text: 'Celebrate the feast of San Buenaventura with colorful Buntal weaving and boat regatta.',
          color: Color(0xffd7efff),
        ),
        const InfoBanner(
          icon: Icons.eco_outlined,
          title: 'Clean Coast & Eco-Tourism Policy',
          text: 'Please dispose of trash responsibly and support local community bangkeros and weavers.',
          color: Color(0xffdcfce7),
        ),
      ],
    );
  }
}

/// Auto-Sliding and Interactive Carousel for Most Popular Resorts
class FeaturedResortsSlideshow extends StatefulWidget {
  const FeaturedResortsSlideshow({
    super.key,
    required this.destinations,
    required this.onTapDestination,
  });

  final List<Destination> destinations;
  final ValueChanged<Destination> onTapDestination;

  @override
  State<FeaturedResortsSlideshow> createState() => _FeaturedResortsSlideshowState();
}

class _FeaturedResortsSlideshowState extends State<FeaturedResortsSlideshow> {
  late PageController _pageController;
  int _currentPage = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(viewportFraction: 0.94);
    _startAutoSlide();
  }

  void _startAutoSlide() {
    _timer?.cancel();
    if (widget.destinations.length <= 1) return;
    _timer = Timer.periodic(const Duration(seconds: 4), (timer) {
      if (!mounted || !_pageController.hasClients) return;
      final nextPage = (_currentPage + 1) % widget.destinations.length;
      _pageController.animateToPage(
        nextPage,
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeInOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.destinations.isEmpty) return const SizedBox.shrink();

    return Column(
      children: [
        SizedBox(
          height: 225,
          child: PageView.builder(
            controller: _pageController,
            onPageChanged: (index) {
              setState(() => _currentPage = index);
            },
            itemCount: widget.destinations.length,
            itemBuilder: (context, index) {
              final destination = widget.destinations[index];
              return AnimatedScaleButton(
                onTap: () => widget.onTapDestination(destination),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.14),
                          blurRadius: 16,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(20),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          DestinationImage(destination: destination),
                          const DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                stops: [0.15, 0.55, 1.0],
                                colors: [
                                  Colors.transparent,
                                  Color(0x44000000),
                                  Color(0xEE000000),
                                ],
                              ),
                            ),
                          ),
                          // Badge top left
                          Positioned(
                            top: 14,
                            left: 14,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: const Color(0xFFD81558),
                                borderRadius: BorderRadius.circular(999),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFFD81558).withValues(alpha: 0.4),
                                    blurRadius: 6,
                                  ),
                                ],
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.local_fire_department, size: 13, color: Colors.white),
                                  SizedBox(width: 4),
                                  Text(
                                    'POPULAR RESORT',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          // Rating top right
                          Positioned(
                            top: 14,
                            right: 14,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.5),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.star, size: 14, color: Color(0xFFFFD700)),
                                  const SizedBox(width: 4),
                                  Text(
                                    destination.rating.toStringAsFixed(1),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          // Info bottom
                          Positioned(
                            left: 16,
                            right: 16,
                            bottom: 16,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  destination.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 19,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Row(
                                  children: [
                                    const Icon(Icons.place_outlined, size: 13, color: Colors.white70),
                                    const SizedBox(width: 4),
                                    Expanded(
                                      child: Text(
                                        destination.location,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    VisitorPill(destination: destination, dark: true),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withValues(alpha: 0.2),
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                      child: Text(
                                        destination.type,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 10),
        // Dots Indicator
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(
            widget.destinations.length,
            (index) => AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: _currentPage == index ? 22 : 6,
              height: 6,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                color: _currentPage == index ? AppColors.green : const Color(0xFFCBD5E1),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Highlight Card introducing the beauty and culture of Mauban
class _MaubanTownHighlightsCard extends StatelessWidget {
  const _MaubanTownHighlightsCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0FDFA),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.stars_rounded, color: Color(0xFF0F766E), size: 22),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Why Visit Mauban, Quezon?',
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Color(0xFF0F172A)),
                    ),
                    Text(
                      'The historic coastal sanctuary of southern Luzon',
                      style: TextStyle(color: AppColors.muted, fontSize: 11.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'Nestled along the Pacific coast of Lamon Bay, Mauban boasts powdery white sandbars with expansive tidal ripples, centuries-old ancestral trees, cascading mountain pools, and a proud cultural identity shaped by Gat Uban and palm artisans.',
            style: TextStyle(fontSize: 12.5, color: Color(0xFF475569), height: 1.5),
          ),
          const SizedBox(height: 16),
          // 4 Grid Highlight Pillars
          Row(
            children: [
              Expanded(
                child: _buildPillarItem(
                  icon: Icons.beach_access,
                  title: 'Cagbalete Island',
                  sub: 'Pristine Sandbars',
                  color: const Color(0xFF0284C7),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildPillarItem(
                  icon: Icons.workspace_premium,
                  title: 'Buntal Weaving',
                  sub: 'Artisan Hats & Crafts',
                  color: const Color(0xFFD97706),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _buildPillarItem(
                  icon: Icons.water_drop,
                  title: 'Forest Cascades',
                  sub: 'Dahican & Alitap Falls',
                  color: const Color(0xFF059669),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildPillarItem(
                  icon: Icons.restaurant_menu,
                  title: 'Quezon Flavors',
                  sub: 'Habhab & Fresh Seafood',
                  color: const Color(0xFFDC2626),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPillarItem({
    required IconData icon,
    required String title,
    required String sub,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11.5, color: color),
                ),
                Text(
                  sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 9.5, color: Color(0xFF64748B)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Hidden Gem / Lesser-Known Resort Card
class _HiddenGemCard extends StatelessWidget {
  const _HiddenGemCard({required this.destination, required this.onTap});

  final Destination destination;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 165,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Stack(
            fit: StackFit.expand,
            children: [
              DestinationImage(destination: destination),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: [0.2, 0.65, 1.0],
                    colors: [
                      Colors.transparent,
                      Color(0x44000000),
                      Color(0xEE000000),
                    ],
                  ),
                ),
              ),
              // Hidden Gem Tag
              Positioned(
                top: 8,
                left: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F766E),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.diamond, size: 10, color: Color(0xFF5EEAD4)),
                      SizedBox(width: 3),
                      Text(
                        'HIDDEN GEM',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 8.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 10,
                right: 10,
                bottom: 10,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      destination.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      destination.location,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white70, fontSize: 10.5),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.22),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        destination.type.isNotEmpty ? destination.type : 'Quiet Stay',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w700,
                        ),
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

/// Town Information & Travel Essentials Accordion / Grid
class _MaubanTownGuideSection extends StatelessWidget {
  const _MaubanTownGuideSection();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '📖 Mauban Travel Guide & Local Tips',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
        ),
        const SizedBox(height: 10),
        _buildGuideTile(
          icon: Icons.directions_boat_outlined,
          title: 'Cagbalete Island Boat Guide',
          desc: 'Passenger pumpboats depart daily from Mauban Port to Sabang & Daungan. Environmental fee is paid at the tourism desk before boarding.',
          color: const Color(0xFF0284C7),
        ),
        _buildGuideTile(
          icon: Icons.festival_outlined,
          title: 'Maubanin Buntal Festival (May)',
          desc: 'A week-long celebration showcasing giant woven Buntal hats, street dancing, and the historical legacy of Gat Uban.',
          color: const Color(0xFFD97706),
        ),
        _buildGuideTile(
          icon: Icons.receipt_long_outlined,
          title: 'Tourism Port & Environmental Fee',
          desc: 'All tourists register at the Tourism Information Center. Receipts serve as your official entry pass to the island sanctuaries.',
          color: const Color(0xFF059669),
        ),
        _buildGuideTile(
          icon: Icons.delete_outline,
          title: 'Solid Waste & Leave No Trace Policy',
          desc: 'Help keep Cagbalete and Mauban pristine by avoiding single-use plastics and taking your trash back to mainland disposal points.',
          color: const Color(0xFF7C3AED),
        ),
      ],
    );
  }

  Widget _buildGuideTile({
    required IconData icon,
    required String title,
    required String desc,
    required Color color,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: Color(0xFF0F172A)),
                ),
                const SizedBox(height: 3),
                Text(
                  desc,
                  style: const TextStyle(fontSize: 11.5, color: Color(0xFF64748B), height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
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

class TourismMapPage extends StatefulWidget {
  const TourismMapPage({
    super.key,
    required this.destinations,
    required this.onOpenDestination,
  });

  final List<Destination> destinations;
  final ValueChanged<Destination> onOpenDestination;

  @override
  State<TourismMapPage> createState() => _TourismMapPageState();
}

class _TourismMapPageState extends State<TourismMapPage> {
  Destination? _selectedDestination;

  void _openFullscreenMap(BuildContext context, List<Destination> highlighted) {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) {
          return Dialog.fullscreen(
            child: Scaffold(
              backgroundColor: Colors.black,
              body: Stack(
                children: [
                  FlutterMap(
                    options: MapOptions(
                      initialCenter: _selectedDestination != null && _selectedDestination!.hasCoordinates
                          ? LatLng(_selectedDestination!.latitude, _selectedDestination!.longitude)
                          : const LatLng(14.185, 121.731),
                      initialZoom: 12.0,
                      minZoom: 8,
                      maxZoom: 18,
                      interactionOptions: const InteractionOptions(
                        flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                      ),
                      onTap: (tapPosition, point) {
                        setDialogState(() => _selectedDestination = null);
                      },
                    ),
                    children: [
                      TileLayer(
                        urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'mauban_mobile_app',
                      ),
                      MarkerLayer(
                        markers: highlighted.map((destination) {
                          final isSelected = _selectedDestination?.id == destination.id;
                          return Marker(
                            point: LatLng(destination.latitude, destination.longitude),
                            width: isSelected ? 54 : 44,
                            height: isSelected ? 54 : 44,
                            child: GestureDetector(
                              onTap: () {
                                setDialogState(() => _selectedDestination = destination);
                              },
                              child: isSelected
                                  ? const Icon(Icons.location_on, color: Color(0xFFD81558), size: 48)
                                  : const MapPin(),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                  // Back button overlay
                  Positioned(
                    top: 48,
                    left: 16,
                    child: GestureDetector(
                      onTap: () => Navigator.of(context).pop(),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(30),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.2),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: Color(0xFF147c79)),
                            SizedBox(width: 6),
                            Text('Back', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF147c79))),
                          ],
                        ),
                      ),
                    ),
                  ),
                  // Title overlay
                  Positioned(
                    top: 48,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.92),
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.12),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                        child: const Text(
                          'Mauban Tourism GIS Map',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF0f2e1f)),
                        ),
                      ),
                    ),
                  ),
                  // Bottom preview card if selected
                  if (_selectedDestination != null)
                    Positioned(
                      left: 16,
                      right: 16,
                      bottom: 24,
                      child: _buildMapPreviewCard(_selectedDestination!, onDetails: () {
                        Navigator.of(context).pop();
                        widget.onOpenDestination(_selectedDestination!);
                      }, onClose: () {
                        setDialogState(() => _selectedDestination = null);
                      }),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildMapPreviewCard(Destination destination, {required VoidCallback onDetails, required VoidCallback onClose}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.16),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: DestinationImage(destination: destination, width: 72, height: 72),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  destination.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
                ),
                const SizedBox(height: 2),
                Text(
                  destination.location,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.muted, fontSize: 11),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    RatingPill(rating: destination.rating),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        destination.type,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11, color: AppColors.deepGreen, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                icon: const Icon(Icons.close, size: 18, color: Colors.grey),
                onPressed: onClose,
              ),
              FilledButton(
                onPressed: onDetails,
                style: FilledButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: const Text('View', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mappedDestinations = widget.destinations
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
        const SizedBox(height: 12),
        Stack(
          children: [
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
                    onTap: (tapPosition, point) => setState(() => _selectedDestination = null),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'mauban_mobile_app',
                    ),
                    MarkerLayer(
                      markers: highlighted.map((destination) {
                        final isSelected = _selectedDestination?.id == destination.id;
                        return Marker(
                          point: LatLng(destination.latitude, destination.longitude),
                          width: isSelected ? 50 : 44,
                          height: isSelected ? 50 : 44,
                          child: GestureDetector(
                            onTap: () {
                              setState(() => _selectedDestination = destination);
                            },
                            child: isSelected
                                ? const Icon(Icons.location_on, color: Color(0xFFD81558), size: 44)
                                : const MapPin(),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),
            ),
            // Floating Preview Card when pin is tapped
            if (_selectedDestination != null)
              Positioned(
                left: 12,
                right: 12,
                bottom: 50,
                child: _buildMapPreviewCard(
                  _selectedDestination!,
                  onDetails: () => widget.onOpenDestination(_selectedDestination!),
                  onClose: () => setState(() => _selectedDestination = null),
                ),
              ),
            // Expand button
            Positioned(
              bottom: 12,
              right: 12,
              child: GestureDetector(
                onTap: () => _openFullscreenMap(context, highlighted),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: const Color(0xFF147c79),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.2),
                        blurRadius: 6,
                      ),
                    ],
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.fullscreen_rounded, color: Colors.white, size: 16),
                      SizedBox(width: 5),
                      Text(
                        'Full Screen',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
        SectionHeader(title: 'Nearby Places'),
        ...widget.destinations.map(
          (destination) => DestinationListCard(
            destination: destination,
            onTap: () => widget.onOpenDestination(destination),
          ),
        ),
      ],
    );
  }
}

class VisitPlannerPage extends StatefulWidget {
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
  State<VisitPlannerPage> createState() => _VisitPlannerPageState();
}

class _VisitPlannerPageState extends State<VisitPlannerPage> {
  // Interactive Packing checklist state
  final Map<String, bool> _packingItems = {
    'Valid ID & Digital QR Pass': true,
    'Cash in PHP (No ATMs on Cagbalete Island)': true,
    'Aqua Shoes (For Yang-in low-tide sandbar)': false,
    'Power Bank & Waterproof Phone Pouch': false,
    'Trash Bag / Eco-Pouch (Leave No Trace)': false,
  };

  int _selectedItineraryIndex = 0;

  @override
  Widget build(BuildContext context) {
    final latestVisit = widget.visits.firstOrNull;
    final totalPacked = _packingItems.values.where((v) => v).length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 28),
      children: [
        // Page Title
        const PageTitle(
          title: 'My Visit & Travel Wallet',
          subtitle: 'Active passes, smart itinerary, and island guide',
        ),
        const SizedBox(height: 6),

        // SECTION 1: DIGITAL TRAVEL WALLET (HERO PASS)
        if (latestVisit != null)
          _buildActivePassHero(context, latestVisit)
        else
          _buildNoPassHero(context),

        const SizedBox(height: 20),

        // Quick Action Row
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: widget.onRegisterVisit,
                icon: const Icon(Icons.add_circle_outline, size: 18),
                label: const Text(
                  'Register / Get Pass',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13.5),
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF14532D),
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
          ],
        ),

        const SizedBox(height: 24),

        // SECTION 2: INTERACTIVE PACKING CHECKLIST
        _buildPackingChecklist(totalPacked),

        const SizedBox(height: 24),

        // SECTION 3: CURATED MAUBAN ITINERARIES
        _buildItinerarySection(),

        const SizedBox(height: 24),

        // SECTION 4: MAUBAN PORT BOAT SCHEDULE & GUIDE
        _buildPortGuideCard(),

        if (widget.visits.length > 1) ...[
          const SizedBox(height: 24),
          SectionHeader(title: 'All Saved Passes (${widget.visits.length})'),
          ...widget.visits.map((v) => VisitReceiptCard(receipt: v)),
        ],
      ],
    );
  }

  // Hero Card for Active Digital Pass
  Widget _buildActivePassHero(BuildContext context, MobileVisitReceipt visit) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          colors: [Color(0xFF064E3B), Color(0xFF0F766E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F766E).withValues(alpha: 0.3),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: () => showDialog(
            context: context,
            builder: (context) => TouristDigitalPassModal(receipt: visit),
          ),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Header Pill Row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.confirmation_number_outlined, size: 13, color: Color(0xFF86EFAC)),
                          SizedBox(width: 5),
                          Text(
                            'ACTIVE ENTRY PASS',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.8,
                              color: Color(0xFF86EFAC),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF86EFAC),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'READY TO SCAN',
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF064E3B),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Destination & Tourist Name
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            visit.destination.name,
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                              letterSpacing: -0.3,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            visit.fullName.isNotEmpty ? formatProperName(visit.fullName) : 'Registered Tourist',
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFFCCFBF1),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              const Icon(Icons.calendar_today, size: 13, color: Colors.white70),
                              const SizedBox(width: 6),
                              Text(
                                shortDate(visit.arrivalDate),
                                style: const TextStyle(fontSize: 12, color: Colors.white),
                              ),
                              const SizedBox(width: 14),
                              const Icon(Icons.people_outline, size: 15, color: Colors.white70),
                              const SizedBox(width: 5),
                              Text(
                                '${visit.totalVisitors} Pax',
                                style: const TextStyle(fontSize: 12, color: Colors.white),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),

                    // High-contrast mini QR preview with tap prompt
                    Container(
                      width: 78,
                      height: 78,
                      padding: const EdgeInsets.all(5),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Expanded(
                            child: QrImageView(
                              data: visit.reference,
                              version: QrVersions.auto,
                              eyeStyle: const QrEyeStyle(
                                eyeShape: QrEyeShape.square,
                                color: Color(0xFF064E3B),
                              ),
                              dataModuleStyle: const QrDataModuleStyle(
                                dataModuleShape: QrDataModuleShape.square,
                                color: Color(0xFF064E3B),
                              ),
                            ),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'TAP TO EXPAND',
                            style: TextStyle(
                              fontSize: 6.5,
                              fontWeight: FontWeight.w900,
                              color: Color(0xFF0F766E),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Divider(color: Colors.white24, height: 1),
                const SizedBox(height: 10),

                // Monospace Pass Reference
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'PASS ID: ${visit.reference}',
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFFCCFBF1),
                      ),
                    ),
                    const Row(
                      children: [
                        Text(
                          'View Full Pass',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                        SizedBox(width: 3),
                        Icon(Icons.chevron_right, size: 16, color: Colors.white),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // Welcoming State when no pass is registered yet
  Widget _buildNoPassHero(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFD1E7DD), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF14532D).withValues(alpha: 0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: const Color(0xFFE8F5E9),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.confirmation_number_outlined, size: 32, color: Color(0xFF14532D)),
          ),
          const SizedBox(height: 12),
          const Text(
            'Ready for your Mauban Getaway?',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Register your visit now to receive an instant Digital QR Pass for seamless entry at the port and resort check-in.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: Color(0xFF64748B),
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  // Interactive Packing Checklist Widget
  Widget _buildPackingChecklist(int totalPacked) {
    final totalItems = _packingItems.length;
    final progress = totalItems > 0 ? totalPacked / totalItems : 0.0;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.backpack_outlined, size: 20, color: Color(0xFFB45309)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Island Packing Checklist',
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Color(0xFF0F172A)),
                    ),
                    Text(
                      '$totalPacked of $totalItems items ready',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: const Color(0xFFF1F5F9),
              valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF10B981)),
            ),
          ),
          const SizedBox(height: 12),
          ..._packingItems.entries.map((entry) {
            return GestureDetector(
              onTap: () {
                setState(() {
                  _packingItems[entry.key] = !entry.value;
                });
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Icon(
                      entry.value ? Icons.check_box : Icons.check_box_outline_blank,
                      color: entry.value ? const Color(0xFF14532D) : const Color(0xFF94A3B8),
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        entry.key,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: entry.value ? FontWeight.w700 : FontWeight.w500,
                          color: entry.value ? const Color(0xFF0F172A) : const Color(0xFF475569),
                          decoration: entry.value ? TextDecoration.lineThrough : null,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  // Curated Itineraries Section
  Widget _buildItinerarySection() {
    final itineraries = [
      {
        'title': '🏝️ Cagbalete Island & Sandbars Loop',
        'duration': '1 to 2 Days',
        'highlight': 'Yang-in Sandbar, Bonsai Island, Balete Tree',
        'stops': [
          '07:00 AM — Public Boat from Mauban Port to Sabang/Mappit',
          '09:00 AM — Yang-in Sandbar Walk & Low Tide Swimming',
          '01:00 PM — Fresh Seafood Lunch at Beachfront Resort',
          '03:30 PM — Bonsai Island rock formations & photo op',
          '05:30 PM — Golden Hour Sunset by the century-old Balete Tree',
        ],
      },
      {
        'title': '🌿 Eco-Waterfalls & Heritage Trail',
        'duration': 'Day Tour (Town Proper)',
        'highlight': 'Dahican Falls, Rizal Hill, Spanish Bath',
        'stops': [
          '08:00 AM — Refreshing swim at Dahican Cascading Falls',
          '11:30 AM — Panoramic Lamon Bay view at Rizal Hill Park',
          '01:00 PM — Authentic Pansit Habhab lunch along Quezon St.',
          '02:30 PM — Historic 17th-Century Spanish Public Bath & Buntal craft shopping',
        ],
      },
      {
        'title': '🍲 Quezon Food & Local Delicacies',
        'duration': 'Half-Day Trail',
        'highlight': 'Pansit Habhab, Tikoy Mauban, Fresh Fish',
        'stops': [
          '07:30 AM — Morning catch browsing at Mauban Fish Port',
          '09:00 AM — Tikoy Mauban & Buntal souvenir tasting',
          '12:00 PM — Traditional Lucban / Mauban Longganisa feast',
        ],
      },
    ];

    final current = itineraries[_selectedItineraryIndex];

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFE0F2FE),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.explore_outlined, size: 20, color: Color(0xFF0284C7)),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Curated Mauban Itineraries',
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Color(0xFF0F172A)),
                    ),
                    Text(
                      'Recommended routes by local guides',
                      style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Itinerary Segment Selector
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: List.generate(itineraries.length, (idx) {
                final isSelected = _selectedItineraryIndex == idx;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(
                      idx == 0 ? '🏝️ Cagbalete Loop' : idx == 1 ? '🌿 Falls & Heritage' : '🍲 Food & Culture',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: isSelected ? FontWeight.w900 : FontWeight.w600,
                        color: isSelected ? Colors.white : const Color(0xFF334155),
                      ),
                    ),
                    selected: isSelected,
                    selectedColor: const Color(0xFF14532D),
                    backgroundColor: const Color(0xFFF1F5F9),
                    onSelected: (_) => setState(() => _selectedItineraryIndex = idx),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(height: 14),

          // Selected Itinerary Content
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  current['title'] as String,
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: Color(0xFF0F172A)),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.schedule, size: 13, color: Color(0xFF0F766E)),
                    const SizedBox(width: 5),
                    Text(
                      current['duration'] as String,
                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Color(0xFF0F766E)),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Divider(height: 1),
                const SizedBox(height: 10),
                ...((current['stops'] as List<String>).map((stop) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(top: 4),
                          child: Icon(Icons.circle, size: 6, color: Color(0xFF14532D)),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            stop,
                            style: const TextStyle(fontSize: 12.5, color: Color(0xFF334155), height: 1.3),
                          ),
                        ),
                      ],
                    ),
                  );
                })),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // Port Guide & Boat Schedule
  Widget _buildPortGuideCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFF0FDF4),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFBBF7D0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.directions_boat_outlined, color: Color(0xFF14532D), size: 22),
              SizedBox(width: 10),
              Text(
                'Mauban Port ↔ Cagbalete Boats',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: Color(0xFF14532D)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            '• Standard boat departures from Mauban Port: 07:00 AM, 10:00 AM, 01:00 PM, and 04:00 PM.',
            style: TextStyle(fontSize: 12.5, color: Color(0xFF166534), height: 1.4),
          ),
          const SizedBox(height: 4),
          const Text(
            '• Island Port Arrival: Sabang Port (during high tide) or Mappit Port (during low tide).',
            style: TextStyle(fontSize: 12.5, color: Color(0xFF166534), height: 1.4),
          ),
          const SizedBox(height: 4),
          const Text(
            '• Environmental & Tourism Fee: ₱50 per tourist payable at the passenger terminal.',
            style: TextStyle(fontSize: 12.5, color: Color(0xFF166534), height: 1.4),
          ),
        ],
      ),
    );
  }
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({
    super.key,
    required this.profile,
    required this.visits,
    required this.feedbackHistory,
    this.onSignOut,
  });

  final MobileUserProfile profile;
  final List<MobileVisitReceipt> visits;
  final List<MobileFeedbackReceipt> feedbackHistory;
  final VoidCallback? onSignOut;

  void _confirmSignOut(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.logout, color: Colors.red),
            SizedBox(width: 10),
            Text('Sign Out', style: TextStyle(fontWeight: FontWeight.w900)),
          ],
        ),
        content: const Text(
          'Are you sure you want to sign out of Mauban Tourism? You will return to the welcome screen.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.muted)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              Navigator.of(context).pop();
              if (onSignOut != null) {
                onSignOut!();
              }
            },
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        const PageTitle(title: 'Profile', subtitle: 'Tourist guide services'),
        const SizedBox(height: 8),
        Center(
          child: Stack(
            children: [
              CircleAvatar(
                radius: 44,
                backgroundColor: const Color(0xffd8f5e4),
                child: Text(
                  profile.initials,
                  style: const TextStyle(
                    color: AppColors.green,
                    fontWeight: FontWeight.w900,
                    fontSize: 26,
                  ),
                ),
              ),
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(
                    color: AppColors.deepGreen,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.verified_user, color: Colors.white, size: 14),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          profile.displayName,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
        ),
        const Text(
          'Registered Tourist Explorer • Mauban, Quezon',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.muted, fontSize: 12),
        ),
        const SizedBox(height: 20),

        // Activity Links
        ProfileLink(
          icon: Icons.route_outlined,
          label: 'Visit History & Entry Passes (${visits.length})',
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) => VisitHistoryPage(visits: visits),
            ),
          ),
        ),
        ProfileLink(
          icon: Icons.feedback_outlined,
          label: 'My Submitted Feedback (${feedbackHistory.length})',
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) =>
                  FeedbackHistoryPage(feedbackHistory: feedbackHistory),
            ),
          ),
        ),
        const SizedBox(height: 14),

        // Contact Info
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
        const SizedBox(height: 16),

        // Emergency Hotlines & Tourist Assistance
        SectionHeader(title: 'Emergency Hotlines & Helpdesk'),
        _EmergencyContactCard(
          icon: Icons.local_hospital_outlined,
          title: 'Mauban MDRRMO / Rescue 24/7',
          number: '0998-598-8422 / (042) 784-0123',
          color: const Color(0xFFEF4444),
        ),
        _EmergencyContactCard(
          icon: Icons.local_police_outlined,
          title: 'Mauban Municipal Police (PNP)',
          number: '0998-598-5777 / (042) 784-0200',
          color: const Color(0xFF2563EB),
        ),
        _EmergencyContactCard(
          icon: Icons.directions_boat_outlined,
          title: 'Coast Guard Sub-Station Mauban',
          number: '0917-842-7643',
          color: const Color(0xFF0D9488),
        ),
        _EmergencyContactCard(
          icon: Icons.support_agent_outlined,
          title: 'Mauban Tourism Information Desk',
          number: '(042) 784-0555 • tourism@mauban.gov.ph',
          color: AppColors.deepGreen,
        ),
        const SizedBox(height: 20),

        OutlinedButton.icon(
          onPressed: () => _confirmSignOut(context),
          icon: const Icon(Icons.logout),
          label: const Text('Sign Out'),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.red,
            side: const BorderSide(color: Color(0xFFFECDD3)),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
      ],
    );
  }
}

class _EmergencyContactCard extends StatelessWidget {
  const _EmergencyContactCard({
    required this.icon,
    required this.title,
    required this.number,
    required this.color,
  });

  final IconData icon;
  final String title;
  final String number;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5),
                ),
                const SizedBox(height: 2),
                Text(
                  number,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class DestinationImageSlideshow extends StatefulWidget {
  const DestinationImageSlideshow({
    super.key,
    required this.destination,
    this.height,
  });

  final Destination destination;
  final double? height;

  @override
  State<DestinationImageSlideshow> createState() =>
      _DestinationImageSlideshowState();
}

class _DestinationImageSlideshowState
    extends State<DestinationImageSlideshow> {
  late final PageController _pageController;
  int _currentPage = 0;
  Timer? _timer;

  List<String> get _images {
    final list = <String>[];
    for (final img in widget.destination.images) {
      if (img.trim().isNotEmpty && !list.contains(img.trim())) {
        list.add(img.trim());
      }
    }
    final defaultAsset = imageAssetFor(widget.destination.imageKey);
    if (!list.contains(defaultAsset)) {
      list.add(defaultAsset);
    }
    return list;
  }

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    if (_images.length <= 1) return;
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_pageController.hasClients) return;
      final next = (_currentPage + 1) % _images.length;
      _pageController.animateToPage(
        next,
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeInOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  Widget _buildImage(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return Image.network(
        path,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) =>
            DestinationImage(destination: widget.destination),
      );
    }
    if (path.startsWith('/media/')) {
      final fullUrl = '$apiBaseUrl$path';
      return Image.network(
        fullUrl,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) =>
            DestinationImage(destination: widget.destination),
      );
    }
    return Image.asset(
      path,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) =>
          DestinationImage(destination: widget.destination),
    );
  }

  @override
  Widget build(BuildContext context) {
    final images = _images;
    if (images.isEmpty) {
      return DestinationImage(
        destination: widget.destination,
        height: widget.height,
      );
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        PageView.builder(
          controller: _pageController,
          onPageChanged: (idx) => setState(() => _currentPage = idx),
          itemCount: images.length,
          itemBuilder: (context, index) => _buildImage(images[index]),
        ),
        if (images.length > 1)
          Positioned(
            top: 14,
            right: 14,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.65),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.photo_library_outlined,
                    size: 12,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${_currentPage + 1} / ${images.length}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class DestinationDetailPage extends StatefulWidget {
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
  State<DestinationDetailPage> createState() => _DestinationDetailPageState();
}

class _DestinationDetailPageState extends State<DestinationDetailPage> {
  bool _loading = true;
  List<MobileFeedbackReceipt> _recentFeedback = [];

  @override
  void initState() {
    super.initState();
    _fetchDetail();
  }

  Future<void> _fetchDetail() async {
    try {
      final data = await widget.api.fetchDestinationDetail(widget.destination.id);
      if (data.containsKey('recentFeedback')) {
        final list = data['recentFeedback'] as List;
        setState(() {
          _recentFeedback = list.map((e) => MobileFeedbackReceipt.fromResponse(
            e,
            destination: widget.destination,
            reviewer: e['reviewer'] ?? '',
            rating: e['rating'] ?? 5,
          )).toList();
        });
      }
    } catch (_) {
      // Ignore errors, keep empty list
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 320,
            pinned: true,
            backgroundColor: AppColors.green,
            foregroundColor: Colors.white,
            flexibleSpace: FlexibleSpaceBar(
              titlePadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              title: Text(
                widget.destination.name,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  shadows: [
                    Shadow(
                      color: Colors.black54,
                      blurRadius: 8,
                      offset: Offset(0, 1),
                    ),
                  ],
                ),
              ),
              background: Stack(
                fit: StackFit.expand,
                children: [
                  DestinationImageSlideshow(
                    destination: widget.destination,
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        stops: [0.0, 0.5, 1.0],
                        colors: [
                          Colors.black38,
                          Colors.transparent,
                          Colors.black87,
                        ],
                      ),
                    ),
                  ),
                ],
              ),
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
                      RatingPill(rating: widget.destination.rating),
                      StatusPill(text: widget.destination.type),
                      PermitPill(verified: widget.destination.hasMayorPermit),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.destination.location,
                    style: const TextStyle(color: AppColors.muted),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    widget.destination.description,
                    style: const TextStyle(height: 1.45),
                  ),
                  if (widget.destination.access.trim().isNotEmpty) ...[
                    SectionHeader(title: 'How to get there'),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF0FDF4),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFBBF7D0)),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.directions_bus_outlined, color: AppColors.green, size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              widget.destination.access,
                              style: const TextStyle(
                                height: 1.4,
                                color: Color(0xFF166534),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  SectionHeader(title: 'Tourism Record'),
                  DestinationFactsPanel(destination: widget.destination),
                  SectionHeader(title: 'Amenities & Facilities'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _buildAmenityChips(widget.destination),
                  ),
                  SectionHeader(title: 'Location & Map'),
                  LocationCard(destination: widget.destination),
                  const SizedBox(height: 24),
                  SectionHeader(title: 'Tourist Ratings & Reviews'),
                  if (_loading)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: CircularProgressIndicator(),
                      ),
                    )
                  else if (_recentFeedback.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade50,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                      ),
                      child: const Column(
                        children: [
                          Icon(Icons.rate_review_outlined, color: Colors.grey, size: 32),
                          SizedBox(height: 8),
                          Text('No reviews yet. Be the first explorer to review!', style: TextStyle(color: Colors.grey, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    )
                  else
                    ..._recentFeedback.map((feedback) => Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.grey.shade200),
                          boxShadow: [
                            BoxShadow(color: Colors.black.withValues(alpha: 0.02), blurRadius: 4, offset: const Offset(0, 2)),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  feedback.reviewer,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                                Row(
                                  children: List.generate(
                                    5,
                                    (index) => Icon(
                                      index < feedback.rating ? Icons.star : Icons.star_border,
                                      size: 14,
                                      color: Colors.amber,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            if (feedback.date.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 4, bottom: 8),
                                child: Text(feedback.date, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                              ),
                            if (feedback.message.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(feedback.message, style: const TextStyle(fontSize: 13, height: 1.4)),
                              ),
                            if (feedback.photos.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: SizedBox(
                                  height: 68,
                                  child: ListView.separated(
                                    scrollDirection: Axis.horizontal,
                                    itemCount: feedback.photos.length,
                                    separatorBuilder: (context, index) => const SizedBox(width: 8),
                                    itemBuilder: (context, idx) {
                                      final photoUrl = feedback.photos[idx];
                                      final fullUrl = photoUrl.startsWith('http')
                                          ? photoUrl
                                          : '$apiBaseUrl$photoUrl';
                                      return ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: Image.network(
                                          fullUrl,
                                          width: 68,
                                          height: 68,
                                          fit: BoxFit.cover,
                                          errorBuilder: (context, error, stackTrace) => const Icon(
                                            Icons.image_not_supported,
                                            size: 24,
                                            color: Colors.grey,
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              ),
                            if (feedback.reply.isNotEmpty)
                              Container(
                                margin: const EdgeInsets.only(top: 12),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade50,
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border(left: BorderSide(color: AppColors.green, width: 3)),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Tourism Admin Response',
                                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.green),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(feedback.reply, style: const TextStyle(fontSize: 13, height: 1.4)),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    )),
                  const SizedBox(height: 80), // Padding for sticky bottom bar
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 16,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: SafeArea(
          child: Row(
            children: [
              OutlinedButton(
                onPressed: () async {
                  final receipt = await Navigator.of(context).push<MobileFeedbackReceipt>(
                    MaterialPageRoute(
                      builder: (context) => FeedbackPage(
                        api: widget.api,
                        destination: widget.destination,
                      ),
                    ),
                  );
                  if (receipt != null) {
                    widget.onFeedbackSubmitted(receipt);
                    _fetchDetail();
                  }
                },
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.star_outline, size: 18),
                    SizedBox(width: 4),
                    Text('Review'),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () async {
                    final receipt = await Navigator.of(context).push<MobileVisitReceipt>(
                      MaterialPageRoute(
                        builder: (context) => TouristRegistrationPage(
                          api: widget.api,
                          bootstrap: widget.bootstrap,
                          initialDestination: widget.destination,
                        ),
                      ),
                    );
                    if (receipt != null) widget.onVisitSubmitted(receipt);
                  },
                  icon: const Icon(Icons.confirmation_number_outlined),
                  label: const Text('Plan Visit / Get Pass', style: TextStyle(fontWeight: FontWeight.w900)),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.green,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildAmenityChips(Destination destination) {
    final type = destination.type.toLowerCase();
    final List<Map<String, dynamic>> items = [];

    if (type.contains('beach') || type.contains('island') || type.contains('cagbalete')) {
      items.addAll([
        {'icon': Icons.beach_access, 'label': 'White Sand Beach'},
        {'icon': Icons.pool, 'label': 'Swimming / Snorkeling'},
        {'icon': Icons.directions_boat, 'label': 'Boat Island Hop'},
        {'icon': Icons.cabin, 'label': 'Cottages & Huts'},
        {'icon': Icons.wifi, 'label': 'Wi-Fi Area'},
        {'icon': Icons.restaurant, 'label': 'Food & Drinks'},
        {'icon': Icons.shower, 'label': 'Clean Restrooms'},
      ]);
    } else if (type.contains('camp') || type.contains('resort')) {
      items.addAll([
        {'icon': Icons.cabin, 'label': 'Glamping & Tents'},
        {'icon': Icons.local_fire_department, 'label': 'Bonfire Area'},
        {'icon': Icons.wifi, 'label': 'Wi-Fi Available'},
        {'icon': Icons.local_parking, 'label': 'Vehicle Parking'},
        {'icon': Icons.restaurant, 'label': 'Grill / Dining'},
        {'icon': Icons.solar_power, 'label': '24/7 Electricity'},
      ]);
    } else if (type.contains('falls') || type.contains('nature')) {
      items.addAll([
        {'icon': Icons.water_drop, 'label': 'Freshwater Pool'},
        {'icon': Icons.hiking, 'label': 'Eco Trail Trek'},
        {'icon': Icons.photo_camera, 'label': 'Scenic Views'},
        {'icon': Icons.table_restaurant, 'label': 'Picnic Sheds'},
      ]);
    } else {
      items.addAll([
        {'icon': Icons.account_balance, 'label': 'Historical Marker'},
        {'icon': Icons.camera_alt, 'label': 'Photo Spot'},
        {'icon': Icons.directions_walk, 'label': 'Walking Tour'},
        {'icon': Icons.info_outline, 'label': 'Tourism Guide'},
      ]);
    }

    return items
        .map((item) => AmenityChip(
              icon: item['icon'] as IconData,
              label: item['label'] as String,
            ))
        .toList();
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
  final ImagePicker _imagePicker = ImagePicker();
  List<XFile> _photos = [];
  int _rating = 5;
  int _cleanliness = 5;
  bool _submitting = false;

  @override
  void dispose() {
    _name.dispose();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto(ImageSource source) async {
    try {
      if (source == ImageSource.gallery) {
        final picked = await _imagePicker.pickMultiImage(
          imageQuality: 80,
          maxWidth: 1600,
        );
        if (picked.isNotEmpty) {
          setState(() {
            _photos.addAll(picked);
            if (_photos.length > 5) {
              _photos = _photos.sublist(0, 5);
              showAppMessage(context, 'Maximum of 5 photos allowed.');
            }
          });
        }
      } else {
        final picked = await _imagePicker.pickImage(
          source: source,
          imageQuality: 80,
          maxWidth: 1600,
        );
        if (picked != null) {
          setState(() {
            _photos.add(picked);
            if (_photos.length > 5) {
              _photos = _photos.sublist(0, 5);
              showAppMessage(context, 'Maximum of 5 photos allowed.');
            }
          });
        }
      }
    } catch (error) {
      if (mounted) showAppMessage(context, 'Photo selection failed: $error');
    }
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
        const FormSectionTitle('Attach Photos (Optional)'),
        Row(
          children: [
            OutlinedButton.icon(
              onPressed: _photos.length >= 5 ? null : () => _pickPhoto(ImageSource.gallery),
              icon: const Icon(Icons.photo_library_outlined, size: 18),
              label: const Text('Gallery'),
            ),
            const SizedBox(width: 10),
            OutlinedButton.icon(
              onPressed: _photos.length >= 5 ? null : () => _pickPhoto(ImageSource.camera),
              icon: const Icon(Icons.camera_alt_outlined, size: 18),
              label: const Text('Camera'),
            ),
          ],
        ),
        if (_photos.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: SizedBox(
              height: 75,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _photos.length,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final photo = _photos[index];
                  return Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: FutureBuilder<Uint8List>(
                          future: photo.readAsBytes(),
                          builder: (context, snapshot) {
                            if (!snapshot.hasData) {
                              return Container(
                                width: 75,
                                height: 75,
                                color: Colors.grey.shade200,
                              );
                            }
                            return Image.memory(
                              snapshot.data!,
                              width: 75,
                              height: 75,
                              fit: BoxFit.cover,
                            );
                          },
                        ),
                      ),
                      Positioned(
                        top: 2,
                        right: 2,
                        child: GestureDetector(
                          onTap: () => setState(() => _photos.removeAt(index)),
                          child: Container(
                            padding: const EdgeInsets.all(2),
                            decoration: const BoxDecoration(
                              color: Colors.red,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.close,
                              size: 13,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
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
        sanitationComment: '',
        photos: _photos,
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
  final TextEditingController _firstName = TextEditingController();
  final TextEditingController _lastName = TextEditingController();
  final TextEditingController _contact = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _countryOfOrigin = TextEditingController(
    text: 'Philippines',
  );
  final TextEditingController _parkingSpace = TextEditingController();
  late DateTime _arrivalDate;
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
    final now = DateTime.now();
    _arrivalDate = DateTime(now.year, now.month, now.day);
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
    _firstName.dispose();
    _lastName.dispose();
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
      subtitle: 'Help us welcome you to Mauban',
      children: [
        // ── 1. Tourist Info (Katulad sa Web System) ──
        const FormSectionTitle('1. Tourist Info'),
        AppTextField(
          controller: _firstName,
          label: 'First name *',
          textCapitalization: TextCapitalization.words,
        ),
        AppTextField(
          controller: _lastName,
          label: 'Last name *',
          textCapitalization: TextCapitalization.words,
        ),
        AppTextField(
          controller: _contact,
          label: 'Contact number *',
          keyboardType: TextInputType.phone,
        ),
        AppTextField(
          controller: _email,
          label: 'Email address (Optional)',
          keyboardType: TextInputType.emailAddress,
        ),
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

        // ── 2. Location & Origin ──
        const FormSectionTitle('2. Location & Destination'),
        DropdownTile<RefItem>(
          label: 'Country *',
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
          label: 'Region *',
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
          label: 'Province *',
          value: _province,
          items: _provincesForRegion(_region),
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _province = item),
        ),
        AppTextField(controller: _countryOfOrigin, label: 'Country of origin *'),
        DropdownTile<Destination>(
          label: 'Destination / Resort *',
          value: _destination,
          items: widget.bootstrap.destinations,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _destination = item),
        ),

        // ── 3. Travel Details ──
        const FormSectionTitle('3. Travel Details'),
        DropdownTile<RefItem>(
          label: 'Travel Itinerary *',
          value: _itinerary,
          items: widget.bootstrap.itineraries,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _itinerary = item),
        ),
        DropdownTile<RefItem>(
          label: 'Vehicle Classification / Mode of Travel *',
          value: _travelMode,
          items: widget.bootstrap.travelModes,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _travelMode = item),
        ),
        DropdownTile<RefItem>(
          label: 'Boat Classification *',
          value: _boatType,
          items: widget.bootstrap.boatTypes,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _boatType = item),
        ),
        DropdownTile<String>(
          label: 'Boat Capacity & Fare',
          value: _boatCapacityFare,
          items: boatCapacityFareOptions,
          itemLabel: boatCapacityFareLabel,
          onChanged: (item) => setState(() => _boatCapacityFare = item),
        ),
        AppTextField(controller: _parkingSpace, label: 'Parking space (Optional)'),
        DropdownTile<RefItem>(
          label: 'Purpose of Travel *',
          value: _purpose,
          items: widget.bootstrap.visitPurposes,
          itemLabel: (item) => item.name,
          onChanged: (item) => setState(() => _purpose = item),
        ),
        PickerTile(
          icon: Icons.calendar_month_outlined,
          label: 'Arrival date *',
          value: shortDate(_arrivalDate),
          onTap: _pickDate,
        ),

        // ── 4. Head Count & Demographics ──
        const FormSectionTitle('4. Head Count & Demographics'),
        CounterPanel(
          title: 'Total Group Size',
          counters: [
            CounterItem('Total Visitors', _visitors, (value) {
              setState(() => _setVisitors(value));
            }),
          ],
        ),
        CounterPanel(
          title: 'Nationality & Residence (Must equal Total Visitors)',
          counters: [
            CounterItem('Filipino', _filipino, (value) {
              setState(() {
                _filipino = clampInt(value, 0, _visitors);
                _foreign = _visitors - _filipino;
                _maubanin = clampInt(_maubanin, 0, _filipino);
              });
            }),
            CounterItem('Foreigner', _foreign, (value) {
              setState(() {
                _foreign = clampInt(value, 0, _visitors);
                _filipino = _visitors - _foreign;
                _maubanin = clampInt(_maubanin, 0, _filipino);
              });
            }),
            CounterItem('Maubanin (Local Resident, subset of Filipino)', _maubanin, (value) {
              setState(() {
                _maubanin = clampInt(value, 0, _filipino);
              });
            }),
          ],
        ),
        CounterPanel(
          title: 'Gender Breakdown (Must equal Total Visitors)',
          counters: [
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
          ],
        ),
        CounterPanel(
          title: 'Age Groups (Must equal Total Visitors)',
          counters: [
            CounterItem('Age 0-7 (Children)', _age0To7, (value) {
              setState(() {
                _age0To7 = clampInt(value, 0, _visitors);
                _syncAgeGroups();
              });
            }),
            CounterItem('Age 8-59 (Adults)', _age8To59, (value) {
              setState(() => _setAge8To59(value));
            }),
            CounterItem('Age 60+ (Seniors)', _age60Above, (value) {
              setState(() {
                _age60Above = clampInt(value, 0, _visitors);
                _syncAgeGroups();
              });
            }),
          ],
        ),
        CounterPanel(
          title: 'Special Groups (Within Total Visitors)',
          counters: [
            CounterItem('Senior / PWD / Pregnant / 7 below', _specialGroup, (value) {
              setState(() {
                _specialGroup = clampInt(value, 0, _visitors);
              });
            }),
          ],
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
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: _arrivalDate.isBefore(today) ? today : _arrivalDate,
      firstDate: today, // Hindi na mapipindot ang mga nakaraang petsa!
      lastDate: today.add(const Duration(days: 365)),
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

    final firstName = formatProperName(_firstName.text);
    final lastName = formatProperName(_lastName.text);
    final fullName = '$firstName $lastName'.trim();

    try {
      final response = await widget.api.registerVisit(
        firstName: firstName,
        lastName: lastName,
        fullName: fullName,
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
        await showDialog(
          context: context,
          builder: (context) => TouristDigitalPassModal(receipt: receipt),
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
    final firstName = _firstName.text.trim();
    final lastName = _lastName.text.trim();
    final contact = _contact.text.trim();
    final email = _email.text.trim();
    final countryOfOrigin = _countryOfOrigin.text.trim();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    if (firstName.isEmpty) return 'First name is required.';
    if (lastName.isEmpty) return 'Last name is required.';
    if (contact.isEmpty) return 'Contact number is required.';
    if (email.isNotEmpty && !email.contains('@')) {
      return 'Enter a valid email address or leave email blank.';
    }
    if (!_consentConfirmed) {
      return 'Consent is required before submitting.';
    }
    if (_arrivalDate.isBefore(today)) {
      return 'Arrival date cannot be in the past. Please select today or a future date.';
    }
    if (_destination.id == 0 || widget.bootstrap.destinations.isEmpty) {
      return 'No destination is loaded from the Tourism Web System yet.';
    }
    if (countryOfOrigin.isEmpty) return 'Country of origin is required.';
    if (_visitors < 1) return 'At least one visitor is required.';
    if (_male + _female != _visitors) {
      return 'Male and female counts must equal total visitors.';
    }
    if (_filipino + _foreign != _visitors) {
      return 'Filipino and foreigner counts must equal total visitors.';
    }
    if (_maubanin > _filipino) {
      return 'Maubanin count cannot be greater than Filipino count.';
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
    _syncClassification();
    _specialGroup = clampInt(_specialGroup, 0, _visitors);
    _syncAgeGroups();
  }

  void _syncClassification() {
    _foreign = clampInt(_foreign, 0, _visitors);
    _filipino = clampInt(_visitors - _foreign, 0, _visitors);
    _maubanin = clampInt(_maubanin, 0, _filipino);
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
