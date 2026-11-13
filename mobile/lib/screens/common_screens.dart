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
                                ? context.brand.primary
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
              color: item.colorOf(context),
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
        message: 'Signing In to Cagbalete Island Guide...',
        subtext: 'Synchronizing tourist profile and destinations...',
      );
    }

    return Scaffold(
      backgroundColor: context.brand.page,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 10),
              Image.asset('assets/tourism_logo.png', width: 80, height: 80),
              const SizedBox(height: 16),
              const Text(
                'Mabuhay Mauban',
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
                title: "I'm Resort Staff",
                subtitle:
                    "Scan tourist QR passes, check the visitor's details, and record arrivals",
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
        splashColor: context.brand.primary.withValues(alpha: 0.12),
        highlightColor: context.brand.primary.withValues(alpha: 0.06),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: context.brand.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: context.brand.deep, size: 26),
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

class NotificationPage extends StatefulWidget {
  const NotificationPage({
    super.key,
    required this.notifications,
    this.subtitle = 'Sanitary advisories and compliance updates',
    this.severityStripe = false,
    this.now,
    this.onSeen,
    this.onDismiss,
    this.onOpen,
  });

  final List<AppNotification> notifications;
  final String subtitle;

  /// Called once, when the page is shown, with the ids of the notices on it: the tourist has now seen them (the red dot on the bell goes).
  final ValueChanged<List<String>>? onSeen;

  /// Called when the tourist removes a notice (the X, or a swipe). The phone keeps it removed, so it does not come back when the app is opened again.
  /// Without it the page is as it was: no X and no swipe.
  final ValueChanged<String>? onDismiss;

  /// Called when a notice that leads somewhere is pressed (an answer to a review opens that review).
  final ValueChanged<AppNotification>? onOpen;

  /// The moment the dates under the notices are told from (the clock when null). Only for a test to fix it.
  final DateTime? now;

  /// A line of the colour of its weight down the left of each notice, instead of the round icon (the tourism side asks for it). False: the round icon,
  /// as the sanitation side has always had.
  final bool severityStripe;

  @override
  State<NotificationPage> createState() => _NotificationPageState();
}

class _NotificationPageState extends State<NotificationPage> {
  late final List<AppNotification> _items = List.of(widget.notifications);

  @override
  void initState() {
    super.initState();
    final onSeen = widget.onSeen;
    if (onSeen != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) onSeen(_items.map((item) => item.id).toList());
      });
    }
  }

  void _dismiss(AppNotification item) {
    setState(() => _items.removeWhere((other) => other.id == item.id));
    widget.onDismiss?.call(item.id);
  }

  @override
  Widget build(BuildContext context) {
    final notifications = _items;
    final subtitle = widget.subtitle;
    final severityStripe = widget.severityStripe;
    final now = widget.now;
    return FormPageScaffold(
      title: 'Notifications',
      subtitle: subtitle,
      // the tourism side: 16 around the page, the subtitle begins where the notices begin (the same left edge as the box of the first one), and the
      // title stays on the left after the back arrow on every platform
      titleAtStart: severityStripe,
      padding: severityStripe ? const EdgeInsets.fromLTRB(16, 8, 16, 24) : const EdgeInsets.fromLTRB(18, 8, 18, 24),
      leading: IconButton(
        icon: const Icon(Icons.arrow_back),
        tooltip: '',
        onPressed: () => Navigator.of(context).pop(),
      ),
      children: notifications.isEmpty
          ? [
              const Card(
                elevation: 0,
                color: Colors.white,
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Column(
                    children: [
                      Icon(
                        Icons.notifications_off_outlined,
                        size: 38,
                        color: AppColors.muted,
                      ),
                      SizedBox(height: 12),
                      Text(
                        'No new advisories',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                        ),
                      ),
                      SizedBox(height: 6),
                      Text(
                        'Check back later for official announcements.',
                        style: TextStyle(
                          color: AppColors.muted,
                          fontSize: 13,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ]
          : notifications
              .map(
                (item) => severityStripe
                    ? _Notice(
                        item: item,
                        now: now ?? DateTime.now(),
                        onDismiss: widget.onDismiss == null ? null : () => _dismiss(item),
                        onOpen: (item.isReply || item.isPass) && widget.onOpen != null ? () => widget.onOpen!(item) : null,
                      )
                    : Card(
                        elevation: 0,
                        color: Colors.white,
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: item.colorFor(context).withValues(alpha: 0.14),
                            child: Icon(item.icon, color: item.colorFor(context)),
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

/// One notice of the tourism side: a white box, a line of the colour of its weight down the left edge (the corners follow the box), the title, the
/// message (three lines at most), and under it the word of the weight and when it was written. One label for a screen reader.
class _Notice extends StatelessWidget {
  const _Notice({required this.item, required this.now, this.onDismiss, this.onOpen});

  final AppNotification item;
  final DateTime now;

  /// The X and the swipe (null: neither). The tourism side gives it, so that a notice can be removed and stay removed.
  final VoidCallback? onDismiss;

  /// Pressing the notice (null: it leads nowhere).
  final VoidCallback? onOpen;

  static const _radius = 14.0;

  @override
  Widget build(BuildContext context) {
    final when = item.whenLabel(now);
    final label = [item.severityLabel, item.title, item.message, ?when].join(', ');
    final dismissable = onDismiss != null;
    final box = Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Semantics(
        container: true,
        button: onOpen != null,
        onTap: onOpen,
        label: label,
        child: ExcludeSemantics(
          child: DecoratedBox(
            key: ValueKey('notice-${item.id}'),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(_radius),
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2)),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(_radius),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(key: ValueKey('notice-stripe-${item.id}'), width: 4, color: item.severityColor),
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: onOpen,
                        child: Padding(
                        padding: EdgeInsets.fromLTRB(14, 14, dismissable ? 40 : 14, 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.title,
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                            ),
                            const SizedBox(height: 7),
                            Text(
                              item.message,
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13, color: AppColors.muted),
                            ),
                            const SizedBox(height: 10),
                            Text.rich(
                              TextSpan(
                                children: [
                                  TextSpan(
                                    text: item.severityLabel,
                                    style: TextStyle(fontWeight: FontWeight.w800, color: item.severityTextColor),
                                  ),
                                  if (when != null)
                                    TextSpan(
                                      text: ' · $when',
                                      style: const TextStyle(fontWeight: FontWeight.w500, color: AppColors.muted),
                                    ),
                                ],
                              ),
                              style: const TextStyle(fontSize: 11.5),
                            ),
                          ],
                        ),
                      ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
    if (!dismissable) return box;

    // Removed by the X or by a swipe either way. The X is outside the one label of the notice, so a screen reader finds it as a button of its own.
    return Dismissible(
      key: ValueKey('dismiss-${item.id}'),
      direction: DismissDirection.horizontal,
      onDismissed: (_) => onDismiss!(),
      child: Stack(
        children: [
          box,
          Positioned(
            top: 2,
            right: 2,
            child: IconButton(
              key: ValueKey('notice-x-${item.id}'),
              icon: const Icon(Icons.close, size: 18, color: AppColors.muted),
              tooltip: 'Remove this notification',
              onPressed: onDismiss,
            ),
          ),
        ],
      ),
    );
  }
}

/// One of the tourist's own passes, opened from the notice that says it was scanned or cancelled: the pass itself, with its status as it stands now.
class PassDetailPage extends StatelessWidget {
  const PassDetailPage({super.key, required this.receipt});

  final MobileVisitReceipt receipt;

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'My Pass',
      subtitle: receipt.destination.name,
      children: [VisitReceiptCard(receipt: receipt)],
    );
  }
}

/// One of the tourist's own reviews, opened from the notice that says it was answered: what they wrote, and the office's answer in full.
class FeedbackDetailPage extends StatelessWidget {
  const FeedbackDetailPage({super.key, required this.receipt});

  final MobileFeedbackReceipt receipt;

  @override
  Widget build(BuildContext context) {
    final reply = receipt.reply.trim();
    return FormPageScaffold(
      title: 'My Review',
      subtitle: receipt.destination.name,
      children: [
        FeedbackReceiptCard(receipt: receipt),
        if (receipt.message.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 12),
            child: Text(receipt.message.trim(), key: const ValueKey('review-message'), style: const TextStyle(fontSize: 14, height: 1.4)),
          ),
        Container(
          key: const ValueKey('review-reply'),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.grey.shade50,
            borderRadius: BorderRadius.circular(10),
            border: Border(left: BorderSide(color: context.brand.primary, width: 3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Reply from the Tourism Office', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: context.brand.primary)),
              const SizedBox(height: 6),
              Text(reply.isEmpty ? 'No reply yet.' : reply, style: const TextStyle(fontSize: 14, height: 1.45)),
            ],
          ),
        ),
      ],
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
