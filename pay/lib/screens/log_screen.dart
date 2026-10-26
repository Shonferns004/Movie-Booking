import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/observer_event.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';
import '../widgets/app_card.dart';
import '../widgets/status_pill.dart';

class LogScreen extends StatefulWidget {
  const LogScreen({super.key});

  @override
  State<LogScreen> createState() => _LogScreenState();
}

class _LogScreenState extends State<LogScreen> {
  EventStatus? _filter;

  static const _filters = <EventStatus?>[
    null,
    EventStatus.sent,
    EventStatus.pending,
    EventStatus.failed,
    EventStatus.ignored,
  ];

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final all = state.events;
    final shown = _filter == null
        ? all
        : all.where((event) => event.status == _filter).toList(growable: false);

    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 12, 0),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Activity',
                          style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 2),
                      Text(
                        '${all.length} messages observed',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Drain the queue now',
                  onPressed: state.flushQueue,
                  icon: const Icon(Icons.bolt_rounded,
                      color: AppColors.accent2, size: 21),
                ),
                IconButton(
                  tooltip: 'Clear activity log',
                  onPressed: all.isEmpty
                      ? null
                      : () => _confirmClear(context, state),
                  icon: const Icon(Icons.delete_outline_rounded, size: 21),
                ),
              ],
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
              itemCount: _filters.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final value = _filters[index];
                final selected = value == _filter;
                final count = value == null
                    ? all.length
                    : all.where((e) => e.status == value).length;
                return _FilterChip(
                  label: value == null ? 'All' : value.label,
                  count: count,
                  selected: selected,
                  onTap: () => setState(() => _filter = value),
                );
              },
            ),
          ),
          const SizedBox(height: 6),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.accent2,
              backgroundColor: AppColors.bgSoft,
              onRefresh: () => state.refresh(),
              child: shown.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        EmptyState(
                          icon: Icons.travel_explore_rounded,
                          title: 'No messages in this view',
                          body:
                              'Bank credit SMS arrive here automatically once SMS access is granted and the observer is running.',
                        ),
                      ],
                    )
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
                      itemCount: shown.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) => _EventCard(
                        event: shown[index],
                        onTap: () => _showDetail(context, shown[index]),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmClear(BuildContext context, AppState state) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clear activity log?'),
        content: const Text(
          'Delivery history is removed from this device. Pending messages are kept so they can still be forwarded.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: const Text('Clear'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await state.clearLog();
    }
  }

  void _showDetail(BuildContext context, ObserverEvent event) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0E1424),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => _EventDetail(event: event),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected
                ? AppColors.accent
                : AppColors.border,
          ),
        ),
        child: Text(
          '$label  $count',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppColors.muted,
          ),
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event, required this.onTap});

  final ObserverEvent event;
  final VoidCallback onTap;

  (Color, String) get _tone {
    switch (event.status) {
      case EventStatus.sent:
        return event.isRejected
            ? (AppColors.warning, 'Rejected')
            : (AppColors.success, 'Forwarded');
      case EventStatus.failed:
        return (AppColors.danger, 'Failed');
      case EventStatus.pending:
        return (AppColors.warning, 'Waiting');
      case EventStatus.ignored:
        return (AppColors.faint, 'Skipped');
    }
  }

  @override
  Widget build(BuildContext context) {
    final (color, label) = _tone;

    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(15, 13, 15, 13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  event.sender,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.text,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  label.toUpperCase(),
                  style: TextStyle(
                    fontSize: 8.8,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.7,
                    color: color,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            event.body,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.42,
              color: AppColors.muted,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text(
                renderAmount(event.amount, event.amountPaise),
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  color: AppColors.text,
                ),
              ),
              if (event.reference != null && event.reference!.isNotEmpty) ...[
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    'REF ${event.reference}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10.5,
                      fontFamily: 'monospace',
                      color: event.reference!.length == 12
                          ? AppColors.accent2
                          : AppColors.warning,
                    ),
                  ),
                ),
              ],
              const Spacer(),
              Text(
                relativeTime(event.receivedAtDate),
                style: const TextStyle(fontSize: 10.5, color: AppColors.faint),
              ),
            ],
          ),
          if (event.message != null &&
              event.message!.isNotEmpty &&
              event.status != EventStatus.sent) ...[
            const SizedBox(height: 8),
            Text(
              statusHeadline(event.status, event.message),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11, height: 1.35, color: color),
            ),
          ],
        ],
      ),
    );
  }
}

class _EventDetail extends StatelessWidget {
  const _EventDetail({required this.event});

  final ObserverEvent event;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.62,
      maxChildSize: 0.92,
      minChildSize: 0.4,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(22, 10, 22, 30),
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 18),
              decoration: BoxDecoration(
                color: AppColors.surfaceStrong,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Text(
                  event.sender,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ),
              StatusPill(
                label: event.status.label,
                tone: switch (event.status) {
                  EventStatus.sent =>
                    event.isRejected ? PillTone.info : PillTone.active,
                  EventStatus.failed => PillTone.error,
                  EventStatus.pending => PillTone.info,
                  EventStatus.ignored => PillTone.idle,
                },
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(shortDateTime(event.receivedAtDate),
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 18),
          AppCard(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 6),
            child: Column(
              children: [
                DetailRow(
                  label: 'Amount',
                  value: renderAmount(event.amount, event.amountPaise),
                ),
                DetailRow(
                  label: 'Amount (paise)',
                  value: event.amountPaise?.toString() ?? '—',
                  monospace: true,
                ),
                DetailRow(
                  label: 'Reference',
                  value: event.reference?.isNotEmpty == true
                      ? event.reference!
                      : 'Not found',
                  monospace: true,
                  valueColor: event.reference?.length == 12
                      ? AppColors.accent2
                      : AppColors.warning,
                ),
                DetailRow(
                  label: 'HTTP status',
                  value: event.httpStatus == 0 ? '—' : '${event.httpStatus}',
                  monospace: true,
                ),
                DetailRow(
                  label: 'Attempts',
                  value: '${event.attempts}',
                ),
              ],
            ),
          ),
          if (event.message != null && event.message!.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('GATEWAY RESPONSE',
                style: Theme.of(context).textTheme.labelSmall),
            const SizedBox(height: 6),
            AppCard(
              child: Text(
                event.message!,
                style: const TextStyle(
                  fontSize: 12.5,
                  height: 1.45,
                  color: AppColors.text,
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Text('RAW MESSAGE',
                    style: Theme.of(context).textTheme.labelSmall),
              ),
              TextButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: event.body));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Message copied')),
                    );
                  }
                },
                icon: const Icon(Icons.copy_rounded, size: 15),
                label: const Text('Copy'),
              ),
            ],
          ),
          AppCard(
            child: SelectableText(
              event.body,
              style: const TextStyle(
                fontSize: 12.5,
                height: 1.5,
                fontFamily: 'monospace',
                color: AppColors.text,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Event ${event.id}',
            style: const TextStyle(
              fontSize: 10,
              fontFamily: 'monospace',
              color: AppColors.faint,
            ),
          ),
        ],
      ),
    );
  }
}
