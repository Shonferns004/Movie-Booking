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
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadSession();
  }

  Future<void> _loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString('token') ?? '';
    final token = await AuthService.validAccessToken(cached);
    if (!mounted) return;
    setState(() {
      _token = token;
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
    return Scaffold(
      backgroundColor: KkSurface.bg,
      // IndexedStack keeps each tab alive, so switching does not reload everything.
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: KkSurface.accent))
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
      bottomNavigationBar: _buildNav(),
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
                  style: GoogleFonts.poppins(
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

    return Container(
      decoration: const BoxDecoration(
        color: KkSurface.bg,
        border: Border(top: BorderSide(color: KkSurface.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
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
        scaffoldBackgroundColor: const Color(0xFF121214),
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFD96B43), brightness: Brightness.dark).copyWith(surface: const Color(0xFF1A1A1E), primary: const Color(0xFFD96B43), onSurface: const Color(0xFFF5EFEB)),
        fontFamily: GoogleFonts.poppins().fontFamily,
        splashFactory: NoSplash.splashFactory,
        highlightColor: Colors.transparent,
        appBarTheme: const AppBarTheme(backgroundColor: Color(0xFF121214), foregroundColor: Color(0xFFF5EFEB), elevation: 0, centerTitle: false),
        cardTheme: const CardThemeData(elevation: 0, margin: EdgeInsets.symmetric(vertical: 6), color: Color(0xFF1A1A1E)),
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder(), filled: true, fillColor: Color(0xFF1A1A1E)),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), backgroundColor: const Color(0xFFD96B43), foregroundColor: Colors.white),
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
