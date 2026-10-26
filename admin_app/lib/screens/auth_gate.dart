import 'package:flutter/material.dart';

import '../services/auth_service.dart';

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
      body: Center(
        child: CircularProgressIndicator(color: Color(0xFFD96B43)),
      ),
    );
  }
}
