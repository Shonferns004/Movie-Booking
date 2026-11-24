import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

import '../services/auth_service.dart';
import 'scanner_shell.dart' show KkSurface;

/// The app's own branded splash. The Android launch window is a plain dark
/// colour, so this is the first visible screen instead of a native logo splash.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: KkSurface.bg,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
    );
    _boot();
  }

  Future<void> _boot() async {
    final restore = AuthService.restoreSession();
    await Future<void>.delayed(const Duration(milliseconds: 1350));
    final signedIn = await restore;
    if (!mounted) return;
    Navigator.of(context).pushReplacementNamed(signedIn ? '/home' : '/login');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: KkSurface.bg,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF23282F), Color(0xFF121418)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0.82, end: 1),
                  duration: const Duration(milliseconds: 850),
                  curve: Curves.easeOutBack,
                  builder: (context, value, child) {
                    return Transform.scale(
                      scale: value,
                      child: Opacity(
                        opacity: value.clamp(0.0, 1.0).toDouble(),
                        child: child,
                      ),
                    );
                  },
                  child: Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      color: KkSurface.container,
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(
                        color: KkSurface.accent.withValues(alpha: 0.7),
                        width: 1.4,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: KkSurface.accent.withValues(alpha: 0.16),
                          blurRadius: 38,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: const Icon(
                      TablerIcons.movie,
                      size: 44,
                      color: KkSurface.accent,
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Konkani Samudai',
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.6,
                    color: KkSurface.onSurface,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  'A D M I N',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 5.5,
                    color: KkSurface.accent,
                  ),
                ),
                const SizedBox(height: 36),
                SizedBox(
                  width: 132,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: const LinearProgressIndicator(
                      minHeight: 2.5,
                      color: KkSurface.accent,
                      backgroundColor: Color(0xFF343B43),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Preparing your cinema control room',
                  style: TextStyle(
                    fontSize: 11,
                    color: KkSurface.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
