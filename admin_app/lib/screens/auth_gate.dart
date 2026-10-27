import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../widgets/skeleton.dart';

/// Restores the saved session before showing the login screen, so a restart
/// does not force the user to sign in again.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final signedIn = await AuthService.restoreSession();
    if (!mounted) return;
    Navigator.of(context).pushReplacementNamed(signedIn ? '/home' : '/login');
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFF121214),
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Konkani Samudai',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFFF5EFEB),
                  letterSpacing: -0.5,
                ),
              ),
              SizedBox(height: 6),
              Text(
                'Cinema Gazette & Curatorial Control',
                style: TextStyle(
                  fontSize: 12,
                  color: Color(0xFF9E9890),
                  fontStyle: FontStyle.italic,
                ),
              ),
              SizedBox(height: 28),
              const SizedBox(
                width: 130,
                child: KkPageSkeleton(blocks: 1),
              ),
            ],
          ),
        ),
      ),
    );
  }
}