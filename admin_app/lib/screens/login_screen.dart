import 'package:flutter/material.dart';
import '../services/api.dart';
import '../services/auth_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await Api.login(_email.text.trim(), _password.text);
      await AuthService.saveLogin(data);
      if (!mounted) return;
      Navigator.pushReplacementNamed(context, '/home');
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1E2227),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(color: const Color(0xFF262C33), borderRadius: BorderRadius.circular(24), border: Border.all(color: const Color(0xFF2E353D))),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Konkani Samudai', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Color(0xFFF2F0EC), letterSpacing: -0.5)),
                    const Text('Cinema Gazette & Curatorial Control', style: TextStyle(fontSize: 12, color: Color(0xFF9E9890), fontStyle: FontStyle.italic)),
                    const SizedBox(height: 24),
                    TextField(controller: _email, decoration: const InputDecoration(labelText: 'Username')),
                    const SizedBox(height: 12),
                    TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
                    const SizedBox(height: 12),
                    if (_error != null) const Text('Invalid credentials', style: TextStyle(color: Color(0xFFC8FF1F))),
                    const SizedBox(height: 12),
                    SizedBox(width: double.infinity, child: ElevatedButton(onPressed: _loading ? null : _login, child: Text(_loading ? 'Logging in...' : 'ENTER'))),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
