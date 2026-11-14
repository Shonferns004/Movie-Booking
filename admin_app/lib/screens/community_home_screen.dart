import 'package:flutter/material.dart';

import '../services/api.dart';
import 'events_admin_screen.dart';
import 'gallery_screen.dart';
import 'members_screen.dart';
import 'notices_admin_screen.dart';
import 'scanner_shell.dart' show KkSurface;

/// Home tab: the community command centre.
///
/// One screen that shows the landing page at a glance - hero images, the roll,
/// notices, events - and jumps straight into the admin screens that edit them.
class CommunityHomeScreen extends StatefulWidget {
  const CommunityHomeScreen({super.key, required this.token});

  final String? token;

  @override
  State<CommunityHomeScreen> createState() => _CommunityHomeScreenState();
}

class _CommunityHomeScreenState extends State<CommunityHomeScreen> {
  bool _loading = true;
  String? _error;
  List<dynamic> _members = const [];
  List<dynamic> _events = const [];
  List<dynamic> _notices = const [];
  List<dynamic> _hero = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = widget.token;
    if (token == null || token.isEmpty) {
      if (mounted) setState(() => _loading = false);
      return;
    }

    try {
      final results = await Future.wait([
        Api.getCommunityMembers(token),
        Api.getCommunityEvents(token),
        Api.getCommunityNotices(token),
        Api.getHeroImages(token),
      ]);
      if (!mounted) return;
      setState(() {
        _members = results[0];
        _events = results[1];
        _notices = results[2];
        _hero = results[3];
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _open(Widget screen) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    if (mounted) await _load();
  }

  int get _activeMembers => _members
      .where((m) => (m is Map ? m['status'] : null) == 'active')
      .length;

  dynamic _heroAt(int index) => index >= 0 && index < _hero.length ? _hero[index] : null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: KkSurface.bg,
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: KkSurface.accent))
            : RefreshIndicator(
                color: KkSurface.accent,
                backgroundColor: KkSurface.containerLow,
                onRefresh: _load,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(18, 14, 18, 28),
                  children: [
                    _header(),
                    const SizedBox(height: 18),
                    if (_error != null) ...[
                      _errorCard(),
                      const SizedBox(height: 18),
                    ],
                    _heroCard(),
                    const SizedBox(height: 18),
                    _statsRow(),
                    const SizedBox(height: 24),
                    _sectionTitle('MANAGE'),
                    const SizedBox(height: 10),
                    _actionsGrid(),
                    const SizedBox(height: 26),
                    _sectionTitle('LATEST NOTICES', trailing: '${_notices.length}'),
                    const SizedBox(height: 10),
                    _noticesCard(),
                    const SizedBox(height: 22),
                    _sectionTitle('UPCOMING EVENTS', trailing: '${_events.length}'),
                    const SizedBox(height: 10),
                    _eventsCard(),
                    const SizedBox(height: 22),
                    _sectionTitle('NEWEST MEMBERS', trailing: '$_activeMembers active'),
                    const SizedBox(height: 10),
                    _membersCard(),
                  ],
                ),
              ),
      ),
    );
  }

  /* ---------------------------------------------------------------- header */

  Widget _header() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text(
                'Konkani Samudai',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: KkSurface.onSurface,
                  letterSpacing: -0.5,
                ),
              ),
              SizedBox(height: 2),
              Text(
                'Community command centre',
                style: TextStyle(
                  fontSize: 11,
                  color: KkSurface.onSurfaceVariant,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: const Color(0xFF6FBF8B).withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFF6FBF8B).withValues(alpha: 0.35)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: const [
              _LiveDot(),
              SizedBox(width: 6),
              Text(
                'Live',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF6FBF8B),
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /* ------------------------------------------------------------------ hero */

  Widget _heroCard() {
    final firstImage = _hero.isNotEmpty && _hero.first is Map
        ? (_hero.first['url'] ?? '').toString()
        : '';

    return GestureDetector(
      onTap: () => _open(GalleryScreen(token: widget.token)),
      child: Container(
        height: 168,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: KkSurface.accent.withValues(alpha: 0.22)),
          color: KkSurface.containerLow,
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (firstImage.startsWith('http'))
              Image.network(
                firstImage,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const ColoredBox(color: KkSurface.container),
              )
            else
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF2A1B15), Color(0xFF131315)],
                  ),
                ),
              ),
            // Darken the photo so the copy stays readable.
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.centerRight,
                  end: Alignment.centerLeft,
                  colors: [Color(0xE6131315), Color(0x66131315)],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: KkSurface.accent,
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: const Text(
                      'LANDING PAGE',
                      style: TextStyle(
                        fontSize: 8,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.1,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Hero images',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: KkSurface.onSurface,
                      letterSpacing: -0.4,
                      height: 1.05,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _hero.isEmpty
                        ? 'No images yet - tap to add photos'
                        : '${_hero.length} image${_hero.length == 1 ? '' : 's'} on rotation',
                    style: const TextStyle(
                      fontSize: 11,
                      color: KkSurface.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _HeroThumb(image: _heroAt(0)),
                      _HeroThumb(image: _heroAt(1)),
                      _HeroThumb(image: _heroAt(2)),
                      const Spacer(),
                      const Icon(
                        Icons.arrow_forward,
                        size: 18,
                        color: KkSurface.onSurface,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /* ----------------------------------------------------------------- stats */

  Widget _statsRow() {
    return Row(
      children: [
        _statTile('Members', _members.length, Icons.groups_2_outlined),
        const SizedBox(width: 10),
        _statTile('Events', _events.length, Icons.celebration_outlined),
        const SizedBox(width: 10),
        _statTile('Notices', _notices.length, Icons.campaign_outlined),
        const SizedBox(width: 10),
        _statTile('Heroes', _hero.length, Icons.photo_library_outlined),
      ],
    );
  }

  Widget _statTile(String label, int value, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: KkSurface.containerLow,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: KkSurface.border),
        ),
        child: Column(
          children: [
            Icon(icon, size: 17, color: KkSurface.accent),
            const SizedBox(height: 6),
            Text(
              '$value',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: KkSurface.onSurface,
                height: 1,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: KkSurface.onSurfaceVariant,
                letterSpacing: 0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /* --------------------------------------------------------------- actions */

  Widget _actionsGrid() {
    return Column(
      children: [
        Row(
          children: [
            _actionTile(
              label: 'Members',
              hint: '$_activeMembers active',
              icon: Icons.badge_outlined,
              onTap: () => _open(MembersScreen(token: widget.token)),
            ),
            const SizedBox(width: 10),
            _actionTile(
              label: 'Gallery',
              hint: 'Hero images',
              icon: Icons.photo_library_outlined,
              onTap: () => _open(GalleryScreen(token: widget.token)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            _actionTile(
              label: 'Notices',
              hint: 'Post an update',
              icon: Icons.campaign_outlined,
              onTap: () => _open(NoticesAdminScreen(token: widget.token)),
            ),
            const SizedBox(width: 10),
            _actionTile(
              label: 'Events',
              hint: 'Festivals & tickets',
              icon: Icons.celebration_outlined,
              onTap: () => _open(EventsAdminScreen(token: widget.token)),
            ),
          ],
        ),
      ],
    );
  }

  Widget _actionTile({
    required String label,
    required String hint,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: Material(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: KkSurface.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: KkSurface.accent.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, size: 18, color: KkSurface.accent),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: KkSurface.onSurface,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        hint,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10,
                          color: KkSurface.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /* ---------------------------------------------------------------- lists */

  Widget _noticesCard() {
    if (_notices.isEmpty) {
      return _emptyCard(
        icon: Icons.campaign_outlined,
        message: 'No notices published yet.',
        actionLabel: 'Post the first notice',
        onTap: () => _open(NoticesAdminScreen(token: widget.token)),
      );
    }

    return _card(
      children: [
        for (var i = 0; i < _notices.length && i < 3; i++) ...[
          if (i > 0) const Divider(height: 18, color: KkSurface.border),
          _noticeRow(_notices[i]),
        ],
      ],
    );
  }

  Widget _noticeRow(dynamic notice) {
    final tag = (notice['tag'] ?? '').toString();
    final date = (notice['dateLabel'] ?? '').toString();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 4,
          height: 34,
          margin: const EdgeInsets.only(top: 2, right: 10),
          decoration: BoxDecoration(
            color: KkSurface.accent,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                (notice['title'] ?? '').toString(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: KkSurface.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                [tag, date].where((v) => v.isNotEmpty).join(' · '),
                style: const TextStyle(fontSize: 10, color: KkSurface.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _eventsCard() {
    if (_events.isEmpty) {
      return _emptyCard(
        icon: Icons.celebration_outlined,
        message: 'Nothing on the calendar yet.',
        actionLabel: 'Publish an event',
        onTap: () => _open(EventsAdminScreen(token: widget.token)),
      );
    }

    return _card(
      children: [
        for (var i = 0; i < _events.length && i < 3; i++) ...[
          if (i > 0) const Divider(height: 18, color: KkSurface.border),
          _eventRow(_events[i]),
        ],
      ],
    );
  }

  Widget _eventRow(dynamic event) {
    final tiers = (event['tiers'] as List?) ?? const [];
    final prices = tiers
        .whereType<Map>()
        .map((t) => t['price'])
        .whereType<num>()
        .toList();
    final from = prices.isEmpty ? null : prices.reduce((a, b) => a < b ? a : b);
    final detail = [
      (event['dateLabel'] ?? '').toString(),
      (event['venue'] ?? '').toString(),
    ].where((v) => v.isNotEmpty).join(' · ');

    return Row(
      children: [
        Container(
          width: 46,
          padding: const EdgeInsets.symmetric(vertical: 6),
          decoration: BoxDecoration(
            color: KkSurface.accent.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: KkSurface.accent.withValues(alpha: 0.28)),
          ),
          child: Column(
            children: [
              Text(
                (event['kicker'] ?? 'EVENT').toString(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: KkSurface.accent,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                (event['title'] ?? '').toString(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: KkSurface.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                detail,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10, color: KkSurface.onSurfaceVariant),
              ),
            ],
          ),
        ),
        if (from != null) ...[
          const SizedBox(width: 8),
          Text(
            '₹${from.round()}',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: KkSurface.accent,
            ),
          ),
        ],
      ],
    );
  }

  Widget _membersCard() {
    if (_members.isEmpty) {
      return _emptyCard(
        icon: Icons.groups_2_outlined,
        message: 'The roll is empty.',
        actionLabel: 'Add the first member',
        onTap: () => _open(MembersScreen(token: widget.token)),
      );
    }

    return _card(
      children: [
        for (var i = 0; i < _members.length && i < 4; i++) ...[
          if (i > 0) const Divider(height: 18, color: KkSurface.border),
          _memberRow(_members[i]),
        ],
      ],
    );
  }

  Widget _memberRow(dynamic member) {
    final name = (member['name'] ?? 'Member').toString();
    final plan = (member['plan'] ?? '').toString();
    final active = (member['status'] ?? '').toString() == 'active';
    final initial = name.trim().isEmpty ? '?' : name.trim().characters.first.toUpperCase();

    return Row(
      children: [
        CircleAvatar(
          radius: 15,
          backgroundColor: KkSurface.accent.withValues(alpha: 0.16),
          child: Text(
            initial,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: KkSurface.accent,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: KkSurface.onSurface,
                ),
              ),
              const SizedBox(height: 1),
              Text(
                plan.isEmpty ? 'member' : '$plan membership',
                style: const TextStyle(fontSize: 10, color: KkSurface.onSurfaceVariant),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(
            color: (active ? const Color(0xFF6FBF8B) : const Color(0xFF9E9890))
                .withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            active ? 'ACTIVE' : 'PENDING',
            style: TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
              color: active ? const Color(0xFF6FBF8B) : const Color(0xFF9E9890),
            ),
          ),
        ),
      ],
    );
  }

  /* ---------------------------------------------------------------- shells */

  Widget _card({required List<Widget> children}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: KkSurface.border),
      ),
      child: Column(children: children),
    );
  }

  Widget _emptyCard({
    required IconData icon,
    required String message,
    required String actionLabel,
    required VoidCallback onTap,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: KkSurface.border),
      ),
      child: Column(
        children: [
          Icon(icon, size: 22, color: KkSurface.containerHighest),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11, color: KkSurface.onSurfaceVariant),
          ),
          const SizedBox(height: 10),
          TextButton(
            onPressed: onTap,
            style: TextButton.styleFrom(foregroundColor: KkSurface.accent),
            child: Text(
              actionLabel,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title, {String? trailing}) {
    return Row(
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: KkSurface.onSurfaceVariant,
            letterSpacing: 1.3,
          ),
        ),
        const Spacer(),
        if (trailing != null)
          Text(
            trailing,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: KkSurface.containerHighest,
            ),
          ),
      ],
    );
  }

  Widget _errorCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KkSurface.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: KkSurface.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_outlined, size: 18, color: KkSurface.error),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _error!,
              style: const TextStyle(fontSize: 11, color: KkSurface.error),
            ),
          ),
          TextButton(
            onPressed: _load,
            style: TextButton.styleFrom(foregroundColor: KkSurface.error),
            child: const Text('Retry', style: TextStyle(fontSize: 11)),
          ),
        ],
      ),
    );
  }
}

class _LiveDot extends StatefulWidget {
  const _LiveDot();

  @override
  State<_LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<_LiveDot> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.35, end: 1).animate(_controller),
      child: Container(
        width: 6,
        height: 6,
        decoration: const BoxDecoration(
          color: Color(0xFF6FBF8B),
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

class _HeroThumb extends StatelessWidget {
  const _HeroThumb({this.image});

  final dynamic image;

  @override
  Widget build(BuildContext context) {
    final url = image is Map ? (image['url'] ?? '').toString() : '';

    return Container(
      width: 42,
      height: 30,
      margin: const EdgeInsets.only(right: 6),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
        color: KkSurface.container,
      ),
      child: url.startsWith('http')
          ? Image.network(
              url,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => const Icon(
                Icons.image_outlined,
                size: 14,
                color: KkSurface.containerHighest,
              ),
            )
          : const Icon(
              Icons.add_photo_alternate_outlined,
              size: 14,
              color: KkSurface.containerHighest,
            ),
    );
  }
}
