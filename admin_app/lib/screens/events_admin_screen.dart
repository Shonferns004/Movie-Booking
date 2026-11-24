import 'package:flutter/material.dart';
import '../widgets/kk_pull_to_refresh.dart';

import '../services/api.dart';
import '../widgets/app_toast.dart';
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// Community events (festivals, meetings, markets) shown on the landing page.
class EventsAdminScreen extends StatefulWidget {
  const EventsAdminScreen({super.key, required this.token});

  final String? token;

  @override
  State<EventsAdminScreen> createState() => _EventsAdminScreenState();
}

class _EventsAdminScreenState extends State<EventsAdminScreen> {
  List<dynamic> _events = [];
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
      final list = await Api.getCommunityEvents(token);
      if (!mounted) return;
      setState(() {
        _events = list;
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

  Future<void> _add() async {
    final title = TextEditingController();
    final kicker = TextEditingController(text: '22 NOV');
    final dateLabel = TextEditingController();
    final timeLabel = TextEditingController();
    final venue = TextEditingController();
    final blurb = TextEditingController();
    final price = TextEditingController(text: '299');
    final patronPrice = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF262C33),
        title: const Text('New community event'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
              TextField(
                controller: kicker,
                decoration: const InputDecoration(labelText: 'Badge (e.g. 22 NOV)'),
              ),
              TextField(
                controller: dateLabel,
                decoration: const InputDecoration(labelText: 'Date (Sat, 22 Nov 2026)'),
              ),
              TextField(
                controller: timeLabel,
                decoration: const InputDecoration(labelText: 'Time'),
              ),
              TextField(controller: venue, decoration: const InputDecoration(labelText: 'Venue')),
              TextField(
                controller: blurb,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Short description'),
              ),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: price,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Entry ₹'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: patronPrice,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Patron ₹ (optional)'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Publish')),
        ],
      ),
    );

    if (ok != true) return;
    if (title.text.trim().isEmpty) {
      if (mounted) AppToast.show(context, 'Enter an event title.', type: AppToastType.error);
      return;
    }

    final entry = double.tryParse(price.text.trim());
    if (entry == null || entry <= 0) {
      if (mounted) AppToast.show(context, 'Enter a valid entry price.', type: AppToastType.error);
      return;
    }
    final patron = double.tryParse(patronPrice.text.trim());

    final tiers = <Map<String, dynamic>>[
      {'id': 'general', 'name': 'Entry', 'price': entry.round(), 'note': 'Per person'},
      if (patron != null && patron > 0)
        {'id': 'patron', 'name': 'Patron pass', 'price': patron.round(), 'note': 'Entry + reserved seating'},
    ];

    try {
      await Api.createCommunityEvent(widget.token!, {
        'title': title.text.trim(),
        'kicker': kicker.text.trim(),
        'dateLabel': dateLabel.text.trim(),
        'timeLabel': timeLabel.text.trim(),
        'venue': venue.text.trim(),
        'blurb': blurb.text.trim(),
        'tags': ['Event'],
        'tiers': tiers,
      });
      await _load();
      if (mounted) AppToast.show(context, 'Event published.', type: AppToastType.success);
    } catch (e) {
      if (mounted) {
        AppToast.show(
          context,
          e.toString().replaceFirst('Exception: ', ''),
          type: AppToastType.error,
        );
      }
    }
  }

  Future<void> _delete(dynamic event) async {
    try {
      await Api.deleteCommunityEvent(widget.token!, event['id'].toString());
      await _load();
      if (mounted) AppToast.show(context, 'Event removed.', type: AppToastType.success);
    } catch (e) {
      if (mounted) {
        AppToast.show(
          context,
          e.toString().replaceFirst('Exception: ', ''),
          type: AppToastType.error,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1E2227),
      appBar: AppBar(
        title: Text('Events · ${_events.length}'),
        backgroundColor: const Color(0xFF1E2227),
        foregroundColor: const Color(0xFFF2F0EC),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        backgroundColor: const Color(0xFFC8FF1F),
        foregroundColor: const Color(0xFF171B1F),
        icon: const Icon(TablerIcons.confetti, size: 18),
        label: const Text('New event'),
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
              : _events.isEmpty
                  ? const Center(
                      child: Text('No community events yet.', style: TextStyle(color: Color(0xFF9E9890))),
                    )
                  : KkPullToRefresh(
                      color: const Color(0xFFC8FF1F),
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                        itemCount: _events.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (ctx, i) {
                          final event = _events[i];
                          final tiers = (event['tiers'] as List?) ?? const [];
                          final from = tiers.isEmpty
                              ? null
                              : tiers
                                  .map((t) => (t is Map ? t['price'] : null))
                                  .whereType<num>()
                                  .fold<num?>(null, (min, v) => min == null || v < min ? v : min);
                          return Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFF262C33),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFF2A2A2E)),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        (event['title'] ?? '').toString(),
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          color: Color(0xFFF2F0EC),
                                        ),
                                      ),
                                      const SizedBox(height: 3),
                                      Text(
                                        [
                                          (event['dateLabel'] ?? '').toString(),
                                          (event['venue'] ?? '').toString(),
                                        ].where((v) => v.isNotEmpty).join(' · '),
                                        style: const TextStyle(fontSize: 11, color: Color(0xFF9E9890)),
                                      ),
                                      if (from != null) ...[
                                        const SizedBox(height: 4),
                                        Text(
                                          'from ₹${from.round()}',
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: Color(0xFFC8FF1F),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                IconButton(
                                  onPressed: () => _delete(event),
                                  icon: const Icon(TablerIcons.trash, size: 18),
                                  color: const Color(0xFF9E9890),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
