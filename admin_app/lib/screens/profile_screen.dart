import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api.dart';
import '../services/auth_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.token,
    this.embedded = false,
  });

  final String token;

  /// When true the screen renders only its content (no Scaffold, no scroll view)
  /// so it can be embedded inside the scanner shell's tab body.
  final bool embedded;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  String _email = '';
  String _roles = '';
  List<dynamic> _scans = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    _email = prefs.getString('email') ?? '';
    _roles = prefs.getString('roles') ?? '';
    try {
      _scans = await Api.getScanHistory(widget.token);
    } catch (_) {
      _scans = [];
    }
    if (mounted) setState(() => _loading = false);
  }

  int get _validScans =>
      _scans.where((s) => s['result'] == 'VALID').length;
  int get _invalidScans =>
      _scans.where((s) => s['result'] != 'VALID').length;

  @override
  Widget build(BuildContext context) {
    Widget content;

    if (_loading) {
      content = const Center(child: CircularProgressIndicator());
    } else {
      content = ListView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Username', style: Theme.of(context).textTheme.labelSmall),
                  const SizedBox(height: 4),
                  Text(
                    _email.isEmpty ? 'Unknown' : _email,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text('Roles', style: Theme.of(context).textTheme.labelSmall),
                  const SizedBox(height: 4),
                  Text(
                    _roles.isEmpty ? 'None' : _roles,
                    style: const TextStyle(fontSize: 14),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Scan statistics',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _stat('Total scans', _scans.length.toString()),
                      _stat('Valid', _validScans.toString()),
                      _stat('Invalid', _invalidScans.toString()),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Recent scans',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          if (_scans.isEmpty)
            const Text('No scans yet.')
          else
            ..._scans.take(20).map((s) => Card(
                  child: ListTile(
                    title: Text(s['result']?.toString() ?? 'UNKNOWN'),
                    subtitle: Text(
                      '${s['scanned_at'] ?? ''}  ${s['rejection_reason'] ?? ''}',
                    ),
                    trailing: Text(s['ticket_id']?.toString() ?? ''),
                  ),
                )),
        ],
      );
    }

    if (widget.embedded) return content;

    return Scaffold(
      backgroundColor: const Color(0xFF121214),
      appBar: AppBar(title: const Text('Profile')),
      body: content,
    );
  }

  Widget _stat(String label, String value) => Column(
        children: [
          Text(value,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
        ],
      );
}