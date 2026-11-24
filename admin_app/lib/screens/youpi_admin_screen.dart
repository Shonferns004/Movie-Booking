import 'dart:convert';
import 'dart:io';
import '../widgets/kk_pull_to_refresh.dart';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../services/api.dart';
import '../services/auth_service.dart';
import '../services/sms_observer/sms_observer_controller.dart';
import '../services/youpi_admin_api.dart';
import 'scanner_shell.dart' show KkSurface;
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// Native YouPI payment admin — no WebView.
class YoupiAdminScreen extends StatefulWidget {
  const YoupiAdminScreen({
    super.key,
    this.initialTab = 0,
    this.showSettingsTab = true,
    this.settingsOnly = false,
  });

  /// Which internal tab to show first (0 Live, 1 Settings).
  final int initialTab;

  /// When false the screen shows only the Live tab.
  final bool showSettingsTab;

  /// When true the screen shows only the Settings content.
  final bool settingsOnly;

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
      return Scaffold(
        backgroundColor: KkSurface.bg,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Admin gateway token is missing from this build. '
              'Install the official admin APK.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: KkSurface.onSurfaceVariant,
              ),
            ),
          ),
        ),
      );
    }

    if (widget.settingsOnly) {
      return Scaffold(
        backgroundColor: KkSurface.bg,
        appBar: _buildAppBar(),
        body: const _GatewayTab(),
      );
    }

    if (!widget.showSettingsTab) {
      return Scaffold(
        backgroundColor: KkSurface.bg,
        appBar: _buildAppBar(),
        body: const _LiveTab(),
      );
    }

    return DefaultTabController(
      length: 2,
      initialIndex: widget.initialTab.clamp(0, 1).toInt(),
      child: Scaffold(
        backgroundColor: KkSurface.bg,
        appBar: _buildAppBar(
          bottom: TabBar(
            isScrollable: true,
            indicatorColor: KkSurface.accent,
            labelColor: KkSurface.accent,
            unselectedLabelColor: KkSurface.onSurfaceVariant,
            tabs: const [
              Tab(text: 'Live'),
              Tab(text: 'Settings'),
            ],
          ),
        ),
        body: TabBarView(
          key: ValueKey(_token),
          children: const [
            _LiveTab(),
            _GatewayTab(),
          ],
        ),
      ),
    );
  }

  AppBar _buildAppBar({PreferredSizeWidget? bottom}) {
    return AppBar(
      backgroundColor: KkSurface.bg,
      surfaceTintColor: Colors.transparent,
      title: Text(
        widget.settingsOnly ? 'Settings' : 'Konkani Samudai Payments',
        style: TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w700,
          color: KkSurface.onSurface,
        ),
      ),
      bottom: bottom,
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

  void _openAllPayments() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const _AllPaymentsPage()),
    );
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

    return KkPullToRefresh(
      color: KkSurface.accent,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, KkSurface.navClearance),
        children: [
          Row(
            children: [
              Expanded(child: _Kpi('Today', _money(volume))),
              const SizedBox(width: 10),
              Expanded(child: _Kpi('Successful', '${success.length}')),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _Kpi('Waiting', '${waiting.length}')),
              const SizedBox(width: 10),
              Expanded(
                child: _Kpi(
                  'Forwarded',
                  '${_observer.state?.stats.forwarded ?? 0}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Kpi(
                  'Failed',
                  '${_observer.state?.stats.failed ?? 0}',
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _Panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (slot != null && slot['status'] == 'ACTIVE') ...[
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                '#${slot['orderId'] ?? '-'}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: _body(bold: true),
                              ),
                            ),
                            const SizedBox(width: 6),
                            _Pill(
                              'ACTIVE',
                              color: KkSurface.accent,
                              textColor: KkSurface.onPrimary,
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _money(slot['amountPaise']),
                          style: _body(bold: true),
                        ),
                      ] else
                        Text('No active slot', style: _muted()),
                      if (activeAccount != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          '${activeAccount['upiId'] ?? '-'}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: _muted(),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (waiting.isEmpty)
                        Text('No queue', style: _muted())
                      else
                        ...waiting.take(4).map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              children: [
                                Text(
                                  '#${item['queuePosition']}',
                                  style: _muted(),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    _money(item['amountPaise']),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: _body(bold: true),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(child: _SectionTitle('Recent payments')),
                    IconButton(
                      onPressed: _load,
                      tooltip: 'Refresh',
                      icon: const Icon(TablerIcons.refresh, size: 18),
                    ),
                    TextButton(
                      onPressed: _openAllPayments,
                      child: const Text('Show all'),
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

class _AllPaymentsPage extends StatefulWidget {
  const _AllPaymentsPage();

  @override
  State<_AllPaymentsPage> createState() => _AllPaymentsPageState();
}

class _AllPaymentsPageState extends State<_AllPaymentsPage> {
  List<Map<String, dynamic>> _payments = const [];
  String _search = '';
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
    final query = _search.trim().toLowerCase();
    final filtered = query.isEmpty
        ? _payments
        : _payments.where((p) {
            final haystack = [
              p['orderId'],
              p['status'],
              p['method'],
              p['verificationTag'],
              (p['verificationSources'] as List?)?.join(' '),
              _money(p['amountPaise']),
              p['amountPaise'],
              _date(p['createdAt']),
              p['completedAt'] != null ? _date(p['completedAt']) : null,
            ]
                .whereType<Object>()
                .map((value) => '$value'.toLowerCase())
                .join(' ');
            return haystack.contains(query);
          }).toList();

    return Scaffold(
      backgroundColor: KkSurface.bg,
      appBar: AppBar(
        backgroundColor: KkSurface.bg,
        surfaceTintColor: Colors.transparent,
        title: Text(
          'All payments',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: KkSurface.onSurface,
          ),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
            child: TextField(
              onChanged: (value) => setState(() => _search = value),
              decoration: InputDecoration(
                hintText: 'Search order, status, amount...',
                prefixIcon: const Icon(TablerIcons.search, size: 18),
                suffixIcon: _search.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () => setState(() => _search = ''),
                        tooltip: 'Clear search',
                        icon: const Icon(TablerIcons.x, size: 16),
                      ),
                isDense: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? _ErrorView(message: _error!, onRetry: _load)
                    : KkPullToRefresh(
                        color: KkSurface.accent,
                        onRefresh: _load,
                        child: ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          children: [
                            if (filtered.isEmpty)
                              _Panel(
                                child: Text(
                                  query.isEmpty
                                      ? 'No payments have been recorded.'
                                      : 'No payments match "$query".',
                                  style: _body(),
                                ),
                              )
                            else
                              ...filtered.map(
                                (payment) => Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: _Panel(child: _paymentTile(payment)),
                                ),
                              ),
                          ],
                        ),
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
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: KkSurface.onSurface,
                ),
              ),
            ),
            Text(
              _money(p['amountPaise']),
              style: TextStyle(
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

class _MembershipEditorSheet extends StatefulWidget {
  const _MembershipEditorSheet({required this.initialAmountMinor});

  final int initialAmountMinor;

  @override
  State<_MembershipEditorSheet> createState() =>
      _MembershipEditorSheetState();
}

class _MembershipEditorSheetState extends State<_MembershipEditorSheet> {
  late final TextEditingController _controller;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text: (widget.initialAmountMinor / 100).toStringAsFixed(0),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final value = double.tryParse(_controller.text.trim());
    if (value == null || value < 1) {
      _snack(context, 'Enter an amount of at least ₹1.');
      return;
    }
    setState(() => _saving = true);
    try {
      final token = await AuthService.validAccessToken('');
      if (token.isEmpty) {
        _snack(context, 'Your admin session has expired. Please log in again.');
        return;
      }
      final plan = await Api.updateMembershipAmount(
        token,
        (value * 100).round(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(plan);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.6,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
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
              const _SectionTitle('Membership price'),
              const SizedBox(height: 4),
              Text(
                'Amount per year. Applies to new memberships immediately.',
                style: _muted(),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _controller,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Amount per year (₹)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: const Icon(TablerIcons.check, size: 17),
                label: Text(_saving ? 'Saving...' : 'Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VpaManagerSheet extends StatefulWidget {
  const _VpaManagerSheet({required this.initialAccounts});

  final List<Map<String, dynamic>> initialAccounts;

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
    _accounts = widget.initialAccounts;
    _loading = _accounts.isEmpty;
    _load(quiet: _accounts.isNotEmpty);
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final data = await YoupiAdminApi.get('/admin/upi-accounts');
      if (!mounted) return;
      setState(() {
        _accounts =
            (data['accounts'] as List?)?.cast<Map<String, dynamic>>() ??
                const [];
        _error = null;
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
      await _load(quiet: true);
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _activate(Map<String, dynamic> account) async {
    try {
      await YoupiAdminApi.post(
        '/admin/upi-accounts/${account['id']}/activate',
      );
      await _load(quiet: true);
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _toggle(Map<String, dynamic> account) async {
    try {
      await YoupiAdminApi.post('/admin/upi-accounts/${account['id']}/toggle');
      await _load(quiet: true);
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
      await _load(quiet: true);
    } catch (e) {
      _snack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);

    final accounts = _accounts;

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

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.8,
        ),
        child: SingleChildScrollView(
          physics: const ClampingScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
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
              Text(
                'Only one VPA can be active at a time.',
                style: _muted(),
              ),
              const SizedBox(height: 14),
              if (accounts.isEmpty)
                _Panel(child: Text('No UPI accounts saved.', style: _body()))
              else
                ...accounts.map(card),
            ],
          ),
        ),
      ),
    );
  }
}

class _WhatsAppTemplate {
  const _WhatsAppTemplate({
    required this.key,
    required this.title,
    required this.icon,
    required this.hint,
    required this.helper,
  });

  final String key;
  final String title;
  final IconData icon;
  final String hint;
  final String helper;
}

const _whatsAppTemplates = <_WhatsAppTemplate>[
  _WhatsAppTemplate(
    key: 'otpMessage',
    title: 'Login message',
    icon: TablerIcons.key,
    hint:
        'Hello {name}! Your one-time login OTP is: *{otp}*\n\n'
        'Valid for 5 minutes.',
    helper: 'Placeholders: {otp} · {name} · {appName}',
  ),
  _WhatsAppTemplate(
    key: 'paymentMessage',
    title: 'Payment message',
    icon: TablerIcons.creditCard,
    hint:
        'Hi {name}, we received ₹{amount} for order {orderId}. Thank you!',
    helper: 'Placeholders: {name} · {amount} · {orderId} · {appName}',
  ),
  _WhatsAppTemplate(
    key: 'memberMessage',
    title: 'Membership message',
    icon: TablerIcons.usersGroup,
    hint:
        'Welcome {name}! Your {appName} membership is active. '
        'Amount paid: ₹{amount}.',
    helper: 'Placeholders: {name} · {amount} · {appName}',
  ),
  _WhatsAppTemplate(
    key: 'ticketMessage',
    title: 'Ticket message',
    icon: TablerIcons.ticket,
    hint:
        'Your {appName} tickets for {movie} are attached. '
        'Seats {seats}. Booking {reference}.',
    helper:
        'Placeholders: {name}/{customer_name} · {movie} · {theatre} · '
        '{seats} · {reference}/{booking_id} · {appName}',
  ),
];

class _WhatsAppMessagesPage extends StatefulWidget {
  const _WhatsAppMessagesPage();

  @override
  State<_WhatsAppMessagesPage> createState() => _WhatsAppMessagesPageState();
}

class _WhatsAppMessagesPageState extends State<_WhatsAppMessagesPage> {
  Map<String, dynamic> _branding = const <String, dynamic>{};
  String _waStatus = 'DISCONNECTED';
  String _phoneNumber = '';
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final results = await Future.wait([
        YoupiAdminApi.get('/admin/merchant-settings'),
        YoupiAdminApi.get('/admin/whatsapp/status'),
      ]);
      if (!mounted) return;
      final whatsapp = results[1];
      setState(() {
        _branding =
            (results[0]['branding'] as Map?)?.cast<String, dynamic>() ??
                const <String, dynamic>{};
        _waStatus = '${whatsapp['status'] ?? 'DISCONNECTED'}';
        _phoneNumber = '${whatsapp['phoneNumber'] ?? ''}'.trim();
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (quiet) {
        _snack(context, '$e');
        return;
      }
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  String _text(String key) => '${_branding[key] ?? ''}'.trim();

  Future<void> _edit(_WhatsAppTemplate template) async {
    final saved = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: KkSurface.container,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
        ),
        child: _WhatsAppMessageEditorSheet(
          brandingKey: template.key,
          title: template.title,
          hint: template.hint,
          helper: template.helper,
          initialText: _text(template.key),
        ),
      ),
    );
    if (saved == null || !mounted) return;
    setState(() => _branding = {..._branding, template.key: saved});
    _snack(context, '${template.title} saved.');
    await _load(quiet: true);
  }

  Future<void> _connect() async {
    try {
      await YoupiAdminApi.post('/admin/whatsapp/reconnect');
      await _load(quiet: true);
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _disconnect() async {
    final ok = await _confirm(
      context,
      'Disconnect WhatsApp?',
      'The OTP and ticket sending session will be wiped.',
    );
    if (!ok) return;
    try {
      await YoupiAdminApi.post('/admin/whatsapp/disconnect');
      await _load(quiet: true);
    } catch (e) {
      _snack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: KkSurface.bg,
      appBar: AppBar(
        backgroundColor: KkSurface.bg,
        surfaceTintColor: Colors.transparent,
        title: Text(
          'WhatsApp messages',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: KkSurface.onSurface,
          ),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  color: KkSurface.accent,
                  onRefresh: () => _load(quiet: true),
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                    children: [
                      if (_waStatus == 'CONNECTED') ...[
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                _phoneNumber.isEmpty
                                    ? 'Connected'
                                    : _phoneNumber,
                                style: _body(bold: true),
                              ),
                            ),
                            IconButton(
                              onPressed: _connect,
                              tooltip: 'Re-pair WhatsApp',
                              icon: const Icon(TablerIcons.refresh, size: 18),
                            ),
                            IconButton(
                              onPressed: _disconnect,
                              tooltip: 'Disconnect WhatsApp',
                              icon: const Icon(TablerIcons.linkOff, size: 18),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                      ] else ...[
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                'WhatsApp is not connected.',
                                style: _body(),
                              ),
                            ),
                            FilledButton.icon(
                              onPressed: _connect,
                              icon: const Icon(TablerIcons.link, size: 16),
                              label: const Text('Connect'),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                      ],
                      Text(
                        'Tap a message to edit it. Leave it blank to use the '
                        'built-in text.',
                        style: _muted(),
                      ),
                      const SizedBox(height: 14),
                      ..._whatsAppTemplates.map(
                        (template) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Material(
                            color: KkSurface.containerHigh,
                            borderRadius: BorderRadius.circular(12),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(12),
                              onTap: () => _edit(template),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 14,
                                ),
                                child: Row(
                                  children: [
                                    Icon(template.icon, size: 18),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        template.title,
                                        textAlign: TextAlign.start,
                                      ),
                                    ),
                                    _Pill(
                                      _text(template.key).isEmpty
                                          ? 'NOT SET'
                                          : 'SET',
                                      color: _text(template.key).isEmpty
                                          ? KkSurface.outline
                                          : KkSurface.accent,
                                      textColor: _text(template.key).isEmpty
                                          ? KkSurface.onSurface
                                          : KkSurface.onPrimary,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _WhatsAppMessageEditorSheet extends StatefulWidget {
  const _WhatsAppMessageEditorSheet({
    required this.brandingKey,
    required this.title,
    required this.hint,
    required this.helper,
    required this.initialText,
  });

  final String brandingKey;
  final String title;
  final String hint;
  final String helper;
  final String initialText;

  @override
  State<_WhatsAppMessageEditorSheet> createState() =>
      _WhatsAppMessageEditorSheetState();
}

class _WhatsAppMessageEditorSheetState
    extends State<_WhatsAppMessageEditorSheet> {
  late final TextEditingController _controller;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialText);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await YoupiAdminApi.post('/admin/merchant-settings', {
        'branding': {
          widget.brandingKey: _controller.text.trim(),
        },
      });
      if (!mounted) return;
      Navigator.of(context).pop(_controller.text.trim());
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.7,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
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
              _SectionTitle(widget.title),
              const SizedBox(height: 4),
              Text(
                'Leave blank to use the built-in message. '
                'Changes apply to the next message sent.',
                style: _muted(),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _controller,
                minLines: 6,
                maxLines: 12,
                autofocus: true,
                style: const TextStyle(fontSize: 13, height: 1.35),
                decoration: InputDecoration(
                  hintText: widget.hint,
                  helperText: widget.helper,
                  helperMaxLines: 3,
                  alignLabelWithHint: true,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: const Icon(TablerIcons.check, size: 17),
                label: Text(_saving ? 'Saving...' : 'Save'),
              ),
            ],
          ),
        ),
      ),
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
          'Could not load the pairing token. Check the admin app build '
          'and the network connection.';
      setState(() => _pairError = '$hint $e');
      _snack(context, hint);
      return;
    }

    var token = pairing['token'] ?? '';
    var gateway = pairing['gateway'] ?? '';
    if (token.isEmpty || gateway.isEmpty) {
      const message =
          'Pairing token is unavailable. Make sure this is the official '
          'admin build, then try again.';
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

class _GatewayTab extends StatefulWidget {
  const _GatewayTab();

  @override
  State<_GatewayTab> createState() => _GatewayTabState();
}

class _GatewayTabState extends State<_GatewayTab> {
  Map<String, dynamic>? _whatsapp;
  List<Map<String, dynamic>> _vpaAccounts = const [];
  String _activeVpa = '';
  int _membershipAmountMinor = 120000;
  String _membershipLabel = 'Annual membership';
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

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
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

      int membershipAmount = _membershipAmountMinor;
      String membershipLabel = _membershipLabel;
      try {
        final movieToken = await AuthService.validAccessToken('');
        if (movieToken.isNotEmpty) {
          final plan = await Api.getMembershipSettings(movieToken);
          membershipAmount =
              (plan['amountMinor'] as num?)?.toInt() ?? membershipAmount;
          membershipLabel = (plan['label'] ?? membershipLabel).toString();
        }
      } catch (_) {
        // Keep the gateway settings usable even when the movie session is offline.
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
        _whatsapp = whatsapp;
        _vpaAccounts = accounts;
        _membershipAmountMinor = membershipAmount;
        _membershipLabel = membershipLabel;
        _activeVpa = '${activeAccount?['upiId'] ?? results[0]['upiId'] ?? ''}';
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (quiet) {
        // Keep the current contents visible; only report the refresh failure.
        _snack(context, '$e');
        return;
      }
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
    if (mounted) await _load(quiet: true);
  }

  Future<void> _openVpaManager() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: KkSurface.container,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _VpaManagerSheet(initialAccounts: _vpaAccounts),
    );
    if (mounted) await _load(quiet: true);
  }

  Future<void> _openWhatsAppMessages() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const _WhatsAppMessagesPage()),
    );
    if (mounted) await _load(quiet: true);
  }

  Future<void> _editMembership() async {
    final plan = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: KkSurface.container,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
        ),
        child: _MembershipEditorSheet(
          initialAmountMinor: _membershipAmountMinor,
        ),
      ),
    );
    if (plan == null || !mounted) return;
    setState(() {
      _membershipAmountMinor =
          (plan['amountMinor'] as num?)?.toInt() ?? _membershipAmountMinor;
      _membershipLabel = (plan['label'] ?? _membershipLabel).toString();
    });
    _snack(context, 'Membership price updated.');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);
    final whatsapp = _whatsapp ?? const {};
    final waStatus = '${whatsapp['status'] ?? 'DISCONNECTED'}';
    final waPhone = '${whatsapp['phoneNumber'] ?? ''}'.trim();
    final waQr = whatsapp['qrCode']?.toString();

    return KkPullToRefresh(
      color: KkSurface.accent,
      onRefresh: () => _load(quiet: true),
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
                      if (waStatus == 'CONNECTED' && waPhone.isNotEmpty)
                        _Pill(
                          waPhone,
                          color: KkSurface.accent,
                          textColor: KkSurface.onPrimary,
                        )
                      else
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
                if (waStatus != 'CONNECTED')
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
              child: Row(
                children: [
                  const _SectionTitle('Store'),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _activeVpa.trim().isEmpty ? '-' : _activeVpa,
                      textAlign: TextAlign.right,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        fontFamily: 'monospace',
                        color: KkSurface.onSurface,
                      ),
                    ),
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
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: _editMembership,
            child: _Panel(
              child: Row(
                children: [
                  const _SectionTitle('Membership'),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '₹${(_membershipAmountMinor / 100).toStringAsFixed(0)}/year',
                      textAlign: TextAlign.right,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        fontFamily: 'monospace',
                        color: KkSurface.onSurface,
                      ),
                    ),
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
      style: TextStyle(
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
            style: TextStyle(
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
        style: TextStyle(
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
    TextStyle(
      fontSize: size,
      height: 1.4,
      fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
      color: KkSurface.onSurface,
    );

TextStyle _muted({double size = 11}) => TextStyle(
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
