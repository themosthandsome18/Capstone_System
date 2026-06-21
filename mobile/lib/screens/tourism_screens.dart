part of '../main.dart';

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
  int _rating = 5;
  int _cleanliness = 5;
  bool _submitting = false;

  @override
  void dispose() {
    _name.dispose();
    _comment.dispose();
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
