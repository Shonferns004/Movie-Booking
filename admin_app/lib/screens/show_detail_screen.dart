import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api.dart';

class ShowDetailScreen extends StatefulWidget {
  final String showId;
  final String? token;
  const ShowDetailScreen({super.key, required this.showId, this.token});

  @override
  State<ShowDetailScreen> createState() => _ShowDetailScreenState();
}

class _ShowDetailScreenState extends State<ShowDetailScreen> with SingleTickerProviderStateMixin {
  @override
  void dispose() {
    _transformController.dispose();
    super.dispose();
  }
  late TabController _tabs;
  List<dynamic> _seats = [];
  List<dynamic> _bookings = [];
  final TransformationController _transformController = TransformationController();
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
      backgroundColor: const Color(0xFF121214),
      appBar: AppBar(
        title: Text('SHOW ${widget.showId.length >= 8 ? widget.showId.substring(0, 8).toUpperCase() : widget.showId.toUpperCase()}', style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFF5EFEB))),
        actions: [
          IconButton(icon: const Icon(Icons.delete, color: Color(0xFFD96B43)), onPressed: _delete),
          IconButton(icon: const Icon(Icons.refresh, color: Color(0xFFF5EFEB)), onPressed: _load),
        ],
        bottom: TabBar(controller: _tabs, labelColor: const Color(0xFFF5EFEB), unselectedLabelColor: const Color(0xFF9E9890), indicatorColor: const Color(0xFFD96B43), tabs: const [Tab(text: 'Seats'), Tab(text: 'Collection'), Tab(text: 'Tickets')]),
      ),
      body: SafeArea(child: TabBarView(controller: _tabs, children: [
        // Seats
        _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : _seats.isEmpty
                    ? const Center(child: Text('No seats'))
                    : Column(
                        children: [
                          // screen indicator
                          Padding(
                            padding: const EdgeInsets.only(top: 8, bottom: 4),
                            child: Column(children: [
                              Container(width: 160, height: 2, color: const Color(0xFF71717A)),
                              const SizedBox(height: 4),
                              const Text('CINEMA SCREEN THIS WAY', style: TextStyle(fontSize: 9, letterSpacing: 1.5, color: Color(0xFF71717A), fontWeight: FontWeight.w600)),
                            ]),
                          ),
                          Expanded(
                            child: Stack(
                              children: [
                                InteractiveViewer(
                                  transformationController: _transformController,
                                  minScale: 0.8,
                                  maxScale: 4.0,
                                  boundaryMargin: const EdgeInsets.all(40),
                                  constrained: false,
                                  panEnabled: true,
                                  scaleEnabled: true,
                                  clipBehavior: Clip.hardEdge,
                                  alignment: Alignment.topLeft,
                                  child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: _buildSeats(),
                                    ),
                                  ),
                                ),
                                Positioned(
                                  right: 8, top: 8,
                                  child: Container(
                                    decoration: BoxDecoration(color: const Color(0xFF1b1b1d).withOpacity(0.9), border: Border.all(color: const Color(0xFF2a2a2e)), borderRadius: BorderRadius.circular(8)),
                                    child: Column(children: [
                                      IconButton(icon: const Icon(Icons.add, size: 16, color: Color(0xFFA1A1AA)), onPressed: () => _zoomBy(1.2)),
                                      Container(width: 32, height: 1, color: const Color(0xFF2a2a2e)),
                                      IconButton(icon: const Icon(Icons.remove, size: 16, color: Color(0xFFA1A1AA)), onPressed: () => _zoomBy(1 / 1.2)),
                                    ]),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          // legend + summary
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: const BoxDecoration(color: Color(0xFF1b1b1d), border: Border(top: BorderSide(color: Color(0xFF2a2a2e)))),
                            child: Column(children: [
                              Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: const [
                                _Legend(color: Color(0xFF4a4a50), label: 'Available'),
                                _Legend(color: Color(0xFFD96B43), label: 'Selected'),
                                _Legend(color: Color(0xFF232326), label: 'Occupied', border: Color(0xFF2e2e33)),
                              ]),
                              const SizedBox(height: 8),
                              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                                const Text('0 Seats Selected', style: TextStyle(fontSize: 11, color: Color(0xFFA1A1AA), fontWeight: FontWeight.w500)),
                                ElevatedButton(
                                  onPressed: null,
                                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFD96B43), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)), padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8)),
                                  child: const Text('Hold Seats', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                                ),
                              ]),
                            ]),
                          ),
                        ],
                      ),
        // Collection
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Booked seats: ${_seats.where((x) => x['status'] == 'booked').length}', style: GoogleFonts.syne(fontSize: 16, fontWeight: FontWeight.bold, color: const Color(0xFF1A1412))),
              const SizedBox(height: 8),
              Text('Revenue: ${_seats.where((x) => x['status'] == 'booked').fold<int>(0, (a, x) => a + ((x['price_minor'] ?? 0) as int)) / 100}', style: GoogleFonts.syne(fontSize: 18, fontWeight: FontWeight.bold, color: const Color(0xFFC85A32))),
            ],
          ),
        ),
        // Tickets
        ListView.builder(
          itemCount: _bookings.length,
          itemBuilder: (ctx, i) {
            final b = _bookings[i];
            return ListTile(
              title: Text('${b['booking_reference']}', style: GoogleFonts.spaceMono(fontSize: 12, color: const Color(0xFF1A1412))),
              subtitle: Text('${b['status']} • ${b['total_minor']}', style: GoogleFonts.spaceMono(fontSize: 10, color: const Color(0xFF7C635A))),
            );
          },
        ),
      ]),
      ),
    );
  }

  void _zoomBy(double factor) {
    final current = _transformController.value;
    final scale = current.getMaxScaleOnAxis();
    final next = (scale * factor).clamp(0.8, 4.0);
    if ((next - scale).abs() < 0.001) return;
    final zoomed = Matrix4.diagonal3Values(next, next, 1);
    zoomed.setTranslationRaw(current.storage[12], current.storage[13], 0);
    _transformController.value = zoomed;
  }

  List<Widget> _buildSeats() {
    if (_seats.isEmpty) return [const Text('No seats', style: TextStyle(color: Color(0xFFA1A1AA)))];
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
      widgets.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            SizedBox(width: 20, child: Text(row, style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFA1A1AA), fontSize: 11))),
            ...cells.map((s) {
              if (s == null) return Container(width: 22, height: 22, margin: const EdgeInsets.all(1), decoration: BoxDecoration(color: const Color(0xFF1c1c1f), borderRadius: BorderRadius.circular(4)));
              final status = s['status'] ?? 'available';
              Color color = const Color(0xFF4a4a50);
              Color border = Colors.transparent;
              if (status == 'booked') { color = const Color(0xFF232326); border = const Color(0xFF2e2e33); }
              if (status == 'held') color = Colors.orange;
              return Container(
                width: 22,
                height: 22,
                margin: const EdgeInsets.all(1),
                alignment: Alignment.center,
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4), border: border != Colors.transparent ? Border.all(color: border) : null),
                child: Text('${s['seat_number']}', style: const TextStyle(fontSize: 8, color: Colors.white)),
              );
            }),
          ],
        ),
      ));
    }
    return widgets;
  }
}

class _Legend extends StatelessWidget {
  final Color color;
  final String label;
  final Color? border;
  const _Legend({required this.color, required this.label, this.border});
  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(width: 14, height: 14, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3), border: border != null ? Border.all(color: border!) : null)),
      const SizedBox(width: 6),
      Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFFA1A1AA), fontWeight: FontWeight.w500)),
    ]);
  }
}
