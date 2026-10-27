import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../services/api.dart';
import '../services/auth_service.dart';
import '../widgets/app_toast.dart';
import 'profile_screen.dart';
import 'scanner_screen.dart';

/// Material 3 surface palette (matches the design tokens used by the web UI).
class KkSurface {
  static const bg = Color(0xFF131315);
  static const containerLow = Color(0xFF1B1B1D);
  static const container = Color(0xFF201F21);
  static const containerHigh = Color(0xFF2A2A2C);
  static const containerHighest = Color(0xFF353437);
  static const onSurface = Color(0xFFE5E1E4);
  static const onSurfaceVariant = Color(0xFFDDC0B7);
  static const primary = Color(0xFFFFB59C);
  static const accent = Color(0xFFD96B43);
  static const accentBorder = Color(0xFFE07148);
  static const border = Color(0xFF26262A);
  static const secondaryContainer = Color(0xFF3C4B3A);
  static const onSecondaryContainer = Color(0xFFA9BAA5);
  static const secondary = Color(0xFFBBCBB6);
  static const error = Color(0xFFFFB4AB);
  static const outline = Color(0xFFA58B83);
  static const outlineVariant = Color(0xFF56423C);
  static const onPrimary = Color(0xFF5C1900);
}

/// Scanner shell with a bottom tab bar (Home / Profile).
class ScannerShell extends StatefulWidget {
  const ScannerShell({
    super.key,
    required this.token,
    required this.shows,
    required this.selectedShowId,
    required this.onSelectShow,
    required this.onScanned,
    required this.scannedCount,
  });

  final String? token;
  final List<dynamic> shows;
  final String? selectedShowId;
  final ValueChanged<String?> onSelectShow;
  final ValueChanged<int> onScanned;
  final int scannedCount;

  @override
  State<ScannerShell> createState() => _ScannerShellState();
}

class _ScannerShellState extends State<ScannerShell> {
  int _tab = 0;
  List<dynamic> _activity = [];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadActivity();
  }

  Future<void> _loadActivity() async {
    final token = widget.token;
    if (token == null || token.isEmpty) return;
    try {
      final list = await Api.getScanHistory(token);
      if (mounted) setState(() => _activity = list);
    } catch (_) {}
  }

  dynamic get _selectedShow {
    if (widget.shows.isEmpty) return null;
    for (final s in widget.shows) {
      if (s['id'] == widget.selectedShowId) return s;
    }
    return widget.shows.first;
  }

  String _showTitle(dynamic s) {
    if (s == null) return 'No show selected';
    final t = s['movie_title'] ?? s['title'];
    return (t == null || t.toString().isEmpty) ? 'Show' : t.toString();
  }

  String _showSubtitle(dynamic s) {
    if (s == null) return 'Pick a show to begin scanning';
    final parts = <String>[];
    final starts = DateTime.tryParse(s['starts_at']?.toString() ?? '');
    if (starts != null) {
      parts.add('Today, ${_formatTime(starts)}');
    }
    final venue = [s['theatre_name'], s['auditorium_name']]
        .map((v) => v?.toString() ?? '')
        .where((v) => v.isNotEmpty)
        .join(', ');
    if (venue.isNotEmpty) parts.add(venue);
    return parts.isEmpty ? 'Pick a show to begin scanning' : parts.join(' • ');
  }

  String _formatTime(DateTime dt) {
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m ${dt.hour < 12 ? 'AM' : 'PM'}';
  }

  Future<void> _pickShow() async {
    if (widget.shows.isEmpty) {
      AppToast.show(context, 'No shows scheduled yet.', type: AppToastType.error);
      return;
    }
    await showModalBottomSheet(
      context: context,
      backgroundColor: KkSurface.container,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.symmetric(vertical: 12),
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Text(
                'Select show',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: KkSurface.onSurface,
                ),
              ),
            ),
            ...widget.shows.map((s) {
              return ListTile(
                title: Text(
                  _showTitle(s),
                  style: const TextStyle(
                    color: KkSurface.onSurface,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: Text(
                  _showSubtitle(s),
                  style: const TextStyle(
                    color: KkSurface.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
                onTap: () {
                  Navigator.pop(ctx);
                  widget.onSelectShow(s['id'] as String);
                },
              );
            }),
          ],
        ),
      ),
    );
  }

  Future<void> _openScanner() async {
    final token = widget.token;
    final showId = widget.selectedShowId;
    if (token == null || token.isEmpty) {
      AppToast.show(context, 'Session expired. Please log in again.',
          type: AppToastType.error);
      return;
    }
    if (showId == null) {
      AppToast.show(context, 'Select a show before opening the scanner.',
          type: AppToastType.error);
      return;
    }
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ScannerScreen(
          showId: showId,
          token: token,
          onValidated: (_) {
            widget.onScanned(1);
            setState(() {});
          },
        ),
      ),
    );
    await _loadActivity();
  }

  Future<void> _manualEntry() async {
    final token = widget.token;
    if (token == null || token.isEmpty) return;
    final code = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.55),
      builder: (ctx) => const _ManualEntrySheet(),
    );
    if (code == null || code.isEmpty) return;

    setState(() => _busy = true);
    try {
      final res = await Api.validateTicket(token, code,
          showId: widget.selectedShowId);
      final result = res['result'] ?? 'UNKNOWN';
      if (result == 'VALID') widget.onScanned(1);
      AppToast.show(
        context,
        '$result ${res['reason'] ?? ''}'.trim(),
        type: result == 'VALID'
            ? AppToastType.success
            : AppToastType.error,
      );
    } catch (e) {
      AppToast.show(context, 'Could not verify ticket.', type: AppToastType.error);
    } finally {
      if (mounted) setState(() => _busy = false);
      await _loadActivity();
    }
  }

  Future<void> _signOut() async {
    await AuthService.logout();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.token == null) {
      return const Scaffold(
        backgroundColor: KkSurface.bg,
        body: Center(child: CircularProgressIndicator(color: KkSurface.accent)),
      );
    }

    return Scaffold(
      backgroundColor: KkSurface.bg,
      body: SafeArea(
        bottom: false,
        child: IndexedStack(
          index: _tab,
          sizing: StackFit.expand,
          children: [
            _buildScrollable(_buildHomeTab()),
            ProfileScreen(
              token: widget.token!,
              embedded: true,
              shows: widget.shows,
              selectedShowId: widget.selectedShowId,
              onSignOut: _signOut,
              onBack: () => setState(() => _tab = 0),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _buildNav(),
    );
  }

  Widget _buildScrollable(Widget child) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: child,
    );
  }

  Widget _buildShowSelectorCard() {
    final s = _selectedShow;
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: InkWell(
        onTap: _pickShow,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: KkSurface.container,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _showTitle(s),
                      style: GoogleFonts.notoSerif(
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                        color: KkSurface.onSurface,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _showSubtitle(s),
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        color: KkSurface.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: KkSurface.containerHigh,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.expand_more,
                    size: 20, color: KkSurface.onSurface),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHomeTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildShowSelectorCard(),
        const SizedBox(height: 16),
        Container(
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
                  color: KkSurface.secondaryContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.confirmation_number_rounded,
                    size: 18, color: KkSurface.onSecondaryContainer),
              ),
              const SizedBox(width: 12),
              Text(
                'Scanned tickets: ${widget.scannedCount}',
                style: GoogleFonts.poppins(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: KkSurface.onSurface,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _buildViewfinderCard(),
        _buildScanButton(),
        const SizedBox(height: 24),
        _buildActivityList(),
      ],
    );
  }

  Widget _buildViewfinderCard() {
    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.keyboard_rounded,
              size: 18, color: KkSurface.onSurfaceVariant),
          const SizedBox(width: 8),
          Text(
            'Manual entry fallback',
            style: GoogleFonts.poppins(
              fontSize: 13,
              color: KkSurface.onSurfaceVariant,
            ),
          ),
          const Spacer(),
          TextButton(
            onPressed: _busy ? null : _manualEntry,
            child: Text(
              'Enter ticket code',
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: KkSurface.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScanButton() {
    return Container(
      constraints: const BoxConstraints(minHeight: 300),
      padding: const EdgeInsets.symmetric(vertical: 48),
      alignment: Alignment.center,
      child: GestureDetector(
        onTap: _openScanner,
        child: Container(
          width: 160,
          height: 160,
          decoration: BoxDecoration(
            color: KkSurface.accent,
            shape: BoxShape.circle,
            border: Border.all(
              color: KkSurface.accentBorder.withValues(alpha: 0.3),
              width: 4,
            ),
            boxShadow: [
              BoxShadow(
                color: KkSurface.accent.withValues(alpha: 0.2),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.center_focus_strong,
                  size: 36, color: Color(0xFF1A1A1A)),
              const SizedBox(height: 6),
              Text(
                'START SCANNING',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.8,
                  color: const Color(0xFF1A1A1A),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActivityList() {
    if (_activity.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Recent gate activity',
          style: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: KkSurface.onSurface,
          ),
        ),
        const SizedBox(height: 8),
        ..._activity.take(10).map((s) {
          final valid = s['result'] == 'VALID';
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
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

  Widget _buildNav() {
    Widget item(IconData icon, String label, int index) {
      final active = _tab == index;
      final iconColor = active ? KkSurface.accent : KkSurface.onSurfaceVariant;
      final labelColor = active ? KkSurface.onSurface : KkSurface.onSurfaceVariant;
      return Expanded(
        child: InkWell(
          onTap: () => setState(() => _tab = index),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 24, color: iconColor),
                const SizedBox(height: 2),
                Text(
                  label,
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                    color: labelColor,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      decoration: const BoxDecoration(
        color: KkSurface.bg,
        border: Border(top: BorderSide(color: KkSurface.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              item(LucideIcons.house, 'Home', 0),
              item(LucideIcons.circleUser, 'Profile', 1),
            ],
          ),
        ),
      ),
    );
  }
}

/// iOS-style bottom sheet container.
class _IosSheet extends StatelessWidget {
  const _IosSheet({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(top: false, child: child),
    );
  }
}

/// Rounded pill button used inside the bottom sheet.
class _IosSheetButton extends StatelessWidget {
  const _IosSheetButton({
    required this.label,
    required this.filled,
    required this.onTap,
  });

  final String label;
  final bool filled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: Material(
        color: filled ? KkSurface.accent : KkSurface.containerHigh,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Center(
            child: Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: filled ? const Color(0xFF1A1A1A) : KkSurface.onSurface,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Bottom sheet that owns the ticket-code field.
///
/// The controller lives inside this widget's State, so it is disposed only
/// after the sheet's exit animation has finished. Disposing it from the
/// caller while the sheet was still animating out caused the
/// "TextEditingController was used after being disposed" crash.
class _ManualEntrySheet extends StatefulWidget {
  const _ManualEntrySheet();

  @override
  State<_ManualEntrySheet> createState() => _ManualEntrySheetState();
}

class _ManualEntrySheetState extends State<_ManualEntrySheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final value = _controller.text.trim();
    if (value.isEmpty) return;
    Navigator.pop(context, value);
  }

  @override
  Widget build(BuildContext context) {
    return _IosSheet(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: KkSurface.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Enter ticket code',
              textAlign: TextAlign.center,
              style: GoogleFonts.notoSerif(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: KkSurface.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Type the reference printed under the QR code.',
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 13,
                color: KkSurface.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _controller,
              autofocus: true,
              textCapitalization: TextCapitalization.characters,
              keyboardType: TextInputType.text,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
              style: GoogleFonts.poppins(
                fontSize: 16,
                letterSpacing: 1.2,
                color: KkSurface.onSurface,
              ),
              decoration: InputDecoration(
                hintText: 'TKT-XXXXXXXX',
                hintStyle: GoogleFonts.poppins(
                  fontSize: 15,
                  letterSpacing: 1.2,
                  color: KkSurface.onSurfaceVariant,
                ),
                filled: true,
                fillColor: KkSurface.container,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 16,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: KkSurface.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: KkSurface.accent),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: _IosSheetButton(
                    label: 'Cancel',
                    filled: false,
                    onTap: () => Navigator.pop(context),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _IosSheetButton(
                    label: 'Verify',
                    filled: true,
                    onTap: _submit,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}