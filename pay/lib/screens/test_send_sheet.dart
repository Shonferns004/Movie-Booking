import 'package:flutter/material.dart';

import '../services/gateway_bridge.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_card.dart';
import '../widgets/status_pill.dart';
import '../utils/format.dart';

const _sampleSms =
    'Rs.20.00 credited to a/c XX4412 on 22-10-26 by UPI ref 412345678901. '
    'Bal: 1,240.50 -HDFC Bank';

Future<void> showTestSendSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF0E1424),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => const _TestSendSheet(),
  );
}

class _TestSendSheet extends StatefulWidget {
  const _TestSendSheet();

  @override
  State<_TestSendSheet> createState() => _TestSendSheetState();
}

class _TestSendSheetState extends State<_TestSendSheet> {
  final _sender = TextEditingController(text: 'HDFCBK');
  final _body = TextEditingController(text: _sampleSms);

  Map<String, dynamic>? _preview;
  TestSendResult? _result;
  bool _parsing = false;
  bool _sending = false;
  bool _previewLoaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _parse());
  }

  @override
  void dispose() {
    _sender.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _parse() async {
    final state = AppScope.of(context);
    setState(() {
      _parsing = true;
      _result = null;
    });
    final preview = await state.parsePreview(_body.text);
    if (!mounted) return;
    setState(() {
      _preview = preview;
      _parsing = false;
      _previewLoaded = true;
    });
  }

  Future<void> _send() async {
    final state = AppScope.of(context);
    setState(() {
      _sending = true;
      _result = null;
    });
    final result = await state.sendTest(
      text: _body.text,
      sender: _sender.text.trim().isEmpty ? 'TEST' : _sender.text.trim(),
    );
    if (!mounted) return;
    setState(() {
      _result = result;
      _sending = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;
    final reference = _preview?['reference'] as String?;
    final hasTwelveDigitRef = reference != null && reference.length == 12;

    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.86,
        maxChildSize: 0.95,
        minChildSize: 0.5,
        builder: (context, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(22, 10, 22, 28),
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
                    'Test observation',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
                const StatusPill(label: 'Dry run', tone: PillTone.info),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Runs the same parser the receiver uses, then posts to the gateway '
              'with the credentials saved on this device.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 18),
            Text('SENDER', style: Theme.of(context).textTheme.labelSmall),
            const SizedBox(height: 6),
            TextField(
              controller: _sender,
              autocorrect: false,
              style: const TextStyle(fontSize: 13, fontFamily: 'monospace'),
              decoration: const InputDecoration(hintText: 'HDFCBK'),
            ),
            const SizedBox(height: 16),
            Text('MESSAGE', style: Theme.of(context).textTheme.labelSmall),
            const SizedBox(height: 6),
            TextField(
              controller: _body,
              minLines: 4,
              maxLines: 8,
              style: const TextStyle(fontSize: 12.5, height: 1.5),
              onChanged: (_) {
                if (_previewLoaded) {
                  setState(() => _previewLoaded = false);
                }
              },
              decoration: const InputDecoration(
                hintText: 'Paste a bank credit SMS',
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _parsing ? null : _parse,
                    icon: _parsing
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 1.8,
                              color: AppColors.accent2,
                            ),
                          )
                        : const Icon(Icons.rule_rounded, size: 17),
                    label: Text(_parsing ? 'Parsing…' : 'Parse locally'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 1.8,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send_rounded, size: 17),
                    label: Text(_sending ? 'Sending…' : 'Send'),
                  ),
                ),
              ],
            ),
            if (_previewLoaded) ...[
              const SizedBox(height: 20),
              Text('PARSER OUTPUT', style: Theme.of(context).textTheme.labelSmall),
              const SizedBox(height: 8),
              if (_preview == null)
                AppCard(
                  borderColor: AppColors.warning.withValues(alpha: 0.45),
                  child: Row(
                    children: [
                      const Icon(Icons.block_rounded,
                          size: 18, color: AppColors.warning),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'This message does not look like a credit. The receiver '
                          'would skip it without contacting the gateway.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                    ],
                  ),
                )
              else
                AppCard(
                  padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
                  child: Column(
                    children: [
                      DetailRow(
                        label: 'Amount',
                        value: renderAmount(
                          _preview!['amount'] as String?,
                          (_preview!['amountPaise'] as num?)?.toInt(),
                        ),
                      ),
                      DetailRow(
                        label: 'Reference',
                        value: reference ?? 'Not found',
                        monospace: true,
                        valueColor: hasTwelveDigitRef
                            ? AppColors.accent2
                            : AppColors.warning,
                      ),
                      DetailRow(
                        label: 'Payer VPA',
                        value: (_preview!['senderVpa'] as String?) ?? '—',
                        monospace: true,
                      ),
                      if (!hasTwelveDigitRef)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                            'The pipeline needs an exactly 12-digit UTR/RRN. A shorter '
                            'reference will be rejected as MISSING_12_DIGIT_REFERENCE.',
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(fontSize: 11, color: AppColors.warning),
                          ),
                        ),
                    ],
                  ),
                ),
            ],
            if (_result != null) ...[
              const SizedBox(height: 20),
              Text('GATEWAY RESPONSE',
                  style: Theme.of(context).textTheme.labelSmall),
              const SizedBox(height: 8),
              AppCard(
                borderColor: (_result!.ok ? AppColors.success : AppColors.danger)
                    .withValues(alpha: 0.45),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          _result!.ok
                              ? Icons.check_circle_rounded
                              : Icons.error_rounded,
                          size: 18,
                          color: _result!.ok
                              ? AppColors.success
                              : AppColors.danger,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _result!.httpStatus == 0
                              ? 'Not sent'
                              : 'HTTP ${_result!.httpStatus}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppColors.text,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _result!.message.isEmpty
                          ? 'No response body'
                          : _result!.message,
                      style: const TextStyle(
                        fontSize: 12.5,
                        height: 1.45,
                        color: AppColors.muted,
                      ),
                    ),
                    if (!_result!.ok) ...[
                      const SizedBox(height: 8),
                      Text(
                        'A rejection still proves the endpoint and credentials work — read '
                        'the reason above against the live checkout amount.',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(fontSize: 11),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
