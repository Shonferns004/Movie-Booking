import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api.dart';
import 'scanner_screen.dart';
import 'show_detail_screen.dart';
import 'seat_builder_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<String> _roles = [];
  String? _token;

  final _titleCtrl = TextEditingController();
  final _trailerCtrl = TextEditingController();
  XFile? _pickedThumb;
  final _dateCtrl = TextEditingController();
  final _timeCtrl = TextEditingController();
  List<dynamic> _theatres = [];
  List<dynamic> _auditoriums = [];
  String? _theatreId;
  String? _auditoriumId;
  List<dynamic> _categories = [];
  List<dynamic> _seats = [];
  final Map<String, TextEditingController> _priceCtrls = {};

  List<dynamic> _shows = [];
  List<dynamic> _movies = [];
  String? _selectedShowId;

  int _scannedCount = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('token');
    setState(() {
      _roles = (prefs.getString('roles') ?? '').split(',').where((r) => r.isNotEmpty).toList();
    });
    await _refresh();
    await _loadTheatres();
    await _loadCategories();
  }

  Future<void> _loadTheatres() async {
    if (_token == null) return;
    try {
      final t = await Api.getTheatres(_token!);
      setState(() => _theatres = t);
      if (t.isNotEmpty && _theatreId == null) {
        _theatreId = t[0]['id'];
        await _loadAuditoriums();
      }
    } catch (_) {}
  }

  Future<void> _loadAuditoriums() async {
    if (_token == null || _theatreId == null) return;
    try {
      final a = await Api.getAuditoriums(_token!, _theatreId!);
      setState(() => _auditoriums = a);
      if (a.isNotEmpty && _auditoriumId == null) {
        _auditoriumId = a[0]['id'];
        await _loadSeats();
      }
    } catch (_) {}
  }

  Future<void> _loadCategories() async {
    if (_token == null) return;
    try {
      final c = await Api.getCategories(_token!);
      setState(() => _categories = c);
      for (final cat in c) {
        _priceCtrls.putIfAbsent(cat['name'], () => TextEditingController());
      }
    } catch (_) {}
  }

  Future<void> _loadSeats() async {
    if (_token == null || _auditoriumId == null) return;
    try {
      final layout = await Api.getLayout(_token!, _auditoriumId!);
      setState(() => _seats = layout['seats'] ?? []);
    } catch (_) {}
  }



  Future<void> _refresh() async {
    if (_token == null) return;
    List<dynamic> shows = [];
    try { shows = await Api.getShows(_token!); } catch (_) {}
    List<dynamic> movies = [];
    try { movies = await Api.getMovies(_token!); } catch (_) {}
    if (!mounted) return;
    setState(() {
      _shows = shows;
      _movies = movies;
      if (_selectedShowId == null && shows.isNotEmpty) _selectedShowId = shows[0]['id'];
    });
  }

  Future<void> _createShow() async {
    if (_token == null) return;
    try {
      final title = _titleCtrl.text.trim();
      if (title.isEmpty) throw Exception('Enter movie title');
      const duration = 120;
      final slug = title.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-|-$'), '');
      final movie = await Api.createMovie(_token!, {
        'slug': slug,
        'title': title,
        'durationMinutes': duration,
        'language': 'English',
        'certification': 'UA',
        'status': 'published',
        'trailerUrl': _trailerCtrl.text.trim().isEmpty ? null : _trailerCtrl.text.trim(),
      });
      if (_pickedThumb != null) {
        await Api.uploadMedia(_token!, movie['id'], _pickedThumb!, 'poster');
      }
      final startsAt = DateTime.parse('${_dateCtrl.text}T${_timeCtrl.text}:00');
      final endsAt = startsAt.add(Duration(minutes: duration));
      final prices = _categories.map((c) {
        final price = double.tryParse(_priceCtrls[c['name']]?.text ?? '0') ?? 0;
        return {'categoryId': c['id'], 'amountMinor': (price * 100).round()};
      }).toList();
      await Api.createShow(_token!, {
        'movieId': movie['id'],
        'auditoriumId': _auditoriumId,
        'startsAt': startsAt.toIso8601String(),
        'endsAt': endsAt.toIso8601String(),
        'bookingOpensAt': DateTime.now().toIso8601String(),
        'bookingClosesAt': startsAt.subtract(const Duration(minutes: 15)).toIso8601String(),
        'prices': prices,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Show created')));
      await _refresh();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _openAddShow() async {
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Show'),
        content: StatefulBuilder(
          builder: (ctx, setD) => SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
              TextField(controller: _titleCtrl, decoration: const InputDecoration(labelText: 'Movie title')),
              const SizedBox(height: 8),
              Row(children: [
                ElevatedButton.icon(
                  onPressed: () async {
                    try {
                      final picker = ImagePicker();
                      final img = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
                      if (img != null) setState(() => _pickedThumb = img);
                    } catch (e) {
                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Gallery error: $e')));
                    }
                  },
                  icon: const Icon(Icons.photo_library),
                  label: const Text('Pick thumbnail from gallery'),
                ),
              ]),
              if (_pickedThumb != null) ...[
                const SizedBox(height: 8),
                Image.file(File(_pickedThumb!.path), height: 120),
              ],
              const SizedBox(height: 8),
              TextField(controller: _trailerCtrl, decoration: const InputDecoration(labelText: 'YouTube trailer link (optional)')),
              const SizedBox(height: 8),
              TextField(controller: _dateCtrl, readOnly: true, decoration: const InputDecoration(labelText: 'Show date'), onTap: _pickDate),
              const SizedBox(height: 8),
              TextField(controller: _timeCtrl, readOnly: true, decoration: const InputDecoration(labelText: 'Show time'), onTap: _pickTime),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _theatreId,
                decoration: const InputDecoration(labelText: 'Theatre'),
                items: _theatres.map((t) => DropdownMenuItem(value: t['id'] as String, child: Text(t['name']))).toList(),
                onChanged: (v) async {
                  setD(() { _theatreId = v; _auditoriumId = null; _auditoriums = []; });
                  await _loadAuditoriums();
                  setD(() {});
                },
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _auditoriumId,
                decoration: const InputDecoration(labelText: 'Auditorium'),
                items: _auditoriums.map((a) => DropdownMenuItem(value: a['id'] as String, child: Text(a['name']))).toList(),
                onChanged: (v) {
                  setD(() => _auditoriumId = v);
                  _loadSeats();
                },
              ),
              const SizedBox(height: 8),
              const Text('Seat categories & prices', style: TextStyle(fontWeight: FontWeight.bold)),
              ..._categories.map((c) {
                final count = _seatCount(c['name']);
                final total = _seats.length;
                final pct = total > 0 ? (count / total * 100).round() : 0;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Expanded(child: Text('${c['name']} — $count seats · $pct%')),
                      SizedBox(width: 120, child: TextField(controller: _priceCtrls[c['name']], decoration: const InputDecoration(labelText: 'Price'), keyboardType: TextInputType.number, onChanged: (_) => setState(() {}))),
                    ],
                  ),
                );
              }),
              const SizedBox(height: 8),
              Text('Max gross: ${_gross.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
        ),
         ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(onPressed: _createShow, child: const Text('Create')),
        ],
      ),
    );
  }


  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, initialDate: now, firstDate: now, lastDate: now.add(const Duration(days: 365)));
    if (d != null) {
      _dateCtrl.text = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    }
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.now());
    if (t != null) {
      _timeCtrl.text = '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    }
  }

  Future<void> _logout(BuildContext context) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('roles');
    if (!context.mounted) return;
    Navigator.pushReplacementNamed(context, '/login');
  }

  bool get _isAdmin => _roles.contains('ADMIN');
  bool get _isScanner => _roles.contains('SCANNER');

  int _seatCount(String cat) => _seats.where((s) => s['category_name'] == cat).length;


  double get _gross => _categories.fold(0.0, (sum, c) {
    final count = _seatCount(c['name']);
    final price = double.tryParse(_priceCtrls[c['name']]?.text ?? '0') ?? 0;
    return sum + count * price;
  });



  @override
  Widget build(BuildContext context) {
    if (_isScanner && !_isAdmin) {
      return Scaffold(
        appBar: AppBar(title: const Text('Ticket Scanner'), actions: [IconButton(onPressed: () => _logout(context), icon: const Icon(Icons.logout))]),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Scan for show', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: _selectedShowId,
                        decoration: const InputDecoration(labelText: 'Select show'),
                        items: _shows.map((s) => DropdownMenuItem(value: s['id'] as String, child: Text('${s['id']}'.substring(0, 8)))).toList(),
                        onChanged: (v) => setState(() => _selectedShowId = v),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          const Icon(Icons.confirmation_number),
                          const SizedBox(width: 8),
                          Text('Scanned tickets: $_scannedCount', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: () {
                  if (_selectedShowId == null) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a show first')));
                    return;
                  }
                  Navigator.push(context, MaterialPageRoute(builder: (_) => ScannerScreen(showId: _selectedShowId, token: _token, onValidated: (_) => setState(() => _scannedCount++))));
                },
                icon: const Icon(Icons.qr_code_scanner),
                label: const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('Start Scanning', style: TextStyle(fontSize: 16))),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Konkani Samudai Admin'),
        actions: [IconButton(onPressed: () => _logout(context), icon: const Icon(Icons.logout))],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ElevatedButton.icon(
              onPressed: _openAddShow,
              icon: const Icon(Icons.add),
              label: const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Add Show')),
            ),
            const SizedBox(height: 8),
            ElevatedButton.icon(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SeatBuilderScreen(token: _token!))),
              icon: const Icon(Icons.chair),
              label: const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Theaters')),
            ),
            const SizedBox(height: 16),
            ..._shows.map((s) {
              final movie = _movies.firstWhere((m) => m['id'].toString() == s['movie_id']?.toString(), orElse: () => null);
              final title = movie == null ? 'Show' : (movie['title'] ?? 'Show');
              final thumb = movie == null ? null : movie['thumbnail_url'];
              return Card(
                child: ListTile(
                  leading: thumb == null
                      ? const Icon(Icons.movie)
                      : ClipRRect(borderRadius: BorderRadius.circular(4), child: Image.network(thumb, width: 48, height: 48, fit: BoxFit.cover, errorBuilder: (_, _, _) => const Icon(Icons.movie))),
                  title: Text(title),
                  subtitle: Text('${s['starts_at']} • ${s['status']}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ShowDetailScreen(showId: s['id'], token: _token))),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
