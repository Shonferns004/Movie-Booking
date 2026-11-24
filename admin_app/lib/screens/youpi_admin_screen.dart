import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../services/sms_observer/format.dart';
import '../services/sms_observer/gateway_bridge.dart';
import '../services/sms_observer/observer_event.dart';
import '../services/sms_observer/sms_observer_controller.dart';
import '../services/youpi_admin_api.dart';
import 'scanner_shell.dart' show KkSurface;
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// Native YouPI payment admin — no WebView.
class YoupiAdminScreen extends StatefulWidget {
  const YoupiAdminScreen({super.key, this.initialTab = 0});

  /// Which internal tab to show first (0 Live, 1 Payments, 2 Accounts,
  /// 3 SMS Hub, 4 Gateway).
  final int initialTab;

  @override
  State<YoupiAdminScreen> createState() => _YoupiAdminScreenState();
}

class _YoupiAdminScreenState extends State<YoupiAdminScreen> {
  bool _loading = true;
  String _token = '';

  @override
  void initState() {
    super.initState();
    _loadToken();
  }

  Future<void> _loadToken() async {
    await YoupiAdminApi.loadToken();
    if (!mounted) return;
    setState(() {
      _token = YoupiAdminApi.token;
      _loading = false;
    });
  }

  Future<void> _changeToken() async {
    final controller = TextEditingController(text: _token);
    final saved = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: KkSurface.container,
        title: const Text('Gateway admin token'),
        content: TextField(
          controller: controller,
          obscureText: true,
          autocorrect: false,
          enableSuggestions: false,
          style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
          decoration: const InputDecoration(
            hintText: 'Paste the ADMIN_TOKEN from Render',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (saved == null) return;
    await YoupiAdminApi.saveToken(saved);
    if (!mounted) return;
    setState(() => _token = YoupiAdminApi.token);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        backgroundColor: KkSurface.bg,
        body: Center(
          child: CircularProgressIndicator(color: KkSurface.accent),
        ),
      );
    }

    if (_token.isEmpty) {
      return _TokenGate(
        onSaved: (value) {
          setState(() => _token = value);
        },
      );
    }

    return DefaultTabController(
      length: 5,
      initialIndex: widget.initialTab.clamp(0, 4).toInt(),
      child: Scaffold(
        backgroundColor: KkSurface.bg,
        appBar: AppBar(
          backgroundColor: KkSurface.bg,
          surfaceTintColor: Colors.transparent,
          title: Text(
            'YouPI Admin',
            style: GoogleFonts.publicSans(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: KkSurface.onSurface,
            ),
          ),
          actions: [
            IconButton(
              tooltip: 'Gateway token',
              onPressed: _changeToken,
              icon: const Icon(
                TablerIcons.key,
                size: 20,
                color: KkSurface.accent,
              ),
            ),
          ],
          bottom: TabBar(
            isScrollable: true,
            indicatorColor: KkSurface.accent,
            labelColor: KkSurface.accent,
            unselectedLabelColor: KkSurface.onSurfaceVariant,
            tabs: const [
              Tab(text: 'Live'),
              Tab(text: 'Payments'),
              Tab(text: 'Accounts'),
              Tab(text: 'SMS Hub'),
              Tab(text: 'Gateway'),
            ],
          ),
        ),
        body: TabBarView(
          key: ValueKey(_token),
          children: const [
            _LiveTab(),
            _PaymentsTab(),
            _AccountsTab(),
            _SmsTab(),
            _GatewayTab(),
          ],
        ),
      ),
    );
  }
}

class _TokenGate extends StatefulWidget {
  const _TokenGate({required this.onSaved});

  final ValueChanged<String> onSaved;

  @override
  State<_TokenGate> createState() => _TokenGateState();
}

class _TokenGateState extends State<_TokenGate> {
  final _controller = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final value = _controller.text.trim();
    if (value.isEmpty) return;
    setState(() => _saving = true);
    await YoupiAdminApi.saveToken(value);
    if (!mounted) return;
    setState(() => _saving = false);
    widget.onSaved(value);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: KkSurface.bg,
      appBar: AppBar(
        backgroundColor: KkSurface.bg,
        title: const Text('YouPI Admin'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(
                  TablerIcons.shieldCheck,
                  size: 42,
                  color: KkSurface.accent,
                ),
                const SizedBox(height: 14),
                Text(
                  'Connect the gateway',
                  style: GoogleFonts.publicSans(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: KkSurface.onSurface,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Paste the ADMIN_TOKEN configured on the Render gateway. '
                  'It stays on this phone and is never bundled in the app.',
                  style: GoogleFonts.publicSans(
                    fontSize: 12.5,
                    height: 1.5,
                    color: KkSurface.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 18),
                TextField(
                  controller: _controller,
                  obscureText: true,
                  autocorrect: false,
                  enableSuggestions: false,
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
                  decoration: const InputDecoration(
                    hintText: 'ADMIN_TOKEN',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  child: Text(_saving ? 'Connecting…' : 'Connect gateway'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Tabs
// -----------------------------------------------------------------------------

class _LiveTab extends StatefulWidget {
  const _LiveTab();

  @override
  State<_LiveTab> createState() => _LiveTabState();
}

class _LiveTabState extends State<_LiveTab> {
  Map<String, dynamic>? _queue;
  Map<String, dynamic>? _payments;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        YoupiAdminApi.get('/admin/queue'),
        YoupiAdminApi.get('/admin/payments'),
      ]);
      if (!mounted) return;
      setState(() {
        _queue = results[0];
        _payments = results[1];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }
    final queue = _queue ?? const {};
    final payments =
        (_payments?['payments'] as List?)?.cast<Map<String, dynamic>>() ??
            const <Map<String, dynamic>>[];
    final waiting =
        (queue['queue'] as List?)?.cast<Map<String, dynamic>>() ??
            const <Map<String, dynamic>>[];
    final slot = queue['currentSlot'] as Map<String, dynamic>?;
    final activeAccount = queue['receivingAccount'] as Map<String, dynamic>?;

    final success = payments.where((p) => p['status'] == 'SUCCESS').toList();
    final volume = success.fold<int>(
      0,
      (sum, p) => sum + (int.tryParse('${p['amountPaise']}') ?? 0),
    );
    final pendingCounter = payments
        .where((p) =>
            p['status'] == 'ACTIVE' &&
            (p['method'] == 'CASH_COUNTER' || p['method'] == 'CARD_COUNTER'))
        .length;

    return RefreshIndicator(
      color: KkSurface.accent,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _Kpi('Today', _money(volume)),
              _Kpi('Successful', '${success.length}'),
              _Kpi('Waiting', '${waiting.length}'),
              _Kpi('Counter', '$pendingCounter'),
            ],
          ),
          const SizedBox(height: 14),
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Active UPI slot'),
                const SizedBox(height: 8),
                if (slot != null && slot['status'] == 'ACTIVE')
                  _KeyValue(
                    'Order #${slot['orderId'] ?? '-'}',
                    _money(slot['amountPaise']),
                    trailing: _Pill('ACTIVE',
                        color: KkSurface.accent, textColor: KkSurface.onPrimary),
                  )
                else
                  Text(
                    'No customer is checking out right now.',
                    style: _body(),
                  ),
                if (activeAccount != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    'Receiving UPI: ${activeAccount['upiId'] ?? '-'}',
                    style: _muted(),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Waiting queue'),
                const SizedBox(height: 8),
                if (waiting.isEmpty)
                  Text('The waiting queue is empty.', style: _body())
                else
                  ...waiting.map(
                    (item) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _KeyValue(
                        '#${item['queuePosition']} · Order #${item['orderId']}',
                        _money(item['amountPaise']),
                        trailing: _Pill('QUEUED',
                            color: KkSurface.outline,
                            textColor: KkSurface.onSurface),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(child: _SectionTitle('Recent payments')),
                    TextButton(
                      onPressed: _load,
                      child: const Text('Refresh'),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                if (payments.isEmpty)
                  Text('No payments yet.', style: _body())
                else
                  ...payments.take(6).map(_paymentRow),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentsTab extends StatefulWidget {
  const _PaymentsTab();

  @override
  State<_PaymentsTab> createState() => _PaymentsTabState();
}

class _PaymentsTabState extends State<_PaymentsTab> {
  List<Map<String, dynamic>> _payments = const [];
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await YoupiAdminApi.get('/admin/payments');
      if (!mounted) return;
      setState(() {
        _payments =
            (data['payments'] as List?)?.cast<Map<String, dynamic>>() ??
                const [];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);
    return RefreshIndicator(
      color: KkSurface.accent,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          if (_payments.isEmpty)
            _Panel(child: Text('No payments have been recorded.', style: _body()))
          else
            ..._payments.map(
              (payment) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _Panel(child: _paymentTile(payment)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _paymentTile(Map<String, dynamic> p) {
    final status = '${p['status'] ?? '-'}';
    final tag = '${p['verificationTag'] ?? ''}';
    final sources =
        (p['verificationSources'] as List?)?.join(' + ') ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Order #${p['orderId'] ?? '-'}',
                style: GoogleFonts.publicSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: KkSurface.onSurface,
                ),
              ),
            ),
            Text(
              _money(p['amountPaise']),
              style: GoogleFonts.publicSans(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: KkSurface.onSurface,
              ),
            ),
          ],
        ),
        const SizedBox(height: 7),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            _Pill(status, color: _statusColor(status)),
            _Pill('${p['method'] ?? '-'}', color: KkSurface.outline),
            if (tag.isNotEmpty) _Pill(tag, color: KkSurface.outline),
          ],
        ),
        if (sources.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text('Verified by: $sources', style: _muted()),
        ],
        const SizedBox(height: 6),
        Text(
          '${_date(p['createdAt'])}${p['completedAt'] != null ? ' · completed ${_date(p['completedAt'])}' : ''}',
          style: _muted(),
        ),
      ],
    );
  }
}

class _AccountsTab extends StatefulWidget {
  const _AccountsTab();

  @override
  State<_AccountsTab> createState() => _AccountsTabState();
}

class _AccountsTabState extends State<_AccountsTab> {
  List<Map<String, dynamic>> _accounts = const [];
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await YoupiAdminApi.get('/admin/upi-accounts');
      if (!mounted) return;
      setState(() {
        _accounts =
            (data['accounts'] as List?)?.cast<Map<String, dynamic>>() ??
                const [];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _addAccount() async {
    final upi = TextEditingController();
    final payee = TextEditingController();
    final body = await showDialog<Map<String, String>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: KkSurface.container,
        title: const Text('Add receiving UPI'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: upi,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'UPI ID / VPA',
                hintText: 'name@bank',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: payee,
              decoration: const InputDecoration(labelText: 'Payee name'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, {
              'upiId': upi.text.trim(),
              'payeeName': payee.text.trim(),
            }),
            child: const Text('Add & activate'),
          ),
        ],
      ),
    );
    upi.dispose();
    payee.dispose();
    if (body == null || body['upiId']!.isEmpty) return;
    try {
      await YoupiAdminApi.post('/admin/upi-accounts', {
        ...body,
        'isActive': true,
      });
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _activate(Map<String, dynamic> account) async {
    try {
      await YoupiAdminApi.post(
        '/admin/upi-accounts/${account['id']}/activate',
      );
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _toggle(Map<String, dynamic> account) async {
    try {
      await YoupiAdminApi.post('/admin/upi-accounts/${account['id']}/toggle');
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _delete(Map<String, dynamic> account) async {
    final ok = await _confirm(context, 
      'Delete ${account['upiId']}?',
      'This removes the VPA from the gateway.',
    );
    if (!ok) return;
    try {
      await YoupiAdminApi.delete('/admin/upi-accounts/${account['id']}');
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);
    return RefreshIndicator(
      color: KkSurface.accent,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Only one VPA can be active at a time.',
                  style: _muted(),
                ),
              ),
              FilledButton.icon(
                onPressed: _addAccount,
                icon: const Icon(TablerIcons.plus, size: 17),
                label: const Text('Add VPA'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_accounts.isEmpty)
            _Panel(child: Text('No UPI accounts saved.', style: _body()))
          else
            ..._accounts.map(
              (account) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _Panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${account['upiId']}',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: KkSurface.onSurface,
                                fontFamily: 'monospace',
                              ),
                            ),
                          ),
                          _Pill(
                            account['isActive'] == true ? 'ACTIVE' : 'DISABLED',
                            color: account['isActive'] == true
                                ? KkSurface.accent
                                : KkSurface.outline,
                            textColor: account['isActive'] == true
                                ? KkSurface.onPrimary
                                : KkSurface.onSurface,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text('${account['payeeName'] ?? '-'}', style: _body()),
                      if (account['isSlotBusy'] == true) ...[
                        const SizedBox(height: 4),
                        Text('Slot busy', style: _muted()),
                      ],
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          if (account['isActive'] != true)
                            TextButton(
                              onPressed: () => _activate(account),
                              child: const Text('Activate'),
                            )
                          else
                            TextButton(
                              onPressed: () => _toggle(account),
                              child: const Text('Deactivate'),
                            ),
                          TextButton(
                            onPressed: () => _delete(account),
                            child: const Text(
                              'Delete',
                              style: TextStyle(color: KkSurface.error),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _SmsTab extends StatefulWidget {
  const _SmsTab();

  @override
  State<_SmsTab> createState() => _SmsTabState();
}

class _SmsTabState extends State<_SmsTab> {
  String _payload = '';
  String _token = '';
  String _gatewayUrl = '';
  List<Map<String, dynamic>> _devices = const [];
  String? _error;
  bool _loading = true;
  final _sender = TextEditingController(text: 'HDFCBK');
  final _sms = TextEditingController();
  String _testResult = '';
  late final SmsObserverController _observer;

  @override
  void initState() {
    super.initState();
    _observer = SmsObserverController();
    _observer.start();
    _load();
  }

  @override
  void dispose() {
    _observer.dispose();
    _sender.dispose();
    _sms.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        YoupiAdminApi.get('/admin/sms-gateway/pair-qr'),
        YoupiAdminApi.get('/admin/sms-gateway/devices'),
      ]);
      if (!mounted) return;
      setState(() {
        final qr = results[0];
        _payload = '${qr['pairingPayload'] ?? ''}';
        _token = '${qr['enrollmentToken'] ?? qr['token'] ?? ''}';
        _gatewayUrl = '${qr['gatewayUrl'] ?? qr['serverUrl'] ?? ''}';
        _devices =
            (results[1]['devices'] as List?)?.cast<Map<String, dynamic>>() ??
                const [];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _unpair(Map<String, dynamic> device) async {
    final ok = await _confirm(context, 
      'Unpair ${device['deviceName'] ?? device['device_name'] ?? 'device'}?',
      'The phone will stop forwarding bank SMS.',
    );
    if (!ok) return;
    try {
      await YoupiAdminApi.delete(
        '/admin/sms-gateway/devices/${device['id'] ?? device['deviceId']}',
      );
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _downloadQr() async {
    if (_payload.isEmpty) return;
    try {
      final painter = QrPainter(
        data: _payload,
        version: QrVersions.auto,
        gapless: true,
        color: const Color(0xFF0F172A),
        emptyColor: Colors.white,
      );
      final image = await painter.toImageData(700);
      if (image == null) throw Exception('Could not render the QR');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/konkani-sms-gateway-pairing.png');
      await file.writeAsBytes(image.buffer.asUint8List(), flush: true);
      await Share.shareXFiles(
        [XFile(file.path)],
        text: 'Scan this QR with the Konkani SMS Gateway app to pair the phone.',
      );
    } catch (e) {
      if (mounted) _snack(context, 'Could not share QR: $e');
    }
  }

  Future<void> _sendTest() async {
    if (_sms.text.trim().isEmpty) return;
    setState(() => _testResult = 'Dispatching…');
    try {
      final data = await YoupiAdminApi.sendTestSms(
        sender: _sender.text.trim(),
        body: _sms.text.trim(),
      );
      if (!mounted) return;
      final event = data['event'] as Map<String, dynamic>?;
      final amount = event?['amountPaise'];
      setState(() {
        _testResult = event == null
            ? 'Parsed, but no credit event was returned.'
            : 'Parsed ₹${((int.tryParse('$amount') ?? 0) / 100).toStringAsFixed(2)} · ${event['refId'] ?? '-'}';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _testResult = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);
    return RefreshIndicator(
      color: KkSurface.accent,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          _Panel(
            child: Column(
              children: [
                const _SectionTitle('Scan to pair phone'),
                const SizedBox(height: 12),
                if (_payload.isEmpty)
                  Text('Pairing QR is unavailable. Refresh and try again.',
                      style: _body())
                else
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: QrImageView(
                      data: _payload,
                      size: 230,
                      backgroundColor: Colors.white,
                      eyeStyle: const QrEyeStyle(
                        eyeShape: QrEyeShape.square,
                        color: Color(0xFF0F172A),
                      ),
                      dataModuleStyle: const QrDataModuleStyle(
                        dataModuleShape: QrDataModuleShape.square,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                  ),
                const SizedBox(height: 12),
                Text(
                  'Open the Konkani SMS Gateway app → Scan Pairing QR.',
                  textAlign: TextAlign.center,
                  style: _body(),
                ),
                if (_gatewayUrl.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  _CopyRow(label: 'Gateway URL', value: _gatewayUrl),
                ],
                if (_token.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _CopyRow(label: 'Enrollment token', value: _token),
                ],
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: _load,
                  icon: const Icon(TablerIcons.refresh, size: 16),
                  label: const Text('Refresh QR'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _downloadQr,
                  icon: const Icon(TablerIcons.download, size: 16),
                  label: const Text('Download / share QR'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Paired phones'),
                const SizedBox(height: 8),
                if (_devices.isEmpty)
                  Text('No devices paired yet.', style: _body())
                else
                  ..._devices.map(
                    (device) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${device['deviceName'] ?? device['device_name'] ?? 'Android device'}',
                                  style: _body(),
                                ),
                                Text(
                                  '${device['deviceId'] ?? device['id'] ?? '-'}',
                                  style: _muted(),
                                ),
                              ],
                            ),
                          ),
                          TextButton(
                            onPressed: () => _unpair(device),
                            child: const Text('Unpair'),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Test bank SMS'),
                const SizedBox(height: 8),
                TextField(
                  controller: _sender,
                  decoration: const InputDecoration(labelText: 'Sender'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _sms,
                  minLines: 3,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    labelText: 'SMS text',
                    hintText:
                        'Dear Customer, A/C *1234 credited by Rs 1.00 via UPI…',
                  ),
                ),
                const SizedBox(height: 10),
                FilledButton(
                  onPressed: _sendTest,
                  child: const Text('Dispatch test SMS'),
                ),
                if (_testResult.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(_testResult, style: _muted()),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _GatewayTab extends StatefulWidget {
  const _GatewayTab();

  @override
  State<_GatewayTab> createState() => _GatewayTabState();
}

class _GatewayTabState extends State<_GatewayTab> {
  Map<String, dynamic>? _settings;
  Map<String, dynamic>? _observers;
  Map<String, dynamic>? _whatsapp;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        YoupiAdminApi.get('/admin/merchant-settings'),
        YoupiAdminApi.get('/admin/observers'),
      ]);
      // WhatsApp is optional: a disconnected/broken session must not blank the
      // whole gateway screen.
      Map<String, dynamic> whatsapp = <String, dynamic>{};
      try {
        whatsapp = await YoupiAdminApi.get('/admin/whatsapp/status');
      } catch (e) {
        whatsapp = <String, dynamic>{
          'status': 'ERROR',
          'lastError': {'message': '$e'},
        };
      }
      if (!mounted) return;
      setState(() {
        _settings = results[0];
        _observers = results[1];
        _whatsapp = whatsapp;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _connectWhatsApp() async {
    var lastError = '';
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        await YoupiAdminApi.post('/admin/whatsapp/reconnect');
        lastError = '';
        break;
      } catch (e) {
        lastError = '$e';
        // Give the service a moment to finish tearing down the old session.
        if (attempt == 0) {
          await Future.delayed(const Duration(seconds: 2));
        }
      }
    }
    if (lastError.isNotEmpty && mounted) {
      _snack(context, 'WhatsApp reconnect failed: $lastError');
    }
    if (mounted) await _load();
  }

  Future<void> _disconnectWhatsApp() async {
    final ok = await _confirm(context, 
      'Disconnect WhatsApp?',
      'The OTP and ticket sending session will be wiped.',
    );
    if (!ok) return;
    try {
      await YoupiAdminApi.post('/admin/whatsapp/disconnect');
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);
    final settings = _settings ?? const {};
    final observers = _observers ?? const {};
    final whatsapp = _whatsapp ?? const {};
    final gmail = observers['gmail'] as Map<String, dynamic>?;
    final sms = observers['sms'] as Map<String, dynamic>?;
    final android = observers['android'] as Map<String, dynamic>?;
    final waStatus = '${whatsapp['status'] ?? 'DISCONNECTED'}';
    final waQr = whatsapp['qrCode']?.toString();

    return RefreshIndicator(
      color: KkSurface.accent,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Webhook'),
                const SizedBox(height: 8),
                if ('${settings['webhookUrl'] ?? ''}'.isNotEmpty)
                  _CopyRow(
                    label: 'Destination URL',
                    value: '${settings['webhookUrl']}',
                  )
                else
                  Text('No webhook URL configured.', style: _body()),
                const SizedBox(height: 8),
                if ('${settings['webhookSecret'] ?? ''}'.isNotEmpty)
                  _CopyRow(
                    label: 'HMAC secret',
                    value: '${settings['webhookSecret']}',
                    obscure: true,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Verification observers'),
                const SizedBox(height: 8),
                _KeyValue(
                  'Gmail',
                  '${gmail?['status'] ?? 'STANDBY'}',
                  trailing: _Pill(
                    gmail?['isRunning'] == true ? 'ACTIVE' : 'IDLE',
                    color: gmail?['isRunning'] == true
                        ? KkSurface.accent
                        : KkSurface.outline,
                  ),
                ),
                _KeyValue(
                  'SMS',
                  '${sms?['status'] ?? 'STANDBY'}',
                  trailing: _Pill(
                    sms?['isRunning'] == true ? 'ACTIVE' : 'IDLE',
                    color: sms?['isRunning'] == true
                        ? KkSurface.accent
                        : KkSurface.outline,
                  ),
                ),
                _KeyValue(
                  'Android devices',
                  '${android?['totalDevices'] ?? 0} paired',
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(child: _SectionTitle('WhatsApp')),
                    _Pill(
                      waStatus,
                      color: waStatus == 'CONNECTED'
                          ? KkSurface.accent
                          : KkSurface.outline,
                      textColor: waStatus == 'CONNECTED'
                          ? KkSurface.onPrimary
                          : KkSurface.onSurface,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (waStatus == 'CONNECTED')
                  Text(
                    'Linked phone: ${whatsapp['phoneNumber'] ?? 'Linked device'}',
                    style: _body(),
                  )
                else
                  Text(
                    'Pair WhatsApp to send login OTPs and ticket PDFs.',
                    style: _body(),
                  ),
                if (whatsapp['lastError'] is Map) ...[
                  const SizedBox(height: 6),
                  Text(
                    '${(whatsapp['lastError'] as Map)['message'] ?? ''}',
                    style: _muted(),
                  ),
                ],
                if (waStatus == 'QR_READY' && waQr != null) ...[
                  const SizedBox(height: 12),
                  Center(child: _qrView(waQr)),
                ],
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  children: [
                    FilledButton(
                      onPressed: _connectWhatsApp,
                      child: Text(
                        waStatus == 'CONNECTED' ? 'Re-pair' : 'Connect WhatsApp',
                      ),
                    ),
                    if (waStatus == 'CONNECTED')
                      OutlinedButton(
                        onPressed: _disconnectWhatsApp,
                        child: const Text('Disconnect'),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Store'),
                const SizedBox(height: 8),
                _KeyValue('Business', '${settings['businessName'] ?? '-'}'),
                _KeyValue('Active VPA', '${settings['upiId'] ?? '-'}'),
                _KeyValue(
                  'Selling mode',
                  '${settings['sellingMode'] ?? '-'}',
                ),
                _KeyValue(
                  'Methods',
                  '${(settings['enabledPaymentMethods'] as List?)?.join(' · ') ?? '-'}',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _qrView(String raw) {
    try {
      if (raw.startsWith('<svg')) {
        return SvgPicture.string(raw, width: 220, height: 220);
      }
      if (raw.startsWith('data:image/svg+xml;utf8,')) {
        final svg = Uri.decodeComponent(
          raw.substring('data:image/svg+xml;utf8,'.length),
        );
        return SvgPicture.string(svg, width: 220, height: 220);
      }
      if (raw.startsWith('data:image/png;base64,')) {
        return Image.memory(
          base64Decode(raw.split(',').last),
          width: 220,
          height: 220,
        );
      }
      if (raw.startsWith('http')) {
        return Image.network(raw, width: 220, height: 220);
      }
    } catch (_) {}
    return Text('QR is available — refresh the status.', style: _muted());
  }
}

// -----------------------------------------------------------------------------
// Shared bits
// -----------------------------------------------------------------------------

Widget _paymentRow(Map<String, dynamic> p) {
  final status = '${p['status'] ?? '-'}';
  return Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: _KeyValue(
      'Order #${p['orderId'] ?? '-'}',
      _money(p['amountPaise']),
      trailing: _Pill(status, color: _statusColor(status)),
    ),
  );
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KkSurface.container,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: KkSurface.border),
      ),
      child: child,
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: GoogleFonts.publicSans(
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: KkSurface.onSurface,
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 150,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KkSurface.container,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: KkSurface.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: _muted(size: 9.5)),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.publicSans(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: KkSurface.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _KeyValue extends StatelessWidget {
  const _KeyValue(this.label, this.value, {this.trailing});

  final String label;
  final String value;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: _body())),
          if (trailing != null) ...[
            Text(value, style: _body()),
            const SizedBox(width: 8),
            trailing!,
          ] else
            Flexible(
              child: Text(
                value,
                textAlign: TextAlign.right,
                style: _body(bold: true),
              ),
            ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, {this.color = KkSurface.outline, this.textColor});

  final String text;
  final Color color;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        text,
        style: GoogleFonts.publicSans(
          fontSize: 9.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
          color: textColor ?? KkSurface.onSurface,
        ),
      ),
    );
  }
}

class _CopyRow extends StatelessWidget {
  const _CopyRow({
    required this.label,
    required this.value,
    this.obscure = false,
  });

  final String label;
  final String value;
  final bool obscure;

  @override
  Widget build(BuildContext context) {
    final shown = obscure
        ? '•' * value.length.clamp(0, 28).toInt()
        : value;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 110,
          child: Text(label, style: _muted()),
        ),
        Expanded(
          child: Text(
            shown,
            style: _body(),
          ),
        ),
        IconButton(
          tooltip: 'Copy',
          onPressed: () {
            Clipboard.setData(ClipboardData(text: value));
            _snack(context, 'Copied $label');
          },
          icon: const Icon(TablerIcons.copy, size: 16),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(TablerIcons.alertTriangle,
                size: 34, color: KkSurface.error),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: _body()),
            const SizedBox(height: 14),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

TextStyle _body({bool bold = false, double size = 12.5}) =>
    GoogleFonts.publicSans(
      fontSize: size,
      height: 1.4,
      fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
      color: KkSurface.onSurface,
    );

TextStyle _muted({double size = 11}) => GoogleFonts.publicSans(
      fontSize: size,
      height: 1.4,
      color: KkSurface.onSurfaceVariant,
    );

String _money(dynamic paise) {
  final value = (int.tryParse('$paise') ?? 0) / 100;
  return '₹${value.toStringAsFixed(2)}';
}

String _date(dynamic value) {
  final dt = DateTime.tryParse('$value');
  if (dt == null) return '-';
  final local = dt.toLocal();
  return '${local.day}/${local.month} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

Color _statusColor(String status) {
  switch (status) {
    case 'SUCCESS':
      return KkSurface.accent;
    case 'ACTIVE':
    case 'PROCESSING':
      return const Color(0xFF38BDF8);
    case 'FAILED':
    case 'EXPIRED':
    case 'CANCELLED':
      return KkSurface.error;
    default:
      return KkSurface.outline;
  }
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

Future<bool> _confirm(
  BuildContext context,
  String title,
  String body,
) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      backgroundColor: KkSurface.container,
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: const Text('Confirm'),
        ),
      ],
    ),
  );
  return result == true;
}
