import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/sms_observer/sms_observer_controller.dart';
import '../services/youpi_admin_api.dart';
import 'scanner_shell.dart' show KkSurface;
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// Native YouPI payment admin — no WebView.
class YoupiAdminScreen extends StatefulWidget {
  const YoupiAdminScreen({super.key, this.initialTab = 0});

  /// Which internal tab to show first (0 Live, 1 Payments, 2 Settings).
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
      length: 3,
      initialIndex: widget.initialTab.clamp(0, 2).toInt(),
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
              Tab(text: 'Settings'),
            ],
          ),
        ),
        body: TabBarView(
          key: ValueKey(_token),
          children: const [
            _LiveTab(),
            _PaymentsTab(),
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
        padding: const EdgeInsets.fromLTRB(16, 14, 16, KkSurface.navClearance),
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
        padding: const EdgeInsets.fromLTRB(16, 14, 16, KkSurface.navClearance),
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

class _VpaManagerSheet extends StatefulWidget {
  const _VpaManagerSheet({required this.scrollController});

  final ScrollController scrollController;

  @override
  State<_VpaManagerSheet> createState() => _VpaManagerSheetState();
}

class _VpaManagerSheetState extends State<_VpaManagerSheet> {
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

    final active = _accounts.where((a) => a['isActive'] == true).toList();
    final history = _accounts.where((a) => a['isActive'] != true).toList();

    Widget card(Map<String, dynamic> account) {
      return Padding(
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
      );
    }

    return ListView(
      controller: widget.scrollController,
      physics: const ClampingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
      children: [
          Center(
            child: Container(
              width: 42,
              height: 4,
              decoration: BoxDecoration(
                color: KkSurface.outline,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              const Expanded(child: _SectionTitle('Payment VPAs')),
              FilledButton.icon(
                onPressed: _addAccount,
                icon: const Icon(TablerIcons.plus, size: 17),
                label: const Text('Add VPA'),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text('Only one VPA can be active at a time.', style: _muted()),
          const SizedBox(height: 14),
          if (_accounts.isEmpty)
            _Panel(child: Text('No UPI accounts saved.', style: _body()))
          else ...[
            if (active.isNotEmpty) ...[
              const _SectionTitle('Active'),
              const SizedBox(height: 8),
              ...active.map(card),
            ],
            const SizedBox(height: 8),
            const _SectionTitle('History'),
            const SizedBox(height: 8),
            if (history.isEmpty)
              Text('No previous VPAs yet.', style: _muted())
            else
              ...history.map(card),
          ],
        ],
      );
  }
}

class _WhatsAppMessagesSheet extends StatefulWidget {
  const _WhatsAppMessagesSheet({
    required this.scrollController,
    required this.initialBranding,
  });

  final ScrollController scrollController;
  final Map<String, dynamic> initialBranding;

  @override
  State<_WhatsAppMessagesSheet> createState() => _WhatsAppMessagesSheetState();
}

class _WhatsAppMessagesSheetState extends State<_WhatsAppMessagesSheet> {
  late final TextEditingController _otp;
  late final TextEditingController _payment;
  late final TextEditingController _member;
  late final TextEditingController _ticket;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    String read(String key) => '${widget.initialBranding[key] ?? ''}';
    _otp = TextEditingController(text: read('otpMessage'));
    _payment = TextEditingController(text: read('paymentMessage'));
    _member = TextEditingController(text: read('memberMessage'));
    _ticket = TextEditingController(text: read('ticketMessage'));
  }

  @override
  void dispose() {
    _otp.dispose();
    _payment.dispose();
    _member.dispose();
    _ticket.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await YoupiAdminApi.post('/admin/merchant-settings', {
        'branding': {
          'otpMessage': _otp.text.trim(),
          'paymentMessage': _payment.text.trim(),
          'memberMessage': _member.text.trim(),
          'ticketMessage': _ticket.text.trim(),
        },
      });
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack(context, '$e');
    }
  }

  Widget _messageField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required String helper,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: controller,
        minLines: 3,
        maxLines: 7,
        style: const TextStyle(fontSize: 13, height: 1.35),
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          helperText: helper,
          helperMaxLines: 3,
          alignLabelWithHint: true,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: widget.scrollController,
      physics: const ClampingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
      children: [
        Center(
          child: Container(
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: KkSurface.outline,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        ),
        const SizedBox(height: 14),
        const _SectionTitle('WhatsApp messages'),
        const SizedBox(height: 4),
        Text(
          'Leave a field blank to use the built-in message. '
          'Changes apply to the next message sent.',
          style: _muted(),
        ),
        const SizedBox(height: 14),
        _messageField(
          controller: _otp,
          label: 'Login message (OTP)',
          hint:
              '🔐 *{appName} Verification Code*\n\nHello {name}! Your one-time '
              'login OTP is: *{otp}*\n\nValid for 5 minutes. Do not share this '
              'code with anyone.',
          helper: 'Placeholders: {otp} · {name} · {appName}',
        ),
        _messageField(
          controller: _payment,
          label: 'Payment message',
          hint:
              '✅ Payment received\n\nHi {name}, we received ₹{amount} for '
              'order {orderId}. Thank you!',
          helper: 'Placeholders: {name} · {amount} · {orderId} · {appName}',
        ),
        _messageField(
          controller: _member,
          label: 'Membership message',
          hint:
              '🎉 Welcome {name}!\n\nYour {appName} membership is active. '
              'Amount paid: ₹{amount}.',
          helper: 'Placeholders: {name} · {amount} · {appName}',
        ),
        _messageField(
          controller: _ticket,
          label: 'Ticket message',
          hint:
              '🎟️ Your {appName} tickets for {movie} are attached. '
              'Seats {seats}. Booking {reference}.',
          helper:
              'Placeholders: {name} · {movie} · {theatre} · {seats} · '
              '{reference} · {appName}',
        ),
        const SizedBox(height: 2),
        FilledButton.icon(
          onPressed: _saving ? null : _save,
          icon: const Icon(TablerIcons.check, size: 17),
          label: Text(_saving ? 'Saving...' : 'Save messages'),
        ),
      ],
    );
  }
}

class _ThisPhonePanel extends StatefulWidget {
  const _ThisPhonePanel({required this.observer});

  final SmsObserverController observer;

  @override
  State<_ThisPhonePanel> createState() => _ThisPhonePanelState();
}

class _ThisPhonePanelState extends State<_ThisPhonePanel> {
  String? _pairError;

  SmsObserverController get _observer => widget.observer;

  String _normalizeGatewayUrl(String raw) {
    var value = raw.trim();
    while (value.endsWith('/')) {
      value = value.substring(0, value.length - 1);
    }
    // The native observer appends /api/v1/... itself.
    if (value.endsWith('/api/v1')) {
      value = value.substring(0, value.length - 7);
    }
    return value;
  }

  Future<Map<String, String>> _fetchPairing() async {
    final qr = await YoupiAdminApi.get('/admin/sms-gateway/pair-qr');
    return {
      'token': '${qr['enrollmentToken'] ?? qr['token'] ?? ''}'.trim(),
      'gateway': _normalizeGatewayUrl(
        '${qr['gatewayUrl'] ?? qr['serverUrl'] ?? ''}',
      ),
    };
  }

  Future<bool> _showSmsConsent() async {
    final accepted = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: KkSurface.container,
        title: const Text('Enable SMS observation?'),
        content: const SingleChildScrollView(
          child: Text(
            'This phone will read bank credit SMS to verify UPI payments for your '
            'theater. Only the amount, UPI reference, sender and raw message are '
            'stored on this device and forwarded to your YouPI gateway. Messages '
            'are kept for up to 30 days.\n\n'
            'By continuing you confirm you have the right to process SMS on this '
            'device.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Agree & continue'),
          ),
        ],
      ),
    );
    return accepted == true;
  }

  Future<void> _pairThisPhone() async {
    if (!Platform.isAndroid) return;
    setState(() => _pairError = null);

    // Ask for device permissions first. A pairing error must not hide the
    // system SMS/notification dialogs from the operator.
    final smsGranted = await _observer.requestSmsPermission();
    await _observer.requestNotificationPermission();
    if (!mounted) return;

    // If the SMS permission was refused, there is nothing to pair: an observer
    // without RECEIVE_SMS/READ_SMS can never see a credit.
    if (!smsGranted) {
      const message =
          'SMS access is required. Allow it in the system prompt or enable '
          '"SMS" for this app in System settings, then try again.';
      setState(() => _pairError = message);
      _snack(context, message);
      return;
    }

    Map<String, String> pairing;
    try {
      pairing = await _fetchPairing();
    } catch (e) {
      const hint =
          'Could not load the pairing token. Check the YouPI admin token '
          '(key icon above) and the network connection.';
      setState(() => _pairError = '$hint $e');
      _snack(context, hint);
      return;
    }

    var token = pairing['token'] ?? '';
    var gateway = pairing['gateway'] ?? '';
    if (token.isEmpty || gateway.isEmpty) {
      const message =
          'Pairing token is unavailable. Set the YouPI admin token (key icon '
          'above), then try again.';
      setState(() => _pairError = message);
      _snack(context, message);
      return;
    }

    if (!_observer.config.consentAccepted) {
      final accepted = await _showSmsConsent();
      if (!accepted) return;
      await _observer.setConsent(true);
    }

    var result = await _observer.pairDevice(secret: token, baseUrl: gateway);

    // The pairing token is short-lived. If it expired, fetch a fresh one and
    // retry once.
    if (!result.ok && result.httpStatus == 401) {
      try {
        pairing = await _fetchPairing();
        token = pairing['token'] ?? '';
        gateway = pairing['gateway'] ?? '';
      } catch (_) {
        // Keep the original error.
      }
      if (token.isNotEmpty && gateway.isNotEmpty) {
        result = await _observer.pairDevice(secret: token, baseUrl: gateway);
      }
    }

    if (!mounted) return;
    if (!result.ok) {
      final message = result.message.isEmpty
          ? 'Pairing failed (HTTP ${result.httpStatus}).'
          : result.message;
      setState(() => _pairError = message);
      _snack(context, message);
      return;
    }

    if (smsGranted) {
      await _observer.setEnabled(true);
      // Forward a credit that arrived before the observer was switched on.
      await _observer.sweepInbox();
    }
    if (!mounted) return;
    _snack(
      context,
      smsGranted
          ? 'This phone is paired and the observer is running.'
          : 'Paired. Grant SMS access below to start observing.',
    );
  }

  /// One switch drives the whole flow: grant access, pair if needed, then
  /// enable. This is what makes the merged admin app behave like the old
  /// gateway app, which was always paired and always listening.
  Future<void> _toggleObserver(bool value) async {
    if (!Platform.isAndroid) return;
    if (!value) {
      await _observer.setEnabled(false);
      return;
    }

    final smsGranted = await _observer.requestSmsPermission();
    if (!smsGranted) {
      if (mounted) {
        _snack(
          context,
          'SMS access is required. Allow it in the system prompt, then turn '
          'the switch on again.',
        );
      }
      return;
    }

    if (!_observer.config.paired) {
      await _pairThisPhone();
      return;
    }

    await _observer.setEnabled(true);
    await _observer.sweepInbox();
  }

  Future<void> _unpairThisPhone() async {
    final ok = await _confirm(
      context,
      'Unpair this phone?',
      'This device will stop forwarding bank SMS.',
    );
    if (!ok) return;
    final deviceId = _observer.config.deviceId;
    await _observer.unpairDevice();
    if (deviceId.isNotEmpty) {
      try {
        await YoupiAdminApi.delete('/admin/sms-gateway/devices/$deviceId');
      } catch (_) {
        // Local credentials are already gone; a stale server row can be
        // removed later.
      }
    }
    if (mounted) _snack(context, 'This phone is no longer paired.');
  }

  Widget _observerPanel() {
    return AnimatedBuilder(
      animation: _observer,
      builder: (context, _) {
        final config = _observer.config;
        final state = _observer.state;
        final paired = config.paired;
        final running = paired && config.enabled;
        final smsGranted = state?.smsPermission ?? false;
        final notificationsGranted = state?.notificationsPermission ?? false;
        final error = _observer.platformError;
        final android = Platform.isAndroid;

        return _Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const _SectionTitle('This phone'),
                  const Spacer(),
                  _Pill(
                    !android
                        ? 'ANDROID ONLY'
                        : paired
                            ? (running ? 'RUNNING' : 'PAUSED')
                            : 'NOT PAIRED',
                    color: !android
                        ? KkSurface.outline
                        : paired
                            ? (running
                                ? KkSurface.accent
                                : KkSurface.secondary)
                            : KkSurface.outline,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (!android)
                Text(
                  'The SMS observer runs on the Android phone that receives '
                  'the bank SMS.',
                  style: _body(),
                )
              else if (!paired) ...[
                Text(
                  'Pair this phone to forward bank credit SMS automatically. '
                  'You will be asked for SMS and notification access.',
                  style: _body(),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _observer.busy ? null : _pairThisPhone,
                  icon: const Icon(TablerIcons.link, size: 17),
                  label: Text(
                    _observer.busy ? 'Pairing...' : 'Pair this phone',
                  ),
                ),
                const SizedBox(height: 4),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('SMS verification', style: _body(bold: true)),
                  subtitle: Text(
                    _observer.busy
                        ? 'Pairing this phone...'
                        : 'Turn on to pair this phone and start verifying payments.',
                    style: _muted(),
                  ),
                  value: false,
                  onChanged: _observer.busy ? null : (value) {
                    if (value) _pairThisPhone();
                  },
                ),
                const SizedBox(height: 4),
                if (!smsGranted)
                  _ObserverPermissionRow(
                    icon: TablerIcons.message,
                    title: 'SMS access',
                    subtitle: 'Required to read bank credit messages',
                    onGrant: _observer.requestSmsPermission,
                  ),
                if (!notificationsGranted)
                  _ObserverPermissionRow(
                    icon: TablerIcons.bellRinging,
                    title: 'Notifications',
                    subtitle: 'Android 13+ keeps the listener running',
                    onGrant: _observer.requestNotificationPermission,
                  ),
              ] else ...[
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'SMS verification',
                            style: _body(bold: true),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            running
                                ? 'Active - forwarding bank SMS.'
                                : 'Standby - turn on to start verifying payments.',
                            style: _muted(),
                          ),
                        ],
                      ),
                    ),
                    IconButton.outlined(
                      onPressed: _observer.busy ? null : _unpairThisPhone,
                      tooltip: 'Unpair this phone',
                      icon: const Icon(TablerIcons.linkOff, size: 18),
                    ),
                    const SizedBox(width: 4),
                    Switch(
                      value: running,
                      onChanged: _observer.busy ? null : _toggleObserver,
                    ),
                  ],
                ),
                if (!smsGranted)
                  _ObserverPermissionRow(
                    icon: TablerIcons.message,
                    title: 'SMS access',
                    subtitle: 'Required to read bank credit messages',
                    onGrant: _observer.requestSmsPermission,
                  ),
                if (!notificationsGranted)
                  _ObserverPermissionRow(
                    icon: TablerIcons.bellRinging,
                    title: 'Notifications',
                    subtitle: 'Android 13+ keeps the listener running',
                    onGrant: _observer.requestNotificationPermission,
                  ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _ObserverStat(
                        label: 'Forwarded',
                        value: state?.stats.forwarded ?? 0,
                        color: KkSurface.accent,
                      ),
                    ),
                    Expanded(
                      child: _ObserverStat(
                        label: 'Waiting',
                        value: state?.stats.pending ?? 0,
                        color: KkSurface.secondary,
                      ),
                    ),
                    Expanded(
                      child: _ObserverStat(
                        label: 'Failed',
                        value: state?.stats.failed ?? 0,
                        color: KkSurface.error,
                      ),
                    ),
                  ],
                ),
              ],
              if (_pairError != null) ...[
                const SizedBox(height: 8),
                Text(
                  _pairError!,
                  style: _muted().copyWith(color: KkSurface.error),
                ),
              ],
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(
                  error,
                  style: _muted().copyWith(color: KkSurface.error),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) => _observerPanel();
}

class _ObserverPermissionRow extends StatelessWidget {
  const _ObserverPermissionRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onGrant,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Future<bool> Function() onGrant;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: KkSurface.containerHigh,
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(icon, size: 17, color: KkSurface.accent),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: _body(bold: true)),
                Text(subtitle, style: _muted()),
              ],
            ),
          ),
          TextButton(
            onPressed: () => onGrant(),
            child: const Text('Grant'),
          ),
        ],
      ),
    );
  }
}

class _ObserverStat extends StatelessWidget {
  const _ObserverStat({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$value',
          style: GoogleFonts.publicSans(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
        Text(label.toUpperCase(), style: _muted(size: 9.5)),
      ],
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
  Map<String, dynamic>? _whatsapp;
  String _activeVpa = '';
  String? _error;
  bool _loading = true;
  late final SmsObserverController _observer;

  @override
  void initState() {
    super.initState();
    _observer = SmsObserverController();
    _observer.addListener(_onObserverChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _observer.start();
    });
    _load();
  }

  void _onObserverChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _observer.removeListener(_onObserverChanged);
    _observer.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        YoupiAdminApi.get('/admin/merchant-settings'),
        YoupiAdminApi.get('/admin/upi-accounts'),
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
      final accounts =
          (results[1]['accounts'] as List?)?.cast<Map<String, dynamic>>() ??
              const <Map<String, dynamic>>[];
      Map<String, dynamic>? activeAccount;
      for (final account in accounts) {
        if (account['isActive'] == true) {
          activeAccount = account;
          break;
        }
      }
      setState(() {
        _settings = results[0];
        _whatsapp = whatsapp;
        _activeVpa = '${activeAccount?['upiId'] ?? results[0]['upiId'] ?? ''}';
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

  Future<void> _openVpaManager() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: KkSurface.container,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.82,
        minChildSize: 0.35,
        maxChildSize: 0.95,
        builder: (context, scrollController) =>
            _VpaManagerSheet(scrollController: scrollController),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _openWhatsAppMessages() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: KkSurface.container,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.88,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (context, scrollController) => _WhatsAppMessagesSheet(
          scrollController: scrollController,
          initialBranding:
              (_settings?['branding'] as Map?)?.cast<String, dynamic>() ??
                  const <String, dynamic>{},
        ),
      ),
    );
    if (mounted) await _load();
    if (saved == true && mounted) {
      _snack(context, 'WhatsApp messages saved.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);
    final settings = _settings ?? const {};
    final whatsapp = _whatsapp ?? const {};
    final waStatus = '${whatsapp['status'] ?? 'DISCONNECTED'}';
    final waQr = whatsapp['qrCode']?.toString();

    return RefreshIndicator(
      color: KkSurface.accent,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, KkSurface.navClearance),
        children: [
          _ThisPhonePanel(observer: _observer),
          const SizedBox(height: 12),
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _openWhatsAppMessages,
                  child: Row(
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
                      const SizedBox(width: 4),
                      const Icon(
                        TablerIcons.chevronRight,
                        size: 18,
                        color: KkSurface.onSurfaceVariant,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                if (waStatus == 'CONNECTED')
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Linked phone: ${whatsapp['phoneNumber'] ?? 'Linked device'}',
                          style: _body(),
                        ),
                      ),
                      IconButton(
                        onPressed: _connectWhatsApp,
                        tooltip: 'Re-pair WhatsApp',
                        icon: const Icon(TablerIcons.refresh, size: 18),
                      ),
                      IconButton(
                        onPressed: _disconnectWhatsApp,
                        tooltip: 'Disconnect WhatsApp',
                        icon: const Icon(TablerIcons.linkOff, size: 18),
                      ),
                    ],
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
                if (waStatus != 'CONNECTED') ...[
                  const SizedBox(height: 10),
                  FilledButton(
                    onPressed: _connectWhatsApp,
                    child: const Text('Connect WhatsApp'),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: _openVpaManager,
            child: _Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(child: _SectionTitle('Store')),
                      const Icon(
                        TablerIcons.chevronRight,
                        size: 18,
                        color: KkSurface.onSurfaceVariant,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _KeyValue('Business', '${settings['businessName'] ?? '-'}'),
                  _KeyValue(
                    'Active VPA',
                    _activeVpa.trim().isEmpty ? '-' : _activeVpa,
                  ),
                ],
              ),
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
