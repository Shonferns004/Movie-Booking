import 'package:flutter/material.dart';
import '../widgets/kk_pull_to_refresh.dart';

import '../services/api.dart';
import '../widgets/skeleton.dart';
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// News tab: a live activity feed built from the booking log.
///
/// There is no CMS yet, so this surfaces what is actually happening in the venue -
/// new bookings, cancellations and refunds - newest first.
class NewsScreen extends StatefulWidget {
  const NewsScreen({super.key, required this.token});

  final String? token;

  @override
  State<NewsScreen> createState() => _NewsScreenState();
}

class _NewsScreenState extends State<NewsScreen> {
  List<dynamic> _items = [];
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
      final bookings = await Api.getBookings(token);
      final sorted = [...bookings]
        ..sort((a, b) => '${b['created_at']}'.compareTo('${a['created_at']}'));
      if (!mounted) return;
      setState(() {
        _items = sorted.take(40).toList();
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

  String _relative(String? raw) {
    final date = raw == null ? null : DateTime.tryParse(raw)?.toLocal();
    if (date == null) return '';
    final diff = DateTime.now().difference(date);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${date.day}/${date.month}/${date.year}';
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return const Color(0xFF8E9E8A);
      case 'pending':
        return const Color(0xFFD8B45A);
      case 'cancelled':
      case 'failed':
        return const Color(0xFFC8FF1F);
      default:
        return const Color(0xFF8E8E96);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1E2227),
      appBar: AppBar(
        title: const Text(
          'NEWS',
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
          ? const SkeletonPulse(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  children: [
                    SkeletonCard(child: SkeletonBox(width: 200, height: 12)),
                    SkeletonCard(child: SkeletonBox(width: 160, height: 12)),
                    SkeletonCard(child: SkeletonBox(width: 220, height: 12)),
                  ],
                ),
              ),
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!, style: const TextStyle(color: Color(0xFFF08A80))),
                  ),
                )
              : _items.isEmpty
                  ? const Center(
                      child: Text(
                        'No activity yet.\nNew bookings will appear here.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Color(0xFF9E9890), fontSize: 13),
                      ),
                    )
                  : KkPullToRefresh(
                      color: const Color(0xFFC8FF1F),
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _items.length,
                        itemBuilder: (ctx, i) {
                          final b = _items[i];
                          final status = (b['status'] ?? 'unknown').toString();
                          final color = _statusColor(status);
                          final total = ((b['total_minor'] ?? 0) as num) / 100.0;
                          final reference = (b['booking_reference'] ?? b['id'] ?? '')
                              .toString();
                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFF262C33),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFF2A2A2E)),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Booking ${reference.length > 12 ? reference.substring(0, 12) : reference}',
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                          color: Color(0xFFF2F0EC),
                                        ),
                                      ),
                                      const SizedBox(height: 3),
                                      Text(
                                        '${status.toUpperCase()} · ₹${total.toStringAsFixed(0)} · ${_relative(b['created_at']?.toString())}',
                                        style: const TextStyle(fontSize: 11, color: Color(0xFF9E9890)),
                                      ),
                                    ],
                                  ),
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
