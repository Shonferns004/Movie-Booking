import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api.dart';

class CollectionScreen extends StatefulWidget {
  const CollectionScreen({super.key});

  @override
  State<CollectionScreen> createState() => _CollectionScreenState();
}

class _CollectionScreenState extends State<CollectionScreen> {
  String? _token;
  List<dynamic> _bookings = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('token');
    if (_token == null) return;
    try {
      final b = await Api.getBookings(_token!);
      setState(() { _bookings = b; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  double get _total => _bookings.fold(0.0, (sum, b) => sum + ((b['total_minor'] ?? 0) as num) / 100.0);

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return Scaffold(
      backgroundColor: const Color(0xFF121214),
      appBar: AppBar(title: const Text('BOX OFFICE', style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFF5EFEB)))),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            color: const Color(0xFF1A1A1E),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('TOTAL COLLECTION', style: TextStyle(fontSize: 10, color: Color(0xFF9E9890), fontWeight: FontWeight.w600, letterSpacing: 1.2)),
              const SizedBox(height: 4),
              Text('₹${_total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Color(0xFFF5EFEB))),
            ]),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _bookings.length,
              itemBuilder: (ctx, i) {
                final b = _bookings[i];
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFF1A1A1E), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFF2F2F37))),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Booking ${b['id']?.toString().substring(0, 8) ?? ''}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFF5EFEB))),
                      Text('₹${((b['total_minor'] ?? 0) as num) / 100.0}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFFD96B43))),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}