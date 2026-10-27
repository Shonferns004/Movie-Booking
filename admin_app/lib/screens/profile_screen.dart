import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api.dart';
import '../services/auth_service.dart';
import 'scanner_shell.dart';

/// Profile tab — mirrors the operator terminal design.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.token,
    this.embedded = false,
    this.onSignOut,
    this.shows = const [],
    this.selectedShowId,
    this.onBack,
  });

  final String token;

  /// When true the screen renders only its content (no Scaffold, no scroll view)
  /// so it can be embedded inside the scanner shell's tab body.
  final bool embedded;

  final VoidCallback? onBack;
  final VoidCallback? onSignOut;
  final List<dynamic> shows;
  final String? selectedShowId;

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

  String get _roleSubtitle {
    final parts = _roles
        .split(',')
        .map((r) => r.trim())
        .where((r) => r.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'Gate Operator';
    if (parts.contains('SCANNER')) return 'Gate 01 Operator';
    return parts.map((p) => p[0] + p.substring(1).toLowerCase()).join(' · ');
  }

  dynamic get _selectedShow {
    if (widget.shows.isEmpty) return null;
    for (final s in widget.shows) {
      if (s['id'] == widget.selectedShowId) return s;
    }
    return widget.shows.first;
  }

  String get _assignedShow {
    final s = _selectedShow;
    if (s == null) return 'No show assigned';
    final title = s['movie_title'] ?? s['title'] ?? 'Show';
    final starts = DateTime.tryParse(s['starts_at']?.toString() ?? '');
    final time = starts == null ? '' : _formatTime(starts);
    return time.isEmpty ? '$title' : '$title ($time)';
  }

  String get _assignedAudi {
    final s = _selectedShow;
    final a = s?['auditorium_name']?.toString() ?? '';
    return a.isEmpty ? '—' : a;
  }

  String _formatTime(DateTime dt) {
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m ${dt.hour < 12 ? 'AM' : 'PM'}';
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
              _buildIdentityCard(),
              const SizedBox(height: 24),
              _buildStats(),
              const SizedBox(height: 16),
              _buildOperationsCard(),
              const SizedBox(height: 16),
              _buildRecentScans(),
              const SizedBox(height: 16),
              _buildSignOut(context),
            ],
          );

    // Embedded inside the scanner shell: the shell already provides the
    // scroll view, so only the content is returned here.
    if (widget.embedded) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildHeader(context),
          const SizedBox(height: 16),
          body,
        ],
      );
    }

    return Scaffold(
      backgroundColor: KkSurface.bg,
      body: Column(
        children: [
          _buildHeader(context),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: body,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: const BoxDecoration(
        color: KkSurface.bg,
        border: Border(bottom: BorderSide(color: KkSurface.border)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () {
              if (widget.onBack != null) {
                widget.onBack!();
              } else {
                Navigator.maybePop(context);
              }
            },
            icon: const Icon(Icons.arrow_back, size: 20),
            color: KkSurface.onSurfaceVariant,
          ),
          Expanded(
            child: Text(
              'Profile',
              style: GoogleFonts.notoSerif(
                fontSize: 22,
                fontWeight: FontWeight.w500,
                color: KkSurface.onSurface,
              ),
            ),
          ),
          Container(
            width: 32,
            height: 32,
            decoration: const BoxDecoration(
              color: KkSurface.primary,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.person, size: 18, color: Color(0xFF5C1900)),
          ),
        ],
      ),
    );
  }

  Widget _buildIdentityCard() {
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
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: KkSurface.containerHigh,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.badge,
                        size: 30, color: KkSurface.accentBorder),
                  ),
                  Positioned(
                    right: -4,
                    bottom: -4,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: const BoxDecoration(
                        color: KkSurface.secondaryContainer,
                        shape: BoxShape.circle,
                      ),
                      child: const Center(
                        child: SizedBox(
                          width: 8,
                          height: 8,
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
                            style: GoogleFonts.notoSerif(
                              fontSize: 22,
                              fontWeight: FontWeight.w500,
                              color: KkSurface.onSurface,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 4, vertical: 2),
                          decoration: BoxDecoration(
                            color: KkSurface.accentBorder,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            _roleLabel.toUpperCase(),
                            style: GoogleFonts.manrope(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                              color: KkSurface.onPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _roleSubtitle,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        fontSize: 13,
                        color: KkSurface.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.theaters,
                            size: 14, color: KkSurface.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            'Sangam Cinema • Box Office Staff',
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.manrope(
                              fontSize: 11,
                              color: KkSurface.onSurfaceVariant,
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
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: KkSurface.container,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Expanded(
                  child: _telemetryCell('Terminal', 'Gate 01'),
                ),
                Container(
                  width: 1,
                  height: 28,
                  color: KkSurface.border,
                ),
                Expanded(
                  child: _telemetryCell('Status', 'On duty'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _telemetryCell(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: GoogleFonts.manrope(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
            color: KkSurface.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.manrope(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: KkSurface.onSurface,
          ),
        ),
      ],
    );
  }

  Widget _buildStats() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Scan statistics',
                    style: GoogleFonts.manrope(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                      color: KkSurface.onSurface,
                    ),
                  ),
                  Text(
                    'Real-time gate telemetry',
                    style: GoogleFonts.manrope(
                      fontSize: 11,
                      color: KkSurface.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            InkWell(
              onTap: _load,
              borderRadius: BorderRadius.circular(6),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: KkSurface.container,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.refresh,
                        size: 16, color: KkSurface.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Text(
                      'Sync',
                      style: GoogleFonts.manrope(
                        fontSize: 11,
                        color: KkSurface.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _metricCard(
                'Total',
                _scans.length.toString(),
                'All attempts',
                KkSurface.onSurfaceVariant,
                Icons.qr_code_scanner,
                KkSurface.onSurface,
              ),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: _metricCard(
                'Valid',
                _validScans.toString(),
                'Admitted',
                KkSurface.secondary,
                Icons.check_circle,
                KkSurface.secondary,
              ),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: _metricCard(
                'Invalid',
                _invalidScans.toString(),
                'Rejected',
                KkSurface.error,
                Icons.cancel,
                KkSurface.error,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _metricCard(
    String label,
    String value,
    String caption,
    Color labelColor,
    IconData icon,
    Color valueColor,
  ) {
    return Container(
      constraints: const BoxConstraints(minHeight: 96),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label.toUpperCase(),
                style: GoogleFonts.manrope(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: labelColor,
                ),
              ),
              Icon(icon, size: 16, color: labelColor),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: GoogleFonts.notoSerif(
              fontSize: 28,
              fontWeight: FontWeight.w500,
              height: 1,
              color: valueColor,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            caption,
            style: GoogleFonts.manrope(
              fontSize: 11,
              color: KkSurface.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOperationsCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              'TERMINAL OPERATIONS',
              style: GoogleFonts.manrope(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
                color: KkSurface.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: KkSurface.container,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: KkSurface.containerHigh,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Icon(Icons.movie,
                      size: 18, color: KkSurface.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Assigned Show',
                        style: GoogleFonts.manrope(
                          fontSize: 11,
                          color: KkSurface.onSurfaceVariant,
                        ),
                      ),
                      Text(
                        _assignedShow,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.manrope(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: KkSurface.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  decoration: BoxDecoration(
                    color: KkSurface.containerHighest,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    _assignedAudi,
                    style: GoogleFonts.manrope(
                      fontSize: 11,
                      color: KkSurface.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecentScans() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text(
              'Recent scans',
              style: GoogleFonts.manrope(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                color: KkSurface.onSurface,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              width: 6,
              height: 6,
              decoration: const BoxDecoration(
                color: KkSurface.outlineVariant,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 4),
            Text(
              'Standby',
              style: GoogleFonts.manrope(
                fontSize: 11,
                color: KkSurface.onSurfaceVariant,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_scans.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(40),
            decoration: BoxDecoration(
              color: KkSurface.containerLow,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: const BoxDecoration(
                    color: KkSurface.container,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.qr_code_scanner,
                      size: 32, color: KkSurface.outline),
                ),
                const SizedBox(height: 12),
                Text(
                  'No scans yet.',
                  style: GoogleFonts.notoSerif(
                    fontSize: 22,
                    fontWeight: FontWeight.w500,
                    color: KkSurface.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Verified patron QR codes and barcodes for the current show '
                  'will appear here in real time.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(
                    fontSize: 13,
                    height: 1.5,
                    color: KkSurface.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: KkSurface.secondary,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Optical engine idle and listening',
                      style: GoogleFonts.manrope(
                        fontSize: 11,
                        color: KkSurface.outline,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          )
        else
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
                      valid ? Icons.check : Icons.close,
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
                          style: GoogleFonts.manrope(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: KkSurface.onSurface,
                          ),
                        ),
                        Text(
                          '${s['scanned_at'] ?? ''}',
                          style: GoogleFonts.manrope(
                            fontSize: 11,
                            color: KkSurface.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: valid
                          ? KkSurface.secondaryContainer
                          : KkSurface.containerHighest,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      valid ? 'Valid' : 'Rejected',
                      style: GoogleFonts.manrope(
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

  Widget _buildSignOut(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: SizedBox(
        width: double.infinity,
        height: 48,
        child: ElevatedButton.icon(
          onPressed: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                backgroundColor: KkSurface.container,
                title: const Text('Sign out?'),
                content: const Text(
                    'Are you sure you want to end your scanning session for Gate 01?'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Cancel'),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Sign out'),
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
          icon: const Icon(Icons.logout, size: 20),
          label: Text(
            'SIGN OUT TERMINAL',
            style: GoogleFonts.manrope(
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
      ),
    );
  }
}