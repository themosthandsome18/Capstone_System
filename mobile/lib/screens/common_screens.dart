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
  bool _isRegisterMode = false;
  bool _obscurePassword = true;

  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _contactController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _contactController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _handleLogin() {
    setState(() => _isLoading = true);
    Future.delayed(const Duration(milliseconds: 1400), () {
      if (mounted) {
        widget.onContinue();
      }
    });
  }

  Future<void> _handleRegister() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);
    try {
      final api = const TourismApi();
      final result = await api.registerTourist(
        fullName: _nameController.text.trim(),
        email: _emailController.text.trim(),
        contactNumber: _contactController.text.trim(),
        password: _passwordController.text,
      );

      if (!mounted) return;
      setState(() => _isLoading = false);

      final userName =
          result['user']?['full_name'] ?? _nameController.text.trim();
      _showRegistrationSuccessDialog(userName);
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
          backgroundColor: Colors.red.shade700,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _showRegistrationSuccessDialog(String name) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: Color(0xFFDCFCE7),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check_circle_outline_rounded,
                color: Color(0xFF16A34A),
                size: 52,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Registration Successful!',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 21,
                color: AppColors.ink,
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Maligayang pagdating sa Mauban, $name! Matagumpay na nagawa ang iyong Tourist Account. Handa ka na mag-explore at mag-apply ng iyong travel permits.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.muted,
                fontSize: 14,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF0FDF4),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFBBF7D0)),
              ),
              child: Row(
                children: const [
                  Icon(
                    Icons.notifications_active_outlined,
                    color: Color(0xFF16A34A),
                    size: 22,
                  ),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Makakatanggap ka ng in-app notification kapag na-check o naaprubahan ng Admin ang iyong record sa Record Management.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF166534),
                        fontWeight: FontWeight.w600,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actionsPadding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        actions: [
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                widget.onContinue();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.deepGreen,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 0,
              ),
              child: const Text(
                'Start Exploring Mauban',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return TourismLoadingScreen(
        message: _isRegisterMode
            ? 'Creating Your Tourist Account...'
            : 'Signing In to Mauban Tourism...',
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
              Text(
                _isRegisterMode ? 'Gumawa ng Sariling Account' : 'Welcome Back',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 23,
                  fontWeight: FontWeight.w900,
                  color: AppColors.ink,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                _isRegisterMode
                    ? 'Mag-rehistro ng iyong Tourist Account para sa pag-explore at approvals'
                    : 'Sign in with your existing account to continue',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.muted, fontSize: 13.5),
              ),
              const SizedBox(height: 22),

              // Segmented switcher
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _isRegisterMode = false),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color:
                                !_isRegisterMode
                                    ? Colors.white
                                    : Colors.transparent,
                            borderRadius: BorderRadius.circular(10),
                            boxShadow:
                                !_isRegisterMode
                                    ? [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.08),
                                        blurRadius: 4,
                                        offset: const Offset(0, 2),
                                      ),
                                    ]
                                    : null,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            'Sign In',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              color:
                                  !_isRegisterMode
                                      ? AppColors.deepGreen
                                      : Colors.grey.shade600,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _isRegisterMode = true),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color:
                                _isRegisterMode
                                    ? Colors.white
                                    : Colors.transparent,
                            borderRadius: BorderRadius.circular(10),
                            boxShadow:
                                _isRegisterMode
                                    ? [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.08),
                                        blurRadius: 4,
                                        offset: const Offset(0, 2),
                                      ),
                                    ]
                                    : null,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            'Create Account',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              color:
                                  _isRegisterMode
                                      ? AppColors.deepGreen
                                      : Colors.grey.shade600,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              if (!_isRegisterMode) ...[
                LoginButton(
                  icon: Icons.g_mobiledata,
                  label: 'Continue with Google',
                  onTap: _handleLogin,
                ),
                LoginButton(
                  icon: Icons.facebook,
                  label: 'Continue with Facebook',
                  onTap: _handleLogin,
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _handleLogin,
                    icon: const Icon(Icons.login),
                    label: const Text(
                      'Sign In as Guest / Tourist',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 14.5,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.green,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      elevation: 0,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      "Don't have an account yet? ",
                      style: TextStyle(color: AppColors.muted, fontSize: 13),
                    ),
                    GestureDetector(
                      onTap: () => setState(() => _isRegisterMode = true),
                      child: const Text(
                        'Create Account',
                        style: TextStyle(
                          color: AppColors.deepGreen,
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ] else ...[
                // Registration Form
                Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      TextFormField(
                        controller: _nameController,
                        textCapitalization: TextCapitalization.words,
                        decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.person_outline),
                          labelText: 'Full Name *',
                          hintText: 'e.g. Maria Santos',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Please enter your full name';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.email_outlined),
                          labelText: 'Email Address *',
                          hintText: 'e.g. maria@example.com',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Please enter your email address';
                          }
                          if (!value.contains('@') || !value.contains('.')) {
                            return 'Please enter a valid email address';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _contactController,
                        keyboardType: TextInputType.phone,
                        decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.phone_outlined),
                          labelText: 'Contact Number',
                          hintText: 'e.g. 09171234567',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_off
                                  : Icons.visibility,
                            ),
                            onPressed:
                                () => setState(
                                  () => _obscurePassword = !_obscurePassword,
                                ),
                          ),
                          labelText: 'Password *',
                          hintText: 'At least 6 characters',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                        ),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Please enter a password';
                          }
                          if (value.length < 6) {
                            return 'Password must be at least 6 characters';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _handleRegister,
                          icon: const Icon(Icons.person_add_alt_1),
                          label: const Text(
                            'Register Account',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 15,
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.deepGreen,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            elevation: 0,
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text(
                            'Already have an account? ',
                            style: TextStyle(
                              color: AppColors.muted,
                              fontSize: 13,
                            ),
                          ),
                          GestureDetector(
                            onTap:
                                () => setState(() => _isRegisterMode = false),
                            child: const Text(
                              'Sign In',
                              style: TextStyle(
                                color: AppColors.deepGreen,
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 24),
              Row(
                children: [
                  const Expanded(child: Divider(color: Color(0xFFCBD5E1))),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Text(
                      'OR RESORT STAFF',
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ),
                  const Expanded(child: Divider(color: Color(0xFFCBD5E1))),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () {
                    openStaffQrPortalWithAuth(
                      context,
                      api: const TourismApi(),
                      bootstrap: MobileBootstrap.fallback(),
                    );
                  },
                  icon: const Icon(
                    Icons.qr_code_scanner,
                    color: Color(0xFF14532D),
                  ),
                  label: const Text(
                    'Resort Staff QR Portal',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: Color(0xFF14532D),
                      fontSize: 15,
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: const BorderSide(
                      color: Color(0xFF14532D),
                      width: 1.5,
                    ),
                    backgroundColor: const Color(0xFFF0FDF4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
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
