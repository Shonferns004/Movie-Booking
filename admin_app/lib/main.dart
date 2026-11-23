import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/auth_gate.dart';
import 'screens/scanner_shell.dart' show KkSurface;
import 'screens/community_home_screen.dart';
import 'services/auth_service.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});
  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0; // Home is the default tab
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
      // IndexedStack keeps each tab alive, so switching does not reload everything.
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: KkSurface.accent))
          : scannerOnly
              ? const HomeScreen()
              : IndexedStack(
                  index: _index,
                  children: [
                    // Home = community command centre (hero, members, notices, events).
                    CommunityHomeScreen(token: _token),
                    // The dashboard (formerly the Home page) lives in the Movies tab.
                    const HomeScreen(),
                    ProfileScreen(
                      token: _token ?? '',
                      shows: const [],
                      onSignOut: _signOut,
                    ),
                  ],
                ),
      bottomNavigationBar: scannerOnly ? null : _buildNav(),
    );
  }

  /// Same tab bar as the scanner shell: Lucide icons, poppins labels, hairline border.
  Widget _buildNav() {
    Widget item(IconData icon, String label, int index) {
      final active = _index == index;
      final iconColor = active ? KkSurface.accent : KkSurface.onSurfaceVariant;
      final labelColor = active ? KkSurface.onSurface : KkSurface.onSurfaceVariant;
      return Expanded(
        child: InkWell(
          onTap: () => setState(() => _index = index),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 24, color: iconColor),
                const SizedBox(height: 2),
                Text(
                  label,
                  style: GoogleFonts.publicSans(
                    fontSize: 11,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                    color: labelColor,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: Container(
          decoration: BoxDecoration(
            color: KkSurface.container,
            borderRadius: BorderRadius.circular(30),
            border: Border.all(color: KkSurface.border),
            boxShadow: const [
              BoxShadow(color: Color(0x66000000), blurRadius: 26, offset: Offset(0, 12)),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                item(LucideIcons.house, 'Home', 0),
                item(LucideIcons.film, 'Movies', 1),
                item(LucideIcons.circleUser, 'Profile', 2),
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
        fontFamily: GoogleFonts.publicSans().fontFamily,
        splashFactory: NoSplash.splashFactory,
        highlightColor: Colors.transparent,
        appBarTheme: const AppBarTheme(backgroundColor: Color(0xFF1E2227), foregroundColor: Color(0xFFF2F0EC), elevation: 0, centerTitle: false),
        cardTheme: CardThemeData(elevation: 0, margin: const EdgeInsets.symmetric(vertical: 6), color: const Color(0xFF262C33), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
        inputDecorationTheme: InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFF3A4148))), enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFF3A4148))), focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFC8FF1F))), filled: true, fillColor: const Color(0xFF1A1E23)),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)), backgroundColor: const Color(0xFFC8FF1F), foregroundColor: const Color(0xFF171B1F)),
        ),
      ),
      home: const AuthGate(),
      routes: {
        '/login': (_) => const LoginScreen(),
        // The shell holds the five tabs; '/home' stays the landing route so existing
        // navigation (auth gate, login, sign-out) keeps working.
        '/home': (_) => const MainShell(),
      },
    );
  }
}
