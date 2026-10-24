import 'package:flutter/material.dart';

import '../models/observer_config.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_card.dart';
import '../widgets/status_pill.dart';
import 'test_send_sheet.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _url = TextEditingController();
  final _token = TextEditingController();
  final _account = TextEditingController();
  final _sendFilter = TextEditingController();
  final _source = TextEditingController();

  bool _obscureToken = true;
  bool _dirty = false;
  bool _detecting = false;
  bool _pairing = false;
  String? _lastSignature;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final config = AppScope.of(context).config;
    final signature = [
      config.baseUrl,
      config.observerToken,
      config.receivingAccountId,
      config.senderFilter,
      config.source,
      config.paired.toString(),
      config.deviceId,
    ].join('|');
    if (_dirty || signature == _lastSignature) return;
    _lastSignature = signature;
    _url.text = config.baseUrl;
    _token.text = config.observerToken;
    _account.text = config.receivingAccountId;
    _sendFilter.text = config.senderFilter;
    _source.text = config.source.isEmpty ? 'SMS_GATEWAY' : config.source;
  }

  @override
  void dispose() {
    _url.dispose();
    _token.dispose();
    _account.dispose();
    _sendFilter.dispose();
    _source.dispose();
    super.dispose();
  }

  void _markDirty([String? _]) {
    if (_dirty) return;
    setState(() => _dirty = true);
  }

  Future<void> _save() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    final state = AppScope.of(context);
    final next = ObserverConfig(
      baseUrl: _normalizeUrl(_url.text),
      observerToken: _token.text.trim(),
      receivingAccountId: _account.text.trim(),
      source: _source.text.trim().isEmpty
          ? 'SMS_GATEWAY'
          : _source.text.trim().toUpperCase(),
      senderFilter: _sendFilter.text.trim(),
      enabled: state.config.enabled,
    );

    final ok = await state.saveConfig(next);
    if (!mounted) return;

    if (ok) {
      setState(() => _dirty = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Observer settings saved')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(state.platformError ?? 'Could not save settings')),
      );
    }
  }

  String _normalizeUrl(String raw) {
    var value = raw.trim();
    while (value.endsWith('/')) {
      value = value.substring(0, value.length - 1);
    }
    return value;
  }

  Future<void> _detectAccount() async {
    final state = AppScope.of(context);
    if (!state.config.isConfigured) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Save the gateway URL and credentials first.'),
        ),
      );
      return;
    }

    setState(() => _detecting = true);
    await state.refreshActiveWindow();
    if (!mounted) return;
    setState(() => _detecting = false);

    final accounts = state.activeSessions
        .map((session) => session.receivingAccountId)
        .where((id) => id.isNotEmpty)
        .toSet();

    if (accounts.length == 1) {
      _account.text = accounts.first;
      _markDirty();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Receiving account resolved from live payment')),
      );
    } else if (accounts.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            state.activeWindowError ??
                'No live checkout to read the account from. Paste it manually.',
          ),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Several accounts are live — pick one from the log instead.'),
        ),
      );
    }
  }

  Future<void> _pairDevice() async {
    final state = AppScope.of(context);
    final baseUrl = _normalizeUrl(_url.text);
    if (baseUrl.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter the gateway base URL first.')),
      );
      return;
    }

    final controller = TextEditingController();
    final secret = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Pair this phone'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Paste the enrollment secret from Admin → Services → Android SMS '
                'Companion. You can also paste the full pairing QR payload.',
                style: Theme.of(dialogContext).textTheme.bodySmall?.copyWith(
                      height: 1.45,
                    ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: controller,
                minLines: 2,
                maxLines: 5,
                autocorrect: false,
                enableSuggestions: false,
                style: const TextStyle(fontSize: 12.5, fontFamily: 'monospace'),
                decoration: const InputDecoration(
                  hintText: 'Enrollment secret or { ... } QR JSON',
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'This phone will call $baseUrl. The QR\'s own serverUrl is ignored '
                'because it points at the gateway\'s internal port.',
                style: Theme.of(dialogContext).textTheme.bodySmall?.copyWith(
                      fontSize: 10.5,
                      height: 1.4,
                    ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('Pair device'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (!mounted || secret == null || secret.isEmpty) return;

    setState(() => _pairing = true);
    final result = await state.pairDevice(secret: secret, baseUrl: baseUrl);
    if (!mounted) return;
    setState(() => _pairing = false);

    final message = result.ok
        ? 'Paired as ${result.deviceId.isEmpty ? 'device' : result.deviceId}.'
        : result.message.isEmpty
            ? 'Pairing failed (HTTP ${result.httpStatus}).'
            : result.message;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<void> _unpairDevice() async {
    final state = AppScope.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Unpair this phone?'),
        content: const Text(
          'The app will forget the device signing key. Disable or delete the '
          'device in the admin panel to stop it from being listed as paired.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep paired'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Unpair'),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;

    final ok = await state.unpairDevice();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? 'Device credentials removed from this phone.'
              : state.platformError ?? 'Could not unpair this phone.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final paired = state.config.paired;
    final hasObserverToken = state.config.observerToken.trim().isNotEmpty;

    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          Expanded(
            child: Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
                children: [
            Text('Settings', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 3),
            Text(
              'Point the observer at the embedded YouPI gateway.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 20),
            SectionLabel('Device pairing'),
            _PairingCard(
              paired: paired,
              deviceId: state.config.shortDeviceId,
              merchantId: state.config.shortMerchantId,
              busy: _pairing,
              onPair: _pairDevice,
              onUnpair: _unpairDevice,
            ),
            const SizedBox(height: 24),
            SectionLabel('Gateway'),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _FieldLabel('GATEWAY BASE URL'),
                  TextFormField(
                    controller: _url,
                    onChanged: _markDirty,
                    keyboardType: TextInputType.url,
                    autocorrect: false,
                    style: const TextStyle(fontSize: 13),
                    decoration: const InputDecoration(
                      hintText: 'http://192.168.0.151:4000/youpi',
                    ),
                    validator: (value) {
                      final text = value?.trim() ?? '';
                      if (text.isEmpty) return 'Required';
                      final uri = Uri.tryParse(text);
                      if (uri == null ||
                          !uri.hasScheme ||
                          !(uri.scheme == 'http' || uri.scheme == 'https') ||
                          uri.host.isEmpty) {
                        return 'Enter a full http:// or https:// URL';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 14),
                  _FieldLabel(
                    paired ? 'OBSERVER API TOKEN (OPTIONAL)' : 'OBSERVER API TOKEN',
                  ),
                  TextFormField(
                    controller: _token,
                    onChanged: _markDirty,
                    obscureText: _obscureToken,
                    autocorrect: false,
                    enableSuggestions: false,
                    style: const TextStyle(fontSize: 13, fontFamily: 'monospace'),
                    decoration: InputDecoration(
                      hintText: paired
                          ? 'Not needed — the device signature is used'
                          : 'data/.secrets/observer_api_token',
                      suffixIcon: IconButton(
                        onPressed: () =>
                            setState(() => _obscureToken = !_obscureToken),
                        icon: Icon(
                          _obscureToken
                              ? Icons.visibility_rounded
                              : Icons.visibility_off_rounded,
                          size: 19,
                          color: AppColors.faint,
                        ),
                      ),
                    ),
                    validator: (value) {
                      if (paired) return null;
                      return (value?.trim().isEmpty ?? true)
                          ? 'Required unless this device is paired'
                          : null;
                    },
                  ),
                  const SizedBox(height: 6),
                  Text(
                    paired
                        ? 'This phone is paired, so observations use the device '
                            'signature. The token is only a fallback if you unpair.'
                        : 'Server path: server/vendor/youpi-pg/data/.secrets/observer_api_token',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontSize: 10.5,
                          color: AppColors.faint,
                        ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            SectionLabel('Receiving account'),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _FieldLabel('ACCOUNT UUID (OPTIONAL)'),
                  TextFormField(
                    controller: _account,
                    onChanged: _markDirty,
                    autocorrect: false,
                    style: const TextStyle(fontSize: 13, fontFamily: 'monospace'),
                    decoration: InputDecoration(
                      hintText: paired
                          ? 'Leave empty — the gateway resolves it'
                          : 'Leave empty to resolve from the live payment',
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed:
                              (_detecting || (paired && !hasObserverToken))
                                  ? null
                                  : _detectAccount,
                          icon: _detecting
                              ? const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 1.8,
                                    color: AppColors.accent2,
                                  ),
                                )
                              : const Icon(Icons.radar_rounded, size: 17),
                          label: Text(_detecting ? 'Looking…' : 'Detect from live checkout'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    paired
                        ? 'Paired devices are attributed by the server from their '
                            'merchant, so this can stay empty. Set it only to override '
                            'the gateway\'s account choice.'
                        : 'When this is blank the app asks /pollers/active-window for the '
                            'account the pending payment belongs to, exactly like the browser observer.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontSize: 11,
                          height: 1.4,
                        ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            SectionLabel('Matching'),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _FieldLabel('SENDER WATCH LIST'),
                  TextField(
                    controller: _sendFilter,
                    onChanged: _markDirty,
                    autocorrect: false,
                    textCapitalization: TextCapitalization.characters,
                    style: const TextStyle(fontSize: 13),
                    decoration: const InputDecoration(
                      hintText: 'HDFCBK, ICICIB, SBIINB',
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Comma separated. Leave empty to observe every sender and let the '
                    'local parser discard non-credit messages.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontSize: 11,
                          height: 1.4,
                        ),
                  ),
                  const SizedBox(height: 16),
                  _FieldLabel('OBSERVATION SOURCE'),
                  TextField(
                    controller: _source,
                    onChanged: _markDirty,
                    autocorrect: false,
                    style: const TextStyle(fontSize: 13, fontFamily: 'monospace'),
                    decoration: const InputDecoration(hintText: 'SMS_GATEWAY'),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Stored on each observation as the `source` field. Keep SMS_GATEWAY '
                    'unless the gateway expects another channel name.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontSize: 11,
                          height: 1.4,
                        ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            SectionLabel('Diagnostics'),
            AppCard(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
              child: Column(
                children: [
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.send_rounded,
                        size: 19, color: AppColors.accent2),
                    title: const Text(
                      'Send a test observation',
                      style: TextStyle(fontSize: 13.5, color: AppColors.text),
                    ),
                    subtitle: Text(
                      'Preview the parser and POST a sample credit SMS',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded,
                        size: 20, color: AppColors.faint),
                    onTap: () => showTestSendSheet(context),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.battery_saver_rounded,
                        size: 19, color: AppColors.accent2),
                    title: const Text(
                      'Retry queued messages',
                      style: TextStyle(fontSize: 13.5, color: AppColors.text),
                    ),
                    subtitle: Text(
                      'Replays everything still waiting for delivery',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded,
                        size: 20, color: AppColors.faint),
                    onTap: state.flushQueue,
                  ),
                ],
              ),
            ),
            if (state.platformError != null) ...[
              const SizedBox(height: 16),
              AppCard(
                borderColor: AppColors.danger.withValues(alpha: 0.5),
                child: Text(
                  state.platformError!,
                  style: const TextStyle(
                      fontSize: 12.5, color: AppColors.danger),
                ),
              ),
            ],
              const SizedBox(height: 16),
              _SyncBadge(),
            ],
          ),
        ),
      ),
      _SaveBar(
        dirty: _dirty,
        busy: state.busy,
        onSave: _save,
      ),
    ],
  ),
);
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: Text(
        text,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              letterSpacing: 1.2,
              color: AppColors.muted,
            ),
      ),
    );
  }
}

class _PairingCard extends StatelessWidget {
  const _PairingCard({
    required this.paired,
    required this.deviceId,
    required this.merchantId,
    required this.busy,
    required this.onPair,
    required this.onUnpair,
  });

  final bool paired;
  final String deviceId;
  final String merchantId;
  final bool busy;
  final VoidCallback onPair;
  final VoidCallback onUnpair;

  @override
  Widget build(BuildContext context) {
    final body = Theme.of(context).textTheme.bodySmall?.copyWith(
          fontSize: 11,
          height: 1.45,
        );

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.accent2.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  paired
                      ? Icons.verified_user_rounded
                      : Icons.qr_code_scanner_rounded,
                  size: 18,
                  color: AppColors.accent2,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      paired ? 'Paired device' : 'Not paired',
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.text,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      paired
                          ? 'Signed observations · /api/v1/observers/sms'
                          : 'Use the enrollment secret from the admin panel',
                      style: body,
                    ),
                  ],
                ),
              ),
              StatusPill(
                label: paired ? 'Paired' : 'Optional',
                tone: paired ? PillTone.active : PillTone.idle,
              ),
            ],
          ),
          if (paired) ...[
            const SizedBox(height: 14),
            _PairValue(label: 'DEVICE ID', value: deviceId),
            const SizedBox(height: 6),
            _PairValue(label: 'MERCHANT', value: merchantId),
            const SizedBox(height: 10),
            Text(
              'The signing key stays on this phone. The gateway resolves the '
              "merchant's receiving account and matches the 12-digit reference.",
              style: body,
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: busy ? null : onUnpair,
              icon: const Icon(Icons.link_off_rounded, size: 17),
              label: const Text('Unpair this phone'),
            ),
          ] else ...[
            const SizedBox(height: 10),
            Text(
              'Open Admin → Services → Android SMS Companion, copy the '
              'enrollment secret, and paste it here. No camera permission is '
              'needed.',
              style: body,
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: busy ? null : onPair,
              icon: busy
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 1.8),
                    )
                  : const Icon(Icons.link_rounded, size: 18),
              label: Text(busy ? 'Pairing…' : 'Pair this phone'),
            ),
          ],
        ],
      ),
    );
  }
}

class _PairValue extends StatelessWidget {
  const _PairValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 82,
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  letterSpacing: 1.1,
                  color: AppColors.faint,
                ),
          ),
        ),
        Expanded(
          child: Text(
            value.isEmpty ? '—' : value,
            style: const TextStyle(
              fontSize: 11.5,
              fontFamily: 'monospace',
              color: AppColors.muted,
            ),
          ),
        ),
      ],
    );
  }
}

class _SyncBadge extends StatelessWidget {
  const _SyncBadge();

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Text(
      state.busy
          ? 'Syncing with device…'
          : 'Settings are persisted by the Android service, not the UI.',
      style: Theme.of(context).textTheme.bodySmall?.copyWith(
            fontSize: 10.5,
            color: AppColors.faint,
          ),
    );
  }
}

/// Sticky footer so saving is always one tap away, even on a long form.
class _SaveBar extends StatelessWidget {
  const _SaveBar({
    required this.dirty,
    required this.busy,
    required this.onSave,
  });

  final bool dirty;
  final bool busy;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
      decoration: const BoxDecoration(
        color: Color(0xF2050816),
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          if (dirty)
            const Padding(
              padding: EdgeInsets.only(right: 12),
              child: StatusPill(label: 'Unsaved', tone: PillTone.info),
            ),
          Expanded(
            child: FilledButton(
              onPressed: busy ? null : onSave,
              child: Text(busy ? 'Saving…' : 'Save settings'),
            ),
          ),
        ],
      ),
    );
  }
}
