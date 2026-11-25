import 'package:flutter/material.dart';

import '../services/api.dart';
import '../widgets/app_toast.dart';
import '../widgets/kk_pull_to_refresh.dart';
import 'scanner_shell.dart' show KkSurface;
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// Cancellation requests raised from the website and the manual UPI refund queue.
///
/// Refunds are paid outside the gateway: staff send the money, then record the UTR
/// here so the customer's pass shows the payout.
class RefundsScreen extends StatefulWidget {
  const RefundsScreen({super.key, required this.token});

  final String? token;

  @override
  State<RefundsScreen> createState() => _RefundsScreenState();
}

class _RefundsScreenState extends State<RefundsScreen> {
  int _tab = 0;
  List<dynamic> _requests = const [];
  List<dynamic> _refunds = const [];
  bool _loading = true;
  bool _busy = false;
  String? _error;

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
        Api.getCancellationRequests(token),
        Api.getRefunds(token),
      ]);
      if (!mounted) return;
      setState(() {
        _requests = results[0];
        _refunds = results[1];
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

  int get _pendingRequests =>
      _requests.where((r) => r is Map && r['status'] == 'pending').length;

  int get _openPayouts => _refunds
      .where((r) => r is Map && (r['status'] == 'pending' || r['status'] == 'processing'))
      .length;

  String _money(dynamic minor) => '₹${(((minor as num?)?.toInt() ?? 0) / 100).toStringAsFixed(2)}';

  String _date(dynamic raw) {
    final date = raw == null ? null : DateTime.tryParse(raw.toString())?.toLocal();
    if (date == null) return 'Date TBA';
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year} · '
        '${TimeOfDay.fromDateTime(date).format(context)}';
  }

  Color _statusColor(String value) {
    switch (value.toLowerCase()) {
      case 'approved':
      case 'completed':
        return const Color(0xFF7FCF9A);
      case 'pending':
      case 'processing':
        return const Color(0xFFE0BA58);
      case 'rejected':
      case 'failed':
        return KkSurface.error;
      default:
        return KkSurface.onSurfaceVariant;
    }
  }

  Future<void> _guard(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        AppToast.show(
          context,
          e.toString().replaceFirst('Exception: ', ''),
          type: AppToastType.error,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _approve(dynamic request) async {
    final paidMinor = (request['captured_minor'] as num?)?.toInt()
        ?? (request['paid_minor'] as num?)?.toInt()
        ?? 0;
    final refundController = TextEditingController(
      text: (((request['refund_minor'] as num?)?.toInt() ?? 0) / 100).toStringAsFixed(2),
    );
    final noteController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: KkSurface.container,
        title: const Text('Approve cancellation'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Customer paid ${_money(paidMinor)}. The amount below is refunded to their UPI account.',
                style: const TextStyle(fontSize: 12, color: KkSurface.onSurfaceVariant, height: 1.5),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: refundController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Refund amount (₹)',
                  helperText: 'Edit only to override the policy estimate.',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: noteController,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Internal note (optional)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Approve & cancel')),
        ],
      ),
    );

    if (confirmed != true) return;
    final rupees = double.tryParse(refundController.text.trim());
    if (rupees == null || rupees < 0) {
      if (mounted) AppToast.show(context, 'Enter a valid refund amount.', type: AppToastType.error);
      return;
    }

    await _guard(() async {
      await Api.approveCancellationRequest(
        widget.token!,
        request['id'].toString(),
        refundMinor: (rupees * 100).round(),
        note: noteController.text,
      );
      await _load();
      if (mounted) {
        AppToast.show(context, 'Booking cancelled. Refund added to the payout queue.', type: AppToastType.success);
      }
    });
  }

  Future<void> _reject(dynamic request) async {
    final noteController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: KkSurface.container,
        title: const Text('Reject request'),
        content: TextField(
          controller: noteController,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Reason for the customer (optional)',
            helperText: 'The tickets stay valid.',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Reject')),
        ],
      ),
    );
    if (confirmed != true) return;

    await _guard(() async {
      await Api.rejectCancellationRequest(
        widget.token!,
        request['id'].toString(),
        note: noteController.text,
      );
      await _load();
      if (mounted) AppToast.show(context, 'Request rejected. Tickets remain valid.', type: AppToastType.success);
    });
  }

  Future<void> _markProcessing(dynamic refund) async {
    await _guard(() async {
      await Api.updateRefund(widget.token!, refund['id'].toString(), status: 'processing');
      await _load();
      if (mounted) AppToast.show(context, 'Refund marked as processing.', type: AppToastType.success);
    });
  }

  Future<void> _markPaid(dynamic refund) async {
    final utrController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: KkSurface.container,
        title: Text('Mark ${_money(refund['amount_minor'])} as paid'),
        content: TextField(
          controller: utrController,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'UPI UTR / reference',
            helperText: 'Paste the bank reference shown after the transfer.',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Mark paid')),
        ],
      ),
    );
    if (confirmed != true) return;
    final utr = utrController.text.trim();
    if (utr.length < 6) {
      if (mounted) AppToast.show(context, 'Enter the UTR from the transfer.', type: AppToastType.error);
      return;
    }

    await _guard(() async {
      await Api.updateRefund(widget.token!, refund['id'].toString(), status: 'completed', utr: utr);
      await _load();
      if (mounted) AppToast.show(context, 'Refund completed and the customer notified.', type: AppToastType.success);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: KkSurface.bg,
      appBar: AppBar(
        title: const Text('Cancellations & refunds'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _busy ? null : _load,
            icon: const Icon(TablerIcons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: KkSurface.accent))
          : Column(
              children: [
                _tabSelector(),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Text(_error!, style: const TextStyle(color: KkSurface.error, fontSize: 12)),
                  ),
                Expanded(
                  child: _tab == 0 ? _requestsList() : _refundsList(),
                ),
              ],
            ),
    );
  }

  Widget _tabSelector() {
    Widget tab(String label, int index, int badge) {
      final active = _tab == index;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() => _tab = index),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: active ? KkSurface.accent : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                    color: active ? KkSurface.onPrimary : KkSurface.onSurfaceVariant,
                  ),
                ),
                if (badge > 0) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: active ? KkSurface.onPrimary.withValues(alpha: 0.14) : KkSurface.containerHigh,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '$badge',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: active ? KkSurface.onPrimary : KkSurface.onSurface,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: KkSurface.container,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: KkSurface.border),
      ),
      child: Row(
        children: [
          tab('REQUESTS', 0, _pendingRequests),
          tab('PAYOUTS', 1, _openPayouts),
        ],
      ),
    );
  }

  Widget _requestsList() {
    if (_requests.isEmpty) {
      return _empty(
        icon: TablerIcons.calendarX,
        title: 'No cancellation requests',
        body: 'Requests raised from My tickets on the website appear here.',
      );
    }
    return KkPullToRefresh(
      color: KkSurface.accent,
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, KkSurface.navClearance),
        itemCount: _requests.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) => _requestCard(_requests[index]),
      ),
    );
  }

  Widget _requestCard(dynamic request) {
    final status = (request['status'] ?? 'pending').toString();
    final percent = (request['policy_percent'] as num?)?.toInt() ?? 0;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: KkSurface.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  (request['booking_reference'] ?? 'Booking').toString(),
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: KkSurface.onSurface),
                ),
              ),
              _chip(status, _statusColor(status)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${request['title'] ?? 'Movie'} · ${_date(request['starts_at'])}',
            style: const TextStyle(fontSize: 11.5, color: KkSurface.onSurfaceVariant, height: 1.5),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _metric('PAID', _money(request['captured_minor'] ?? request['paid_minor']))),
              Expanded(child: _metric('REQUESTED REFUND', '${_money(request['refund_minor'])} · $percent%')),
            ],
          ),
          if ((request['reason'] ?? '').toString().trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '“${request['reason']}”',
              style: const TextStyle(fontSize: 11.5, color: KkSurface.onSurfaceVariant, fontStyle: FontStyle.italic),
            ),
          ],
          if ((request['contact_mobile'] ?? '').toString().isNotEmpty
              || (request['contact_email'] ?? '').toString().isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              [request['contact_mobile'], request['contact_email']]
                  .where((value) => value != null && value.toString().trim().isNotEmpty)
                  .join(' · '),
              style: const TextStyle(fontSize: 10.5, color: KkSurface.onSurfaceVariant),
            ),
          ],
          if ((request['review_note'] ?? '').toString().trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'Note: ${request['review_note']}',
              style: const TextStyle(fontSize: 10.5, color: KkSurface.onSurfaceVariant),
            ),
          ],
          if (status == 'pending') ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy ? null : () => _reject(request),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: KkSurface.onSurface,
                      side: const BorderSide(color: KkSurface.outlineVariant),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                    child: const Text('Reject', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _busy ? null : () => _approve(request),
                    style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 10)),
                    child: const Text('Approve', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _refundsList() {
    if (_refunds.isEmpty) {
      return _empty(
        icon: TablerIcons.cash,
        title: 'No refunds yet',
        body: 'Approved cancellations and failed payments appear here for payout.',
      );
    }
    return KkPullToRefresh(
      color: KkSurface.accent,
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, KkSurface.navClearance),
        itemCount: _refunds.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) => _refundCard(_refunds[index]),
      ),
    );
  }

  Widget _refundCard(dynamic refund) {
    final status = (refund['status'] ?? 'pending').toString();
    final completed = status == 'completed';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KkSurface.containerLow,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: KkSurface.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _money(refund['amount_minor']),
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: KkSurface.onSurface),
                ),
              ),
              _chip(status, _statusColor(status)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${refund['booking_reference'] ?? 'Booking'} · ${refund['title'] ?? 'Movie'}',
            style: const TextStyle(fontSize: 11.5, color: KkSurface.onSurfaceVariant, height: 1.5),
          ),
          if ((refund['contact_mobile'] ?? '').toString().isNotEmpty
              || (refund['contact_email'] ?? '').toString().isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              [refund['contact_mobile'], refund['contact_email']]
                  .where((value) => value != null && value.toString().trim().isNotEmpty)
                  .join(' · '),
              style: const TextStyle(fontSize: 10.5, color: KkSurface.onSurfaceVariant),
            ),
          ],
          if ((refund['reason'] ?? '').toString().trim().isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              refund['reason'].toString(),
              style: const TextStyle(fontSize: 10.5, color: KkSurface.onSurfaceVariant),
            ),
          ],
          if (completed && (refund['utr'] ?? '').toString().isNotEmpty) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(TablerIcons.check, size: 14, color: Color(0xFF7FCF9A)),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    'UTR ${refund['utr']}',
                    style: const TextStyle(fontSize: 10.5, color: Color(0xFF7FCF9A), fontFamily: 'monospace'),
                  ),
                ),
              ],
            ),
          ],
          if (!completed) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                if (status == 'pending') ...[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : () => _markProcessing(refund),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: KkSurface.onSurface,
                        side: const BorderSide(color: KkSurface.outlineVariant),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                      child: const Text('Processing', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _busy ? null : () => _markPaid(refund),
                    style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 10)),
                    icon: const Icon(TablerIcons.send, size: 15),
                    label: const Text('Mark paid', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _metric(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 8.5, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: KkSurface.onSurfaceVariant),
        ),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: KkSurface.onSurface)),
      ],
    );
  }

  Widget _chip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800, letterSpacing: 0.7, color: color),
      ),
    );
  }

  Widget _empty({required IconData icon, required String title, required String body}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: KkSurface.containerHigh,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(icon, color: KkSurface.accent, size: 24),
            ),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: KkSurface.onSurface),
            ),
            const SizedBox(height: 6),
            Text(
              body,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: KkSurface.onSurfaceVariant, height: 1.6),
            ),
          ],
        ),
      ),
    );
  }
}
