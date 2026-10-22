import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/api.dart';

/// Camera opens only when this screen is pushed from the home card.
class ScannerScreen extends StatefulWidget {
  final String? showId;
  final String? token;
  final ValueChanged<String> onValidated;

  const ScannerScreen({super.key, this.showId, this.token, required this.onValidated});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  bool _processing = false;
  bool _scanning = true;
  String? _result;

  Future<void> _handle(String code) async {
    if (_processing || widget.token == null) return;
    setState(() => _processing = true);
    try {
      final res = await Api.validateTicket(widget.token!, code, showId: widget.showId);
      final result = res['result'] ?? 'UNKNOWN';
      if (result == 'VALID') widget.onValidated(result);
      setState(() => _result = '$result ${res['reason'] ?? ''}'.trim());
    } catch (e) {
      setState(() => _result = 'ERROR: $e');
    } finally {
      await Future.delayed(const Duration(seconds: 2));
      if (mounted) setState(() => _processing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan Ticket')),
      body: Column(
        children: [
          Expanded(
            child: MobileScanner(
              onDetect: (capture) {
                if (!_scanning) return;
                final barcodes = capture.barcodes;
                if (barcodes.isNotEmpty) {
                  final code = barcodes.first.rawValue;
                  if (code != null) _handle(code);
                }
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ElevatedButton.icon(
                  onPressed: () => setState(() => _scanning = !_scanning),
                  icon: Icon(_scanning ? Icons.stop : Icons.qr_code_scanner),
                  label: Text(_scanning ? 'Stop Scan' : 'Start Scan'),
                ),
                const SizedBox(width: 12),
                OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Close'),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(16),
            color: Colors.black87,
            width: double.infinity,
            child: Text(_result ?? 'Point the camera at a ticket QR', style: const TextStyle(color: Colors.white, fontSize: 18), textAlign: TextAlign.center),
          ),
        ],
      ),
    );
  }
}
