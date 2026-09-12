part of '../main.dart';

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

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.onContinue});

  final VoidCallback onContinue;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  bool _isLoading = false;

  void _handleLogin() {
    setState(() => _isLoading = true);
    Future.delayed(const Duration(milliseconds: 1400), () {
      if (mounted) {
        widget.onContinue();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const TourismLoadingScreen(
        message: 'Signing In to Mauban Tourism...',
        subtext: 'Synchronizing tourist profile and destinations...',
      );
    }

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 10),
              Image.asset('assets/tourism_logo.jpg', width: 80, height: 80),
              const SizedBox(height: 16),
              const Text(
                'Welcome to Mauban',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 23,
                  fontWeight: FontWeight.w900,
                  color: AppColors.ink,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                "Choose how you'd like to continue",
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.muted, fontSize: 13.5),
              ),
              const SizedBox(height: 24),
              _buildOptionCard(
                icon: Icons.travel_explore_outlined,
                title: "I'm a Tourist / Visitor",
                subtitle:
                    'Explore destinations, resorts, and travel guidelines',
                onTap: _handleLogin,
              ),
              const SizedBox(height: 12),
              _buildOptionCard(
                icon: Icons.badge_outlined,
                title: "I'm Tourism Staff",
                subtitle:
                    'Scan tourist QR passes and verify resort bookings',
                onTap: () {
                  openStaffQrPortalWithAuth(
                    context,
                    api: const TourismApi(),
                    bootstrap: MobileBootstrap.fallback(),
                  );
                },
              ),
              const SizedBox(height: 24),
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

  Widget _buildOptionCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.border, width: 1.2),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        splashColor: AppColors.green.withValues(alpha: 0.12),
        highlightColor: AppColors.green.withValues(alpha: 0.06),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.green.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: AppColors.deepGreen, size: 26),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w900,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: AppColors.muted,
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.arrow_forward_ios_rounded,
                size: 14,
                color: AppColors.muted,
              ),
            ],
          ),
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
