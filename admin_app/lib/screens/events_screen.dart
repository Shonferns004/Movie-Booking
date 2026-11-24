import 'package:flutter/material.dart';

import '../services/api.dart';
import 'show_detail_screen.dart';
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// Events tab: the upcoming programme, grouped by day.
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key, required this.token});

  final String? token;

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  List<dynamic> _shows = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = widget.token;
    if (token == null || token.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    try {
      final shows = await Api.getShows(token);
      final now = DateTime.now();
      final upcoming = shows.where((s) {
        final raw = s is Map ? s['starts_at']?.toString() : null;
        final date = raw == null ? null : DateTime.tryParse(raw)?.toLocal();
        return date != null && date.isAfter(now.subtract(const Duration(hours: 2)));
      }).toList()
        ..sort((a, b) => '${a['starts_at']}'.compareTo('${b['starts_at']}'));
      if (!mounted) return;
      setState(() {
        _shows = upcoming;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  DateTime? _startOf(dynamic show) {
    final raw = show is Map ? show['starts_at']?.toString() : null;
    return raw == null ? null : DateTime.tryParse(raw)?.toLocal();
  }

  String _dayLabel(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(date.year, date.month, date.day);
    final diff = day.difference(today).inDays;
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final label = '${weekdays[date.weekday - 1]}, ${date.day} ${months[date.month - 1]}';
    if (diff == 0) return 'Today · $label';
    if (diff == 1) return 'Tomorrow · $label';
    return label;
  }

  String _time(DateTime date) {
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    final minute = date.minute.toString().padLeft(2, '0');
    return '$hour:$minute ${date.hour < 12 ? 'AM' : 'PM'}';
  }

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<dynamic>>{};
    for (final show in _shows) {
      final start = _startOf(show);
      if (start == null) continue;
      final key = '${start.year}-${start.month}-${start.day}';
      groups.putIfAbsent(key, () => []).add(show);
    }

    return Scaffold(
      backgroundColor: const Color(0xFF1E2227),
      appBar: AppBar(
        title: const Text(
          'EVENTS',
          style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFF2F0EC)),
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(TablerIcons.refresh, size: 18),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFC8FF1F)))
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!, style: const TextStyle(color: Color(0xFFF08A80))),
                  ),
                )
              : groups.isEmpty
                  ? const Center(
                      child: Text(
                        'No upcoming events.\nSchedule a show to see it here.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Color(0xFF9E9890), fontSize: 13),
                      ),
                    )
                  : RefreshIndicator(
                      color: const Color(0xFFC8FF1F),
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                        children: [
                          for (final entry in groups.entries) ...[
                            Padding(
                              padding: const EdgeInsets.only(top: 14, bottom: 8),
                              child: Text(
                                _dayLabel(_startOf(entry.value.first)!),
                                style: const TextStyle(
                                  fontSize: 11,
                                  letterSpacing: 1.2,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF9E9890),
                                ),
                              ),
                            ),
                            ...entry.value.map((show) {
                              final start = _startOf(show)!;
                              final title = (show['movie_title'] ?? 'Untitled').toString();
                              final venue = [
                                show['theatre_name'],
                                show['auditorium_name'],
                              ].whereType<Object>().map((e) => e.toString()).join(' · ');
                              return Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF262C33),
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: const Color(0xFF2A2A2E)),
                                ),
                                child: ListTile(
                                  dense: true,
                                  title: Text(
                                    title,
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFFF2F0EC),
                                    ),
                                  ),
                                  subtitle: Text(
                                    venue.isEmpty ? _time(start) : '${_time(start)} · $venue',
                                    style: const TextStyle(fontSize: 11, color: Color(0xFF9E9890)),
                                  ),
                                  trailing: const Icon(
                                    TablerIcons.chevronRight,
                                    size: 18,
                                    color: Color(0xFF52525A),
                                  ),
                                  onTap: () async {
                                    await Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => ShowDetailScreen(
                                          showId: show['id'].toString(),
                                          token: widget.token,
                                        ),
                                      ),
                                    );
                                    if (mounted) _load();
                                  },
                                ),
                              );
                            }),
                          ],
                        ],
                      ),
                    ),
    );
  }
}
