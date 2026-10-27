import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api.dart';
import '../services/auth_service.dart';
import 'scanner_shell.dart';

/// Profile tab — a single card with the number of tickets scanned.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.token,
    this.embedded = false,
    this.onSignOut,
  });

  final String token;

  /// When true the screen renders only its content (no Scaffold, no scroll view)
  /// so it can be embedded inside the scanner shell's tab body.
  final bool embedded;

  final VoidCallback? onSignOut;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  String _email = '';
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
    try {
      _scans = await Api.getScanHistory(widget.token);
    } catch (_) {
      _scans = [];
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final body = _loading
        ? const Padding(
            padding: EdgeInsets.only(top: 80),
            child: Center(
              child: CircularProgressIndicator(color: KkSurface.accent),
            ),
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildTotalCard(),
              const SizedBox(height: 24),
              _buildSignOut(context),
            ],
          );

    if (widget.embedded) {
      return SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: body,
      );
    }

    return Scaffold(
      backgroundColor: KkSurface.bg,
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: body,
      ),
    );
  }

  Widget _buildTotalCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'TOTAL TICKETS SCANNED',
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: KkSurface.onSurfaceVariant,
                ),
              ),
              const Icon(LucideIcons.scanQrCode,
                  size: 18, color: KkSurface.onSurfaceVariant),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            _scans.length.toString(),
            style: GoogleFonts.poppins(
              fontSize: 44,
              fontWeight: FontWeight.w700,
              height: 1,
              color: KkSurface.onSurface,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _email.isEmpty ? 'Scanned by this terminal' : 'Scanned by $_email',
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: KkSurface.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSignOut(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton.icon(
        onPressed: () async {
          final ok = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              backgroundColor: KkSurface.container,
              title: const Text('Log out?'),
              content: const Text(
                  'Are you sure you want to end your scanning session?'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('Log out'),
                ),
              ],
            ),
          );
          if (ok != true) return;
          await AuthService.logout();
          if (!context.mounted) return;
          if (widget.onSignOut != null) {
            widget.onSignOut!();
          } else {
            Navigator.pushNamedAndRemoveUntil(
              context,
              '/login',
              (route) => false,
            );
          }
        },
        icon: const Icon(LucideIcons.logOut, size: 20),
        label: Text(
          'LOG OUT',
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: KkSurface.accentBorder,
          foregroundColor: KkSurface.onPrimary,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
    );
  }
}