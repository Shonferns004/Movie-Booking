import 'package:flutter/material.dart';
import '../services/api.dart';
import '../services/auth_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'adminapp@movie.local');
  final _password = TextEditingController(text: 'adminapp123');
  bool _loading = false;
  String? _error;

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
      backgroundColor: const Color(0xFF121214),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(color: const Color(0xFF1A1A1E), borderRadius: BorderRadius.circular(24), border: Border.all(color: const Color(0xFF2F2F37))),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Konkani Samudai', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Color(0xFFF5EFEB), letterSpacing: -0.5)),
                    const Text('Cinema Gazette & Curatorial Control', style: TextStyle(fontSize: 12, color: Color(0xFF9E9890), fontStyle: FontStyle.italic)),
                    const SizedBox(height: 24),
                    TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
                    const SizedBox(height: 12),
                    TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
                    const SizedBox(height: 12),
                    if (_error != null) const Text('Invalid credentials', style: TextStyle(color: Color(0xFFD96B43))),
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
