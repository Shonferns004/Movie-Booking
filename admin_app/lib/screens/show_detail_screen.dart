import 'package:flutter/material.dart';
import '../services/api.dart';

class ShowDetailScreen extends StatefulWidget {
  final String showId;
  final String? token;
  const ShowDetailScreen({super.key, required this.showId, this.token});

  @override
  State<ShowDetailScreen> createState() => _ShowDetailScreenState();
}

class _ShowDetailScreenState extends State<ShowDetailScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<dynamic> _seats = [];
  List<dynamic> _bookings = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await Api.getShowSeats(widget.token!, widget.showId);
      setState(() => _seats = data['seats'] ?? []);
    } catch (e) {
      setState(() => _error = 'Seats: $e');
    }
    try {
      final all = await Api.getBookings(widget.token!);
      setState(() => _bookings = all.where((b) => b['show_id'] == widget.showId).toList());
    } catch (e) {
      // bookings may be forbidden for non-admin; ignore
    }
    setState(() => _loading = false);
  }

  Future<void> _delete() async {
    try {
      await Api.deleteShow(widget.token!, widget.showId);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Show ${widget.showId.length >= 8 ? widget.showId.substring(0, 8) : widget.showId}'),
        actions: [
          IconButton(icon: const Icon(Icons.delete, color: Colors.red), onPressed: _delete),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
        bottom: TabBar(controller: _tabs, tabs: const [Tab(text: 'Seats'), Tab(text: 'Collection'), Tab(text: 'Tickets')]),
      ),
      body: TabBarView(controller: _tabs, children: [
        // Seats
        _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : _seats.isEmpty
                    ? const Center(child: Text('No seats'))
                    : SingleChildScrollView(
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: _buildSeats(),
                            ),
                          ),
                        ),
                      ),
        // Collection
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text('Booked seats: ${_seats.where((x) => x['status'] == 'booked').length}', style: const TextStyle(fontSize: 16)),
              const SizedBox(height: 8),
              Text('Revenue: ${_seats.where((x) => x['status'] == 'booked').fold<int>(0, (a, x) => a + ((x['price_minor'] ?? 0) as int)) / 100}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
        // Tickets
        ListView.builder(
          itemCount: _bookings.length,
          itemBuilder: (ctx, i) {
            final b = _bookings[i];
            return ListTile(
              title: Text('${b['booking_reference']}'),
              subtitle: Text('${b['status']} • ${b['total_minor']}'),
            );
          },
        ),
      ]),
    );
  }

  List<Widget> _buildSeats() {
    if (_seats.isEmpty) return [const Text('No seats')];
    final xs = _seats.map((s) => int.parse(s['x'].toString())).toList();
    final minX = xs.reduce((a, b) => a < b ? a : b);
    final maxX = xs.reduce((a, b) => a > b ? a : b);
    final cols = maxX - minX + 1;
    final rowLabels = _seats.map((s) => s['row_label'] as String).toSet().toList();
    rowLabels.sort();
    final widgets = <Widget>[];
    for (final row in rowLabels) {
      final cells = List<dynamic>.filled(cols, null);
      for (final s in _seats) {
        if (s['row_label'] == row) {
          cells[int.parse(s['x'].toString()) - minX] = s;
        }
      }
      widgets.add(Row(
        children: [
          SizedBox(width: 28, child: Text(row, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white))),
          ...cells.map((s) {
            if (s == null) return Container(width: 24, height: 24, margin: const EdgeInsets.all(1), decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(3)));
            final status = s['status'] ?? 'available';
            Color color = Colors.grey;
            if (status == 'available') {
              try { color = Color(int.parse('0xFF${(s['fill_color'] ?? '#999999').replaceAll('#', '')}')); } catch (_) {}
            }
            if (status == 'held') color = Colors.orange;
            if (status == 'booked') color = Colors.red;
            return Container(
              width: 24,
              height: 24,
              margin: const EdgeInsets.all(1),
              alignment: Alignment.center,
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)),
              child: Text('${s['seat_number']}', style: const TextStyle(fontSize: 8, color: Colors.white)),
            );
          }),
        ],
      ));
    }
    return widgets;
  }
}
