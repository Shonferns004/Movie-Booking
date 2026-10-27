import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api.dart';
import '../services/auth_service.dart';
import '../widgets/app_toast.dart';
import '../widgets/skeleton.dart';
import 'scanner_screen.dart';
import 'show_detail_screen.dart';
import 'add_show_screen.dart' show AddShowSheet;
import 'theater_list_sheet.dart';

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
  int _heroIndex = 0;
  Timer? _heroTimer;
  String? _selectedShowId;

  int _scannedCount = 0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final cachedToken = prefs.getString('token') ?? '';
    final token = await AuthService.validAccessToken(cachedToken);
    if (token.isEmpty) {
      if (mounted) {
        Navigator.of(context)
            .pushNamedAndRemoveUntil('/login', (route) => false);
      }
      return;
    }
    _token = token;
    setState(() {
      _roles = (prefs.getString('roles') ?? '')
          .split(',')
          .where((r) => r.isNotEmpty)
          .toList();
    });
    await _refresh();
    if (mounted) setState(() => _loading = false);
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
    try {
      shows = await Api.getShows(_token!);
      if (shows.isNotEmpty) {
        shows = await _withSeatCounts(_token!, shows);
      }
    } catch (_) {}
    List<dynamic> movies = [];
    try {
      movies = await Api.getMovies(_token!);
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _shows = shows;
      _movies = movies;
      if (_selectedShowId == null && shows.isNotEmpty)
        _selectedShowId = shows[0]['id'];
      if (_heroIndex >= _ongoingShows.length && _ongoingShows.isNotEmpty)
        _heroIndex = 0;
    });
    _startHeroTimer();
  }

  Future<List<dynamic>> _withSeatCounts(
    String token,
    List<dynamic> shows,
  ) async {
    return Future.wait(
      shows.map((show) async {
        final showMap = Map<String, dynamic>.from(show as Map);
        if (_asInt(showMap['seat_count']) > 0) return showMap;
        final showId = showMap['id']?.toString();
        if (showId == null || showId.isEmpty) return showMap;
        try {
          final seatData = await Api.getShowSeats(token, showId);
          final seats = (seatData['seats'] as List?) ?? const [];
          var booked = 0;
          var held = 0;
          var minPrice = 0;
          var maxPrice = 0;
          for (final raw in seats) {
            if (raw is! Map) continue;
            final status = raw['status']?.toString();
            if (status == 'booked') booked++;
            if (status == 'held') held++;
            final price = _asInt(raw['price_minor']);
            if (price > 0) {
              if (minPrice == 0 || price < minPrice) minPrice = price;
              if (price > maxPrice) maxPrice = price;
            }
          }
          showMap['seat_count'] = seats.length;
          showMap['booked_count'] = booked;
          showMap['held_count'] = held;
          if (minPrice > 0) {
            showMap['price_min_minor'] = minPrice;
            showMap['price_max_minor'] = maxPrice;
          }
        } catch (_) {}
        return showMap;
      }),
    );
  }

  Future<void> _createShow() async {
    if (_token == null) return;
    try {
      final title = _titleCtrl.text.trim();
      if (title.isEmpty) throw Exception('Enter movie title');
      const duration = 120;
      final slug = title
          .toLowerCase()
          .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
          .replaceAll(RegExp(r'^-|-$'), '');
      final movie = await Api.createMovie(_token!, {
        'slug': slug,
        'title': title,
        'durationMinutes': duration,
        'language': 'English',
        'certification': 'UA',
        'status': 'draft',
        'trailerUrl': _trailerCtrl.text.trim().isEmpty
            ? null
            : _trailerCtrl.text.trim(),
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
        'bookingClosesAt': startsAt
            .subtract(const Duration(minutes: 15))
            .toIso8601String(),
        'prices': prices,
      });
      if (mounted) {
        AppToast.show(
          context,
          'Movie saved as a draft.',
          type: AppToastType.success,
        );
      }
      await _refresh();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        final detail = e.toString().replaceFirst('Exception: ', '');
        AppToast.show(
          context,
          'Could not create the show. $detail',
          type: AppToastType.error,
        );
      }
    }
  }

  Future<void> _openAddShowSheet() async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
            left: 16,
            right: 16,
            top: 16,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Add Movie',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _titleCtrl,
                  decoration: const InputDecoration(labelText: 'Movie title'),
                ),
                const SizedBox(height: 8),
                ElevatedButton.icon(
                  onPressed: () async {
                    try {
                      final picker = ImagePicker();
                      final img = await picker.pickImage(
                        source: ImageSource.gallery,
                        imageQuality: 80,
                      );
                      if (img != null) setState(() => _pickedThumb = img);
                    } catch (e) {
                      if (mounted) {
                        AppToast.show(
                          context,
                          'Could not open the gallery. Please try again.',
                          type: AppToastType.error,
                        );
                      }
                    }
                  },
                  icon: const Icon(Icons.photo_library),
                  label: const Text('Pick thumbnail'),
                ),
                if (_pickedThumb != null) ...[
                  const SizedBox(height: 8),
                  Image.file(File(_pickedThumb!.path), height: 120),
                ],
                const SizedBox(height: 8),
                TextField(
                  controller: _trailerCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Trailer URL (optional)',
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _dateCtrl,
                  readOnly: true,
                  decoration: const InputDecoration(labelText: 'Show date'),
                  onTap: _pickDate,
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _timeCtrl,
                  readOnly: true,
                  decoration: const InputDecoration(labelText: 'Show time'),
                  onTap: _pickTime,
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _theatreId,
                  decoration: const InputDecoration(labelText: 'Theatre'),
                  items: _theatres
                      .map(
                        (t) => DropdownMenuItem(
                          value: t['id'] as String,
                          child: Text(t['name']),
                        ),
                      )
                      .toList(),
                  onChanged: (v) async {
                    setD(() {
                      _theatreId = v;
                      _auditoriumId = null;
                      _auditoriums = [];
                    });
                    await _loadAuditoriums();
                    setD(() {});
                  },
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _auditoriumId,
                  decoration: const InputDecoration(labelText: 'Auditorium'),
                  items: _auditoriums
                      .map(
                        (a) => DropdownMenuItem(
                          value: a['id'] as String,
                          child: Text(a['name']),
                        ),
                      )
                      .toList(),
                  onChanged: (v) {
                    setD(() => _auditoriumId = v);
                    _loadSeats();
                  },
                ),
                const SizedBox(height: 8),
                const Text(
                  'Seat categories & prices',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                ..._categories.map((c) {
                  final count = _seatCount(c['name']);
                  final total = _seats.length;
                  final pct = total > 0 ? (count / total * 100).round() : 0;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text('${c['name']} — $count seats • $pct%'),
                        ),
                        SizedBox(
                          width: 120,
                          child: TextField(
                            controller: _priceCtrls[c['name']],
                            decoration: const InputDecoration(
                              labelText: 'Price',
                            ),
                            keyboardType: TextInputType.number,
                            onChanged: (_) => setD(() {}),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 8),
                Text(
                  'Max gross: ${_gross.toStringAsFixed(0)}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      await _createShow();
                      if (mounted) Navigator.pop(context);
                    },
                    child: const Text('Create'),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (d != null) {
      _dateCtrl.text =
          '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    }
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
    );
    if (t != null) {
      _timeCtrl.text =
          '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    }
  }

  Future<void> _logout(BuildContext context) async {
    await AuthService.logout();
    if (!context.mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
  }

  bool get _isAdmin => _roles.contains('ADMIN');
  bool get _isScanner => _roles.contains('SCANNER');

  List<dynamic> get _ongoingShows {
    final now = DateTime.now();
    final filtered = _shows.where((s) {
      final status = (s['status'] ?? '').toString().toLowerCase();
      if (status != 'scheduled' && status != 'active' && status.isNotEmpty)
        return false;
      final t = DateTime.tryParse(s['starts_at']?.toString() ?? '');
      if (t == null) return true;
      return t.isAfter(now.subtract(const Duration(hours: 3)));
    }).toList();
    return filtered.isNotEmpty ? filtered : _shows;
  }

  void _startHeroTimer() {
    _heroTimer?.cancel();
    if (_ongoingShows.length <= 1) return;
    _heroTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted || _ongoingShows.isEmpty) return;
      setState(() => _heroIndex = (_heroIndex + 1) % _ongoingShows.length);
    });
  }

  int _seatCount(String cat) =>
      _seats.where((s) => s['category_name'] == cat).length;

  double get _gross => _categories.fold(0.0, (sum, c) {
    final count = _seatCount(c['name']);
    final price = double.tryParse(_priceCtrls[c['name']]?.text ?? '0') ?? 0;
    return sum + count * price;
  });

  @override
  void dispose() {
    _heroTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return _buildHomeSkeleton();
    if (_isScanner && !_isAdmin) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Ticket Scanner'),
          actions: [
            IconButton(
              onPressed: () => _logout(context),
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
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
                      const Text(
                        'Scan for show',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: _selectedShowId,
                        decoration: const InputDecoration(
                          labelText: 'Select show',
                        ),
                        items: _shows
                            .map(
                              (s) => DropdownMenuItem(
                                value: s['id'] as String,
                                child: Text('${s['movie_title'] ?? s['title'] ?? 'Show'}'),
                              ),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => _selectedShowId = v),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          const Icon(Icons.confirmation_number),
                          const SizedBox(width: 8),
                          Text(
                            'Scanned tickets: $_scannedCount',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
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
                    AppToast.show(
                      context,
                      'Select a show before opening the scanner.',
                      type: AppToastType.error,
                    );
                    return;
                  }
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ScannerScreen(
                        showId: _selectedShowId,
                        token: _token,
                        onValidated: (_) => setState(() => _scannedCount++),
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.qr_code_scanner),
                label: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 14),
                  child: Text('Start Scanning', style: TextStyle(fontSize: 16)),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF121214),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHomeHeader(),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: Color(0xFFD96B43),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'SCREENINGS',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF9E9890),
                          letterSpacing: 1.4,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    '${_shows.length} showings scheduled',
                    style: const TextStyle(
                      fontSize: 11,
                      fontStyle: FontStyle.italic,
                      color: Color(0xFF9E9890),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _buildHeroCard(context),
              const SizedBox(height: 16),
              _buildHomeQuickActions(),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    "TODAY'S GATHERINGS",
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF9E9890),
                      letterSpacing: 1.4,
                    ),
                  ),
                  Text(
                    '${_shows.length} showings scheduled',
                    style: const TextStyle(
                      fontSize: 11,
                      fontStyle: FontStyle.italic,
                      color: Color(0xFF9E9890),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              ..._buildShowItems(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHomeHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Konkani Samudai',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Color(0xFFF5EFEB),
                letterSpacing: -0.5,
              ),
            ),
            const Text(
              'Cinema Gazette and Curatorial Control',
              style: TextStyle(
                fontSize: 11,
                color: Color(0xFF9E9890),
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        GestureDetector(
          onTap: () => _logout(context),
          child: const CircleAvatar(
            radius: 16,
            backgroundColor: Color(0xFFD96B43),
            child: Text(
              'AD',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 11,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHomeQuickActions() {
    return Row(
      children: [
        Expanded(
          child: ElevatedButton(
            onPressed: () async {
              await showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => AddShowSheet(token: _token),
              );
              if (mounted) await _refresh();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFD96B43),
              foregroundColor: const Color(0xFFFAF7F2),
              shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(12)),
              ),
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
              elevation: 0,
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '+ Add Movie',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFFFAF7F2),
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Draft until priced',
                  style: TextStyle(
                    fontSize: 9,
                    fontStyle: FontStyle.italic,
                    color: Color(0xFFF5EFEB),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton(
            onPressed: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              backgroundColor: Colors.transparent,
              builder: (_) => TheaterListSheet(token: _token),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1A1A1E),
              foregroundColor: const Color(0xFFF5EFEB),
              shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(12)),
              ),
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
              side: const BorderSide(color: Color(0xFF2F2F37)),
              elevation: 0,
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Theatres',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFFF5EFEB),
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Audi allocation',
                  style: TextStyle(
                    fontSize: 9,
                    fontStyle: FontStyle.italic,
                    color: Color(0xFF9E9890),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHomeSkeleton() {
    return Scaffold(
      backgroundColor: const Color(0xFF121214),
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHomeHeader(),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: Color(0xFFD96B43),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'SCREENINGS',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF9E9890),
                          letterSpacing: 1.4,
                        ),
                      ),
                    ],
                  ),
                  const SkeletonPulse(
                    child: SkeletonBox(width: 104, height: 8),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SkeletonPulse(
                child: Container(
                  height: 320,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF161618),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: const Color(0xFF2F2F37)),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      SkeletonBox(width: 150, height: 9),
                      SizedBox(height: 12),
                      SkeletonBox(width: 220, height: 26),
                      SizedBox(height: 8),
                      SkeletonBox(width: 120, height: 14),
                      SizedBox(height: 18),
                      Row(
                        children: [
                          SkeletonCircle(size: 34),
                          SizedBox(width: 8),
                          SkeletonBox(width: 110, height: 9),
                          Spacer(),
                          SkeletonBox(width: 60, height: 12),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              _buildHomeQuickActions(),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    "TODAY'S GATHERINGS",
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF9E9890),
                      letterSpacing: 1.4,
                    ),
                  ),
                  const SkeletonPulse(
                    child: SkeletonBox(width: 104, height: 9),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              SkeletonPulse(
                child: Column(
                  children: [
                    for (var i = 0; i < 3; i++)
                      const SkeletonCard(
                        radius: 24,
                        margin: EdgeInsets.only(bottom: 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                SkeletonBox(width: 60, height: 20),
                                SkeletonBox(width: 92, height: 18),
                              ],
                            ),
                            SizedBox(height: 14),
                            SkeletonBox(width: 160, height: 12),
                            SizedBox(height: 10),
                            SkeletonBox(width: double.infinity, height: 4),
                            SizedBox(height: 12),
                            SkeletonBox(width: 100, height: 9),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _heroFallbackImage() {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF1A1A1E), Color(0xFF0E0E10)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Center(
        child: Icon(Icons.movie_outlined, size: 48, color: Color(0xFF3A3A44)),
      ),
    );
  }

  Widget _buildHeroCard(BuildContext context) {
    final ongoing = _ongoingShows;
    final safeIndex = ongoing.isEmpty
        ? 0
        : _heroIndex.clamp(0, ongoing.length - 1);
    final show = ongoing.isNotEmpty
        ? ongoing[safeIndex]
        : (_shows.isNotEmpty ? _shows.first : null);

    if (show == null) {
      return Container(
        height: 320,
        decoration: BoxDecoration(
          color: const Color(0xFF0E0E10),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: const Color(0xFF2F2F37)),
        ),
        alignment: Alignment.center,
        child: const Text(
          'No shows scheduled',
          style: TextStyle(
            fontSize: 13,
            color: Color(0xFF9E9890),
            fontWeight: FontWeight.w500,
          ),
        ),
      );
    }

    final movie = _movies.firstWhere(
      (m) => m['id'].toString() == show['movie_id']?.toString(),
      orElse: () => <String, dynamic>{},
    );
    final title = _firstNonEmpty([
      show['movie_title'],
      movie['title'],
    ], fallback: 'Untitled show');
    final thumb = _firstNonEmpty([
      show['movie_thumbnail_url'],
      movie['thumbnail_url'],
    ]);
    final theatre = _asText(show['theatre_name']);
    final screen = _asText(show['auditorium_name']);
    final dateStr = _formatDateShort(show['starts_at']);
    final timeStr = _formatTime(show['starts_at']);
    final totalSeats = _asInt(show['seat_count']);
    final occupiedSeats =
        (_asInt(show['booked_count']) + _asInt(show['held_count']))
            .clamp(0, totalSeats)
            .toInt();
    final capacityText = totalSeats > 0
        ? 'CAPACITY ($occupiedSeats/$totalSeats)'
        : '';
    final priceText = _formatPriceRange(
      show['price_min_minor'],
      show['price_max_minor'],
    );
    final venue = [
      if (theatre.isNotEmpty) theatre,
      if (screen.isNotEmpty) screen,
    ].join(' • ');
    final meta = <Widget>[
      if (venue.isNotEmpty)
        Text(
          venue,
          style: const TextStyle(
            fontSize: 11,
            color: Color(0xFFD8C7A5),
            fontWeight: FontWeight.w500,
          ),
        ),
      if (dateStr.isNotEmpty)
        Text(
          dateStr,
          style: const TextStyle(
            fontSize: 11,
            color: Color(0xFFF5EFEB),
            fontWeight: FontWeight.w600,
          ),
        ),
    ];

    return Container(
      height: 320,
      decoration: BoxDecoration(
        color: const Color(0xFF0E0E10),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: const Color(0xFF2F2F37)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (thumb.isNotEmpty)
            Image.network(
              thumb,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _heroFallbackImage(),
            )
          else
            _heroFallbackImage(),
          Container(color: const Color(0xFF0E0E10).withValues(alpha: 0.6)),
          Positioned(
            top: 16,
            left: 16,
            right: 16,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFD96B43),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Row(
                    children: [
                      SizedBox(
                        width: 6,
                        height: 6,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: Color(0xFFFAF7F2),
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                      SizedBox(width: 6),
                      Text(
                        'NEW MOVIE',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFFFAF7F2),
                          letterSpacing: 1.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (meta.isNotEmpty)
                    Wrap(
                      spacing: 12,
                      runSpacing: 2,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: meta,
                    ),
                  const SizedBox(height: 6),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFFFAF7F2),
                      letterSpacing: 1.2,
                      height: 1,
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (capacityText.isNotEmpty ||
                      timeStr.isNotEmpty ||
                      priceText.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.only(top: 8),
                      decoration: const BoxDecoration(
                        border: Border(top: BorderSide(color: Colors.white12)),
                      ),
                      child: Row(
                        children: [
                          if (capacityText.isNotEmpty)
                            Text(
                              capacityText,
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 9,
                                color: Color(0xFFF5EFEB),
                              ),
                            ),
                          const Spacer(),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              if (timeStr.isNotEmpty)
                                Text(
                                  timeStr,
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFFFAF7F2),
                                  ),
                                ),
                              if (priceText.isNotEmpty)
                                Text(
                                  priceText,
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontSize: 9,
                                    color: Color(0xFFD8C7A5),
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildShowItems(BuildContext context) {
    if (_shows.isEmpty) {
      return [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 20),
          child: Text(
            'No programmes yet.',
            style: TextStyle(color: Color(0xFF9E9890)),
          ),
        ),
      ];
    }
    return _shows.map((s) {
      final movie = _movies.firstWhere(
        (m) => m['id'].toString() == s['movie_id']?.toString(),
        orElse: () => <String, dynamic>{},
      );
      final title = _firstNonEmpty([
        s['movie_title'],
        movie['title'],
      ], fallback: 'Untitled show');
      final thumb = _firstNonEmpty([
        s['movie_thumbnail_url'],
        movie['thumbnail_url'],
      ]);
      final totalSeats = _asInt(s['seat_count']);
      final occupiedSeats =
          (_asInt(s['booked_count']) + _asInt(s['held_count']))
              .clamp(0, totalSeats)
              .toInt();
      final pct = totalSeats > 0
          ? (occupiedSeats / totalSeats * 100).round()
          : 0;
      final seats = totalSeats > 0 ? '$occupiedSeats/$totalSeats' : '';
      final meterColor = pct >= 80
          ? const Color(0xFFD96B43)
          : const Color(0xFF8E9E8A);
      final statusLabel = _showStatusLabel(s, occupiedSeats, totalSeats);
      final badgeColor = _showStatusColor(s, occupiedSeats, totalSeats);
      final theatre = _asText(s['theatre_name']);
      final screen = _asText(s['auditorium_name']);
      final venue = [
        if (theatre.isNotEmpty) theatre,
        if (screen.isNotEmpty) screen,
      ].join(' • ');
      final dateSlash = _formatDateSlash(s['starts_at']);
      final weekday = _weekday(s['starts_at']);
      final time = _formatTime(s['starts_at']);
      final timeMeta = [
        weekday,
        time,
      ].where((value) => value.isNotEmpty).join(' • ');
      final priceText = _formatPriceRange(
        s['price_min_minor'],
        s['price_max_minor'],
      );
      return InkWell(
        onTap: () async {
          await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => ShowDetailScreen(showId: s['id'], token: _token),
            ),
          );
          if (mounted) await _refresh();
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF1A1A1E),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFF2F2F37)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      if (dateSlash.isNotEmpty)
                        Text(
                          dateSlash,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFFF5EFEB),
                            height: 1,
                          ),
                        ),
                      if (dateSlash.isNotEmpty && timeMeta.isNotEmpty)
                        const SizedBox(width: 8),
                      if (timeMeta.isNotEmpty)
                        Text(
                          timeMeta,
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 10,
                            color: Color(0xFF9E9890),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                    ],
                  ),
                  if (statusLabel.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: badgeColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: badgeColor.withValues(alpha: 0.4),
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: badgeColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            statusLabel,
                            style: TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              color: badgeColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 64,
                    height: 80,
                    decoration: BoxDecoration(
                      color: const Color(0xFF161619),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF2F2F37)),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: thumb.isNotEmpty
                        ? Image.network(
                            thumb,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Icon(
                              Icons.movie,
                              color: Color(0xFF9E9890),
                            ),
                          )
                        : const Icon(Icons.movie, color: Color(0xFF9E9890)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (priceText.isNotEmpty)
                          Align(
                            alignment: Alignment.centerRight,
                            child: Text(
                              priceText,
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFFF5EFEB),
                              ),
                            ),
                          ),
                        const SizedBox(height: 2),
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFFF5EFEB),
                            height: 1.1,
                          ),
                        ),
                        if (venue.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            venue,
                            style: const TextStyle(
                              fontFamily: 'serif',
                              fontSize: 11,
                              fontStyle: FontStyle.italic,
                              color: Color(0xFF9E9890),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                        if (totalSeats > 0) ...[
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Expanded(
                                child: Container(
                                  height: 6,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF232329),
                                    borderRadius: BorderRadius.circular(3),
                                  ),
                                  child: FractionallySizedBox(
                                    alignment: Alignment.centerLeft,
                                    widthFactor: pct / 100.0,
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: meterColor,
                                        borderRadius: BorderRadius.circular(3),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                seats,
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 9,
                                  color: Color(0xFF9E9890),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    }).toList();
  }

  Widget _fabButton(
    String label,
    IconData icon,
    VoidCallback onTap,
    bool primary,
  ) {
    return ElevatedButton(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: primary
            ? const Color(0xFFC85A32)
            : const Color(0xFFFAF7F2),
        foregroundColor: primary ? Colors.white : const Color(0xFF1A1412),
        elevation: 8,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.zero,
          side: BorderSide(color: Color(0xFF1A1412), width: 2),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 14,
            color: primary ? Colors.white : const Color(0xFFC85A32),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: GoogleFonts.syne(
              fontSize: 12,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }

  int _asInt(dynamic value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  String _asText(dynamic value) {
    final text = value?.toString().trim() ?? '';
    return text.toLowerCase() == 'null' ? '' : text;
  }

  String _firstNonEmpty(List<dynamic> values, {String fallback = ''}) {
    for (final value in values) {
      final text = _asText(value);
      if (text.isNotEmpty) return text;
    }
    return fallback;
  }

  String _formatRupees(int minor) {
    if (minor <= 0) return '';
    final value = minor / 100;
    return value == value.roundToDouble()
        ? '₹${value.toStringAsFixed(0)}'
        : '₹${value.toStringAsFixed(2)}';
  }

  String _formatPriceRange(dynamic minValue, dynamic maxValue) {
    final min = _asInt(minValue);
    final max = _asInt(maxValue);
    if (min <= 0 && max <= 0) return '';
    if (min <= 0) return _formatRupees(max);
    if (max <= 0 || max == min) return _formatRupees(min);
    return '${_formatRupees(min)} — ${_formatRupees(max)}';
  }

  String _showStatusLabel(dynamic show, int occupied, int total) {
    final status = _asText(show?['status']).toUpperCase();
    if (total > 0 && occupied >= total) return 'SOLD OUT';
    if (status == 'ACTIVE') return 'NOW SHOWING';
    if (status == 'SCHEDULED') return 'UPCOMING';
    if (status == 'CANCELLED') return 'CANCELLED';
    return status;
  }

  Color _showStatusColor(dynamic show, int occupied, int total) {
    return _showStatusLabel(show, occupied, total) == 'NOW SHOWING'
        ? const Color(0xFF8E9E8A)
        : const Color(0xFFD96B43);
  }

  String _formatTime(dynamic v) {
    if (v == null) return '';
    try {
      final d = DateTime.parse(v.toString());
      final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
      final m = d.minute.toString().padLeft(2, '0');
      final ampm = d.hour >= 12 ? 'PM' : 'AM';
      return '$h:$m $ampm';
    } catch (_) {
      return '';
    }
  }

  String _formatDateSlash(dynamic v) {
    if (v == null) return '';
    try {
      final d = DateTime.parse(v.toString());
      return '${d.day.toString().padLeft(2, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-${d.year}';
    } catch (_) {
      return '';
    }
  }

  String _formatDateShort(dynamic v) {
    if (v == null) return '';
    try {
      final d = DateTime.parse(v.toString());
      return '${d.day.toString().padLeft(2, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-${d.year}';
    } catch (_) {
      return '';
    }
  }

  String _weekday(dynamic v) {
    if (v == null) return '';
    try {
      final d = DateTime.parse(v.toString());
      const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      return days[(d.weekday - 1) % 7];
    } catch (_) {
      return '';
    }
  }
}
