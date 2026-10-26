import 'package:flutter/material.dart';
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
      appBar: AppBar(title: const Text('Collection')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text('Total collection: ₹${_total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: _bookings.length,
              itemBuilder: (ctx, i) {
                final b = _bookings[i];
                return Card(
                  child: ListTile(
                    title: Text('Booking ${b['id']?.toString().substring(0, 8) ?? ''}'),
                    subtitle: Text('Status: ${b['status']} • ₹${((b['total_minor'] ?? 0) as num) / 100.0}'),
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