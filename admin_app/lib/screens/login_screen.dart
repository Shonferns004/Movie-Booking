import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api.dart';

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
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', data['token']);
      await prefs.setString('email', _email.text.trim());
      final roles = (data['user']?['roles'] as List?)?.cast<String>() ?? <String>[];
      await prefs.setString('roles', roles.join(','));
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
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Konkani Samudai Admin', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 20),
                  TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
                  const SizedBox(height: 12),
                  TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
                  const SizedBox(height: 12),
                  if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 12),
                  SizedBox(width: double.infinity, child: ElevatedButton(onPressed: _loading ? null : _login, child: Text(_loading ? 'Logging in...' : 'Login'))),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
