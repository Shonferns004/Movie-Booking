import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/scanner_shell.dart' show KkSurface;
import 'screens/community_home_screen.dart';
import 'screens/youpi_admin_screen.dart';
import 'services/auth_service.dart';
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});
  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0; // Home is the default tab
  bool _navCompact = false;
  String? _token;
  List<String> _roles = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadSession();
  }

  Future<void> _loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString('token') ?? '';
    final roles = (prefs.getString('roles') ?? '')
        .split(',')
        .map((role) => role.trim())
        .where((role) => role.isNotEmpty)
        .toList();
    final token = await AuthService.validAccessToken(cached);
    if (!mounted) return;
    if (token.isEmpty) {
      Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
      return;
    }
    setState(() {
      _token = token;
      _roles = roles;
      _loading = false;
    });
  }

  Future<void> _signOut() async {
    await AuthService.logout();
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    // Scanner accounts get the scanner shell only — its own Home/Profile tabs.
    final scannerOnly = _roles.contains('SCANNER') && !_roles.contains('ADMIN');

    return Scaffold(
      backgroundColor: KkSurface.bg,
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: KkSurface.accent))
          : scannerOnly
              ? const HomeScreen()
              : Stack(
                  children: [
                    Positioned.fill(
                      child: NotificationListener<ScrollNotification>(
                        onNotification: (notification) {
                          if (notification.metrics.axis != Axis.vertical) {
                            return false;
                          }
                          final compact = notification.metrics.pixels > 24;
                          if (compact != _navCompact) {
                            setState(() => _navCompact = compact);
                          }
                          return false;
                        },
                        child: IndexedStack(
                          index: _index,
                          children: [
                            // Home = community command centre (hero, members, notices, events).
                            CommunityHomeScreen(token: _token),
                            // The dashboard (formerly the Home page) lives in the Movies tab.
                            const HomeScreen(),
                            // Native YouPI payment/admin hub for the Payments tab.
                            // Settings lives under Profile -> Payment settings.
                            const YoupiAdminScreen(showSettingsTab: false),
                            ProfileScreen(
                              token: _token ?? '',
                              shows: const [],
                              onSignOut: _signOut,
                            ),
                          ],
                        ),
                      ),
                    ),
                    _buildFloatingNav(),
                  ],
                ),
    );
  }

  /// Solid black floating pill with a green active icon.
  Widget _buildFloatingNav() {
    final width = MediaQuery.sizeOf(context).width;
    final baseHorizontal = width >= 700 ? 64.0 : 30.0;
    final horizontal = baseHorizontal + (_navCompact ? 22.0 : 0.0);
    final barHeight = _navCompact ? 50.0 : 54.0;
    // Taller phones get a little more breathing room under the bar.
    final screenHeight = MediaQuery.sizeOf(context).height;
    final baseBottom = screenHeight >= 800 ? 30.0 : 22.0;
    final bottomMargin = baseBottom + (_navCompact ? -4.0 : 0.0);

    Widget item(IconData icon, String label, int index) {
      final active = _index == index;
      return Expanded(
        child: Tooltip(
          message: label,
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: () => setState(() {
              _index = index;
              _navCompact = false;
            }),
            child: Center(
              child: Icon(
                icon,
                size: active ? 24 : 22,
                color: active ? KkSurface.accent : KkSurface.onSurfaceVariant,
              ),
            ),
          ),
        ),
      );
    }

    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.only(bottom: 10),
        child: AnimatedPadding(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: EdgeInsets.fromLTRB(
            horizontal,
            0,
            horizontal,
            bottomMargin,
          ),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            height: barHeight,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF080A0D),
              borderRadius: BorderRadius.circular(barHeight / 2),
              border: Border.all(color: const Color(0xFF262C33)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x66000000),
                  blurRadius: 18,
                  offset: Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                item(TablerIcons.home, 'Home', 0),
                item(TablerIcons.movie, 'Movies', 1),
                item(TablerIcons.creditCard, 'Payments', 2),
                item(TablerIcons.userCircle, 'Profile', 3),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AuthService.init();
  runApp(const KonkaniAdminApp());
}

class KonkaniAdminApp extends StatelessWidget {
  const KonkaniAdminApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Konkani Samudai Admin',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFF1E2227),
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFC8FF1F), brightness: Brightness.dark).copyWith(surface: const Color(0xFF262C33), primary: const Color(0xFFC8FF1F), onPrimary: const Color(0xFF171B1F), onSurface: const Color(0xFFF2F0EC), secondary: const Color(0xFFB5AFA6), error: const Color(0xFFF08A80)),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: _KkPageTransitionsBuilder(),
        TargetPlatform.iOS: _KkPageTransitionsBuilder(),
        TargetPlatform.windows: _KkPageTransitionsBuilder(),
        TargetPlatform.macOS: _KkPageTransitionsBuilder(),
        TargetPlatform.linux: _KkPageTransitionsBuilder(),
      },
    ),
        splashFactory: NoSplash.splashFactory,
        highlightColor: Colors.transparent,
        appBarTheme: const AppBarTheme(backgroundColor: Color(0xFF1E2227), foregroundColor: Color(0xFFF2F0EC), elevation: 0, centerTitle: false),
        cardTheme: CardThemeData(elevation: 0, margin: const EdgeInsets.symmetric(vertical: 6), color: const Color(0xFF262C33), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
        inputDecorationTheme: InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFF3A4148))), enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFF3A4148))), focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFC8FF1F))), filled: true, fillColor: const Color(0xFF1A1E23)),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)), backgroundColor: const Color(0xFFC8FF1F), foregroundColor: const Color(0xFF171B1F)),
        ),
      ),
      home: AuthService.hasSession ? const MainShell() : const LoginScreen(),
      routes: {
        '/login': (_) => const LoginScreen(),
        // The shell holds the five tabs; '/home' stays the landing route so existing
        // navigation (auth gate, login, sign-out) keeps working.
        '/home': (_) => const MainShell(),
      },
    );
  }
}


/// Ease-in page transition used for every routed screen.
class _KkPageTransitionsBuilder extends PageTransitionsBuilder {
  const _KkPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.025),
          end: Offset.zero,
        ).animate(curved),
        child: child,
      ),
    );
  }
}
