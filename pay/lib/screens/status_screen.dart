import 'package:flutter/material.dart';

import '../models/observer_config.dart';
import '../models/observer_event.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';
import '../widgets/app_card.dart';
import '../widgets/status_pill.dart';

class StatusScreen extends StatelessWidget {
  const StatusScreen({
    super.key,
    required this.onOpenLog,
    required this.onOpenSettings,
    required this.onOpenTestDialog,
  });

  final VoidCallback onOpenLog;
  final VoidCallback onOpenSettings;
  final VoidCallback onOpenTestDialog;

  (String, PillTone) _deriveStatus(ObserverConfig config, bool smsGranted) {
    if (!config.isConfigured) return ('Needs setup', PillTone.error);
    if (!config.enabled) return ('Paused', PillTone.idle);
    if (!smsGranted) return ('No SMS access', PillTone.error);
    return ('Active', PillTone.active);
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final snapshot = state.state;

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: AppColors.accent2,
        backgroundColor: AppColors.bgSoft,
        onRefresh: () => state.refresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            _Header(
              tone: _deriveStatus(
                snapshot?.config ?? const ObserverConfig(),
                snapshot?.smsPermission ?? false,
              ),
            ),
            const SizedBox(height: 18),
            if (snapshot == null) ...[
              if (state.platformError != null) _PlatformError(state: state),
              if (state.platformError == null)
                const AppCard(
                  child: SizedBox(
                    height: 96,
                    child: Center(
                      child: CircularProgressIndicator(
                        color: AppColors.accent2,
                        strokeWidth: 2,
                      ),
                    ),
                  ),
                ),
            ] else ...[
              _HeroCard(
                snapshot: snapshot,
                onToggle: state.config.isConfigured
                    ? () => state.setEnabled(!state.config.enabled)
                    : onOpenSettings,
              ),
              const SizedBox(height: 24),
              SectionLabel('Gateway'),
              AppCard(
                onTap: () => state.refreshActiveWindow(),
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                child: Column(
                  children: [
                    DetailRow(
                      label: 'Endpoint',
                      value: state.config.baseUrl.isEmpty
                          ? 'Not configured'
                          : '${state.config.baseUrl}${state.config.paired ? '/api/v1/observers/sms' : '/api/v1/pollers/events'}',
                      monospace: true,
                      valueColor: state.config.isConfigured
                          ? AppColors.text
                          : AppColors.faint,
                    ),
                    DetailRow(
                      label: 'Account',
                      value: state.config.shortAccountId,
                      monospace: true,
                      valueColor: state.config.receivingAccountId.isEmpty
                          ? AppColors.accent2
                          : AppColors.text,
                    ),
                    DetailRow(
                      label: 'Auth',
                      value: state.config.paired
                          ? (state.config.shortDeviceId.isEmpty
                              ? 'Paired device'
                              : 'Device ${state.config.shortDeviceId}')
                          : (state.config.maskedToken.isEmpty
                              ? 'Missing'
                              : state.config.maskedToken),
                      valueColor: state.config.paired
                          ? AppColors.accent2
                          : state.config.observerToken.isEmpty
                              ? AppColors.danger
                              : AppColors.muted,
                    ),
                    DetailRow(
                      label: 'Watch list',
                      value: state.config.senderFilter.trim().isEmpty
                          ? 'All senders'
                          : state.config.senderFilter.toUpperCase(),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            state.config.isConfigured
                                ? (state.config.paired
                                    ? 'Paired mode — the gateway resolves the merchant account.'
                                    : 'Tap the card to re-check against the gateway.')
                                : 'Add the gateway URL, then pair this phone or paste an observer token.',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                        if (state.refreshingActiveWindow)
                          const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              color: AppColors.accent2,
                              strokeWidth: 1.8,
                            ),
                          )
                        else
                          TextButton(
                            onPressed: onOpenTestDialog,
                            child: const Text('Test send'),
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              SectionLabel('Live checkout'),
              _LiveCheckoutCard(state: state),
              const SizedBox(height: 24),
              SectionLabel('Device'),
              AppCard(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                child: Column(
                  children: [
                    CheckRow(
                      icon: Icons.sms_failed_rounded,
                      title: 'SMS access',
                      subtitle: 'Receive + read bank credit messages',
                      granted: snapshot.smsPermission,
                      onGrant: () async {
                        final granted = await state.requestSmsPermission();
                        if (!granted && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'SMS access denied. Enable it from system settings.',
                              ),
                            ),
                          );
                        }
                      },
                    ),
                    const Divider(height: 1),
                    CheckRow(
                      icon: Icons.notifications_active_rounded,
                      title: 'Notifications',
                      subtitle: 'Required on Android 13+ to hold the listener',
                      granted: snapshot.notificationsPermission,
                      onGrant: state.requestNotificationPermission,
                    ),
                    if (snapshot.config.paired) ...[
                      const Divider(height: 1),
                      DetailRow(
                        label: 'Paired device',
                        value: snapshot.config.shortDeviceId.isEmpty
                            ? 'Paired'
                            : snapshot.config.shortDeviceId,
                        monospace: true,
                        valueColor: AppColors.accent2,
                      ),
                      DetailRow(
                        label: 'Merchant',
                        value: snapshot.config.shortMerchantId.isEmpty
                            ? '—'
                            : snapshot.config.shortMerchantId,
                        monospace: true,
                      ),
                    ],
                    if (!snapshot.smsPermission)
                      TextButton.icon(
                        onPressed: state.openAppSettings,
                        icon: const Icon(Icons.settings_rounded, size: 16),
                        label: const Text('Open system settings'),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              SectionLabel(
                'Recent activity',
                trailing: TextButton(
                  onPressed: onOpenLog,
                  child: const Text('View all'),
                ),
              ),
              _RecentEvents(events: state.events, onOpenLog: onOpenLog),
              const SizedBox(height: 26),
              const _Footnote(),
            ],
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.tone});

  final (String, PillTone) tone;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const BrandMark(),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'KONKANI SAMUDAI',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6,
                    ),
              ),
              Text(
                'SMS PAYMENT OBSERVER',
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
          ),
        ),
        StatusPill(label: tone.$1, tone: tone.$2),
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.snapshot, required this.onToggle});

  final GatewayState snapshot;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final config = snapshot.config;
    final stats = snapshot.stats;
    final running =
        config.isConfigured && config.enabled && snapshot.smsPermission;

    return AppCard(
      highlight: true,
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Observer',
                        style: Theme.of(context).textTheme.labelSmall),
                    const SizedBox(height: 4),
                    Text(
                      running ? 'Running' : (config.isConfigured ? 'Paused' : 'Not set up'),
                      style: Theme.of(context).textTheme.displaySmall,
                    ),
                  ],
                ),
              ),
              Switch(
                value: config.enabled && config.isConfigured,
                onChanged: config.isConfigured ? (_) => onToggle() : null,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            running
                ? 'Listening for incoming credit SMS and forwarding them to the payment gateway.'
                : 'Tap the switch once the gateway and SMS permissions are configured.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: running ? AppColors.success : AppColors.muted,
                ),
          ),
          if (!config.isConfigured) ...[
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: onToggle,
              icon: const Icon(Icons.arrow_forward_rounded, size: 17),
              label: const Text('Set up the gateway'),
            ),
          ],
          const SizedBox(height: 18),
          const Divider(height: 1),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: StatTile(
                  value: '${stats.forwarded}',
                  label: 'Forwarded',
                  color: AppColors.success,
                ),
              ),
              Expanded(
                child: StatTile(
                  value: '${stats.pending}',
                  label: 'Waiting',
                  color: AppColors.warning,
                ),
              ),
              Expanded(
                child: StatTile(
                  value: '${stats.failed}',
                  label: 'Failed',
                  color: AppColors.danger,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LiveCheckoutCard extends StatelessWidget {
  const _LiveCheckoutCard({required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    final sessions = state.activeSessions;
    final paired = state.config.paired;
    // In paired mode the gateway resolves the account from the device's
    // merchant, so the bearer-token active-window endpoint is not consulted.
    final tokenless = paired && state.config.observerToken.trim().isEmpty;

    return AppCard(
      padding: const EdgeInsets.all(16),
      onTap: tokenless ? null : state.refreshActiveWindow,
      child: sessions.isEmpty
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('No live checkout', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 5),
                Text(
                  state.activeWindowError ??
                      (tokenless
                          ? 'Paired mode: the gateway resolves the receiving account from this device\'s merchant and matches the amount + 12-digit reference server-side. The log fills in as soon as the credit SMS arrives.'
                          : 'Start a UPI checkout from the customer app — the gateway will report the exact amount and receiving account here.'),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerLeft,
                  child: state.refreshingActiveWindow
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            color: AppColors.accent2,
                            strokeWidth: 2,
                          ),
                        )
                      : tokenless
                          ? const StatusPill(
                              label: 'Resolved by gateway',
                              tone: PillTone.info,
                            )
                          : OutlinedButton.icon(
                              onPressed: state.config.isConfigured
                                  ? state.refreshActiveWindow
                                  : null,
                              icon: const Icon(Icons.refresh_rounded, size: 17),
                              label: const Text('Check now'),
                            ),
                ),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Live payments',
                    style: Theme.of(context).textTheme.labelSmall),
                const SizedBox(height: 10),
                for (final session in sessions.take(4))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.success.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(7),
                          ),
                          child: Text(
                            '₹${session.amount}',
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.success,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            session.receivingAccountId,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontFamily: 'monospace',
                              color: AppColors.muted,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          session.status.toLowerCase(),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                Text(
                  'These amounts are what the verification pipeline will match against.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
    );
  }
}

class _RecentEvents extends StatelessWidget {
  const _RecentEvents({required this.events, required this.onOpenLog});

  final List<ObserverEvent> events;
  final VoidCallback onOpenLog;

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) {
      return const AppCard(
        child: EmptyState(
          icon: Icons.inbox_rounded,
          title: 'Nothing observed yet',
          body: 'The moment a bank credit SMS lands on this device it shows up here with its delivery state.',
        ),
      );
    }

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Column(
        children: [
          for (final event in events.take(3))
            _EventRow(event: event, onTap: onOpenLog),
        ],
      ),
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event, required this.onTap});

  final ObserverEvent event;
  final VoidCallback onTap;

  (Color, String) get _accent => switch (event.status) {
        EventStatus.sent => (
            event.isRejected ? AppColors.warning : AppColors.success,
            event.isRejected ? 'Rejected' : 'Sent',
          ),
        EventStatus.failed => (AppColors.danger, 'Failed'),
        EventStatus.pending => (AppColors.warning, 'Waiting'),
        EventStatus.ignored => (AppColors.faint, 'Skipped'),
      };

  @override
  Widget build(BuildContext context) {
    final (color, label) = _accent;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 4),
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 10),
            Expanded(
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
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.text,
                          ),
                        ),
                      ),
                      Text(
                        renderAmount(event.amount, event.amountPaise),
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: color,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    event.body,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  relativeTime(event.receivedAtDate),
                  style: const TextStyle(fontSize: 10.5, color: AppColors.faint),
                ),
                const SizedBox(height: 3),
                Text(
                  label.toUpperCase(),
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                    color: color,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PlatformError extends StatelessWidget {
  const _PlatformError({required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      borderColor: AppColors.danger.withValues(alpha: 0.5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.error_outline_rounded,
                  size: 18, color: AppColors.danger),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Bridge unavailable',
                    style: Theme.of(context).textTheme.titleMedium),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(state.platformError ?? 'Unknown error',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: state.refresh,
            icon: const Icon(Icons.refresh_rounded, size: 17),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _Footnote extends StatelessWidget {
  const _Footnote();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('HOW IT VERIFIES', style: Theme.of(context).textTheme.labelSmall),
          const SizedBox(height: 8),
          Text(
            'Every message is parsed for an amount and a bank reference. The gateway '
            'only accepts a credit when the reference is exactly 12 digits and the '
            'amount matches a live checkout session — anything else is answered with '
            'a rejection the log will show you.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
