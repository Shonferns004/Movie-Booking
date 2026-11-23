import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../theme/app_theme.dart';

/// Scans the pairing QR from the merchant admin panel and returns the raw JSON.
class PairQrScanScreen extends StatefulWidget {
  const PairQrScanScreen({super.key});

  @override
  State<PairQrScanScreen> createState() => _PairQrScanScreenState();
}

class _PairQrScanScreenState extends State<PairQrScanScreen> {
  bool _handled = false;
  bool _torchOn = false;
  final MobileScannerController _controller = MobileScannerController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled || capture.barcodes.isEmpty) return;
    final code = capture.barcodes.first.rawValue;
    if (code == null || code.trim().isEmpty) return;
    _handled = true;
    Navigator.of(context).pop(code.trim());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF05070D),
      appBar: AppBar(
        title: const Text('Scan pairing QR'),
        actions: [
          IconButton(
            tooltip: 'Torch',
            onPressed: () {
              _controller.toggleTorch();
              setState(() => _torchOn = !_torchOn);
            },
            icon: Icon(
              _torchOn ? Icons.flash_on_rounded : Icons.flash_off_rounded,
            ),
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
          ),
          IgnorePointer(
            child: Center(
              child: Container(
                width: 260,
                height: 260,
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.accent2, width: 2),
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              width: double.infinity,
              color: Colors.black.withValues(alpha: 0.72),
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Text(
                'Point the camera at the pairing QR in Admin → Store Settings → Android SMS Hub.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.white,
                      height: 1.45,
                    ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
