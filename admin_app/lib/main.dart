import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/collection_screen.dart';
import 'screens/auth_gate.dart';
import 'services/auth_service.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});
  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;
  final _screens = const [HomeScreen(), CollectionScreen()];
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_index],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.account_balance_wallet), label: 'Collection'),
        ],
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
        '/home': (_) => const HomeScreen(),
      },
    );
  }
}
