import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api.dart';
import '../services/auth_service.dart';
import '../widgets/skeleton.dart';
import 'scanner_shell.dart';

/// Profile tab — identity, total scans, recent activity.
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

  String get _displayName => _email.isEmpty ? 'Unknown' : _email;

  String get _roleLabel {
    final parts = _roles
        .split(',')
        .map((r) => r.trim())
        .where((r) => r.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'Operator';
    return parts.first[0] + parts.first.substring(1).toLowerCase();
  }

  @override
  Widget build(BuildContext context) {
    final body = _loading ? _buildSkeleton() : _buildContent(context);

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

  Widget _buildContent(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildIdentityCard(),
        const SizedBox(height: 16),
        _buildTotalCard(),
        const SizedBox(height: 16),
        _buildRecentScans(),
        const SizedBox(height: 16),
        _buildSignOut(context),
      ],
    );
  }

  Widget _buildIdentityCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: KkSurface.containerHigh,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(LucideIcons.badge,
                    size: 28, color: KkSurface.accentBorder),
              ),
              Positioned(
                right: -3,
                bottom: -3,
                child: Container(
                  width: 15,
                  height: 15,
                  decoration: const BoxDecoration(
                    color: KkSurface.secondaryContainer,
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: SizedBox(
                      width: 7,
                      height: 7,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: KkSurface.secondary,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        _displayName,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: KkSurface.onSurface,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: KkSurface.accentBorder,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        _roleLabel.toUpperCase(),
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.8,
                          color: KkSurface.onPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTotalCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
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
          const SizedBox(height: 10),
          Text(
            _scans.length.toString(),
            style: GoogleFonts.poppins(
              fontSize: 40,
              fontWeight: FontWeight.w700,
              height: 1,
              color: KkSurface.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecentScans() {
    if (_scans.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: KkSurface.containerLow,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: KkSurface.containerHigh,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(LucideIcons.scanQrCode,
                  size: 18, color: KkSurface.onSurfaceVariant),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'No tickets scanned yet',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: KkSurface.onSurface,
                ),
              ),
            ),
          ],
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Recent scans',
          style: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: KkSurface.onSurface,
          ),
        ),
        const SizedBox(height: 8),
        ..._scans.take(10).map((s) {
          final valid = s['result'] == 'VALID';
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: KkSurface.containerLow,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: valid
                        ? KkSurface.secondaryContainer
                        : KkSurface.containerHigh,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    valid ? LucideIcons.check : LucideIcons.x,
                    size: 18,
                    color: valid
                        ? KkSurface.onSecondaryContainer
                        : KkSurface.onSurfaceVariant,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${s['result'] ?? 'UNKNOWN'}'
                            '${s['rejection_reason'] != null && s['rejection_reason'].toString().isNotEmpty ? ' • ${s['rejection_reason']}' : ''}',
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: KkSurface.onSurface,
                        ),
                      ),
                      Text(
                        '${s['scanned_at'] ?? ''}',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: KkSurface.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: valid
                        ? KkSurface.secondaryContainer
                        : KkSurface.containerHighest,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    valid ? 'Valid' : 'Rejected',
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: valid
                          ? KkSurface.onSecondaryContainer
                          : KkSurface.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildSkeleton() {
    return SkeletonPulse(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: KkSurface.containerLow,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const SkeletonCircle(size: 54),
                const SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    SkeletonBox(width: 120, height: 16),
                    SizedBox(height: 8),
                    SkeletonBox(width: 60, height: 12),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: KkSurface.containerLow,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(width: 140, height: 11),
                SizedBox(height: 14),
                SkeletonBox(width: 90, height: 36),
              ],
            ),
          ),
          const SizedBox(height: 16),
          for (var i = 0; i < 3; i++)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: KkSurface.containerLow,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                children: [
                  SkeletonCircle(size: 32),
                  SizedBox(width: 12),
                  SkeletonBox(width: 160, height: 12),
                ],
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