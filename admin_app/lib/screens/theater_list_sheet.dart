import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api.dart';
import 'seat_builder_screen.dart';

class TheaterListSheet extends StatefulWidget {
  final String? token;
  const TheaterListSheet({super.key, this.token});

  @override
  State<TheaterListSheet> createState() => _TheaterListSheetState();
}

class _TheaterListSheetState extends State<TheaterListSheet> {
  String? _token;
  List<dynamic> _theatres = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _token = widget.token;
    _load();
  }

  Future<void> _load() async {
    if (_token == null) {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString('token');
    }
    if (_token == null) return;
    try {
      final t = await Api.getTheatres(_token!);
      setState(() { _theatres = t; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _addTheatre() async {
    final nameCtrl = TextEditingController();
    final addrCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A1E),
        title: const Text('Add Theater', style: TextStyle(color: Color(0xFFF4F4F5))),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 8),
          TextField(controller: addrCtrl, decoration: const InputDecoration(labelText: 'Address')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.createTheatre(_token!, nameCtrl.text.trim(), addrCtrl.text.trim());
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _deleteTheatre(dynamic t) async {
    try {
      await Api.deleteTheatre(_token!, t['id']);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    const sumi900 = Color(0xFF131315);
    const sumi850 = Color(0xFF17171a);
    const sumi800 = Color(0xFF1b1b1d);
    const sumi600 = Color(0xFF2a2a2e);
    const sumi500 = Color(0xFF333338);
    const sumi300 = Color(0xFF8e8e96);
    const sand = Color(0xFFFAF6F0);
    const terracotta = Color(0xFFC85A32);

    return Container(
      height: MediaQuery.of(context).size.height * 0.78,
      decoration: const BoxDecoration(
        color: sumi900,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: sumi600)),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 4),
            child: Container(width: 36, height: 4, decoration: BoxDecoration(color: sumi500, borderRadius: BorderRadius.circular(2))),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Theaters', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: sand)),
                InkWell(
                  onTap: () => Navigator.pop(context),
                  child: Container(width: 28, height: 28, decoration: BoxDecoration(color: sumi800, borderRadius: BorderRadius.circular(8), border: Border.all(color: sumi600)), child: const Icon(Icons.close, size: 14, color: sumi300)),
                ),
              ],
            ),
          ),
          Container(height: 1, color: sumi600),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              Expanded(child: TextField(
                style: const TextStyle(fontSize: 12, color: sand),
                decoration: InputDecoration(
                  hintText: 'Search by theater or location...',
                  hintStyle: TextStyle(fontSize: 12, color: sumi300),
                  prefixIcon: const Icon(Icons.search, size: 16, color: sumi300),
                  filled: true,
                  fillColor: sumi850,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: sumi600)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: sumi600)),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: terracotta)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
              )),
              const SizedBox(width: 10),
              ElevatedButton.icon(
                onPressed: _addTheatre,
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                style: ElevatedButton.styleFrom(backgroundColor: terracotta, foregroundColor: sand, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10)),
              ),
            ]),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _theatres.length,
                    itemBuilder: (_, i) {
                      final t = _theatres[i];
                      return InkWell(
                        onTap: () {
                          Navigator.pop(context);
                          Navigator.push(context, MaterialPageRoute(builder: (_) => SeatBuilderScreen(token: _token!, initialTheatreId: t['id'])));
                        },
                        child: Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(color: sumi800, borderRadius: BorderRadius.circular(16), border: Border.all(color: sumi600)),
                        child: Row(
                          children: [
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(t['name'] ?? '', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: sand)),
                              const SizedBox(height: 2),
                              Text(t['address'] ?? '', style: TextStyle(fontSize: 11, color: sumi300)),
                            ])),
                            IconButton(icon: Icon(Icons.delete, size: 16, color: sumi300), onPressed: () => _deleteTheatre(t)),
                          ],
                        ),
                      ),
                      );
                    },
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(width: double.infinity, child: ElevatedButton(
              onPressed: () {},
              style: ElevatedButton.styleFrom(backgroundColor: terracotta, foregroundColor: sand, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)), padding: const EdgeInsets.symmetric(vertical: 10)),
              child: const Text('Done', style: TextStyle(fontWeight: FontWeight.bold)),
            )),
          ),
        ],
      ),
    );
  }
}