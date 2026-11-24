import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/api.dart';
import '../widgets/app_toast.dart';
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// Full-page planner for a new movie.
///
/// One movie, many shows: each row picks a theatre, a screen, a date, a time and a
/// price, so the same film can run in different venues at different rates.
class MoviePlannerScreen extends StatefulWidget {
  const MoviePlannerScreen({super.key, required this.token});

  final String? token;

  @override
  State<MoviePlannerScreen> createState() => _MoviePlannerScreenState();
}

class _Plan {
  _Plan({this.theatreId, this.auditoriumId, DateTime? date, TimeOfDay? time})
    : date = date ?? DateTime.now().add(const Duration(days: 1)),
      time = time ?? const TimeOfDay(hour: 18, minute: 0);

  String? theatreId;
  String? auditoriumId;
  DateTime date;
  TimeOfDay time;

  /// One price field per seat category (Standard, Premium, Recliner, …).
  final Map<String, TextEditingController> prices = {};

  DateTime get startsAt =>
      DateTime(date.year, date.month, date.day, time.hour, time.minute);

  /// Creates the price fields for the categories once they are known.
  void ensurePrices(List<dynamic> categories, {Map<String, String>? seed}) {
    for (final category in categories) {
      final id = category is Map ? category['id']?.toString() : null;
      if (id == null) continue;
      prices.putIfAbsent(
        id,
        () => TextEditingController(text: seed?[id] ?? '250'),
      );
    }
  }

  Map<String, String> snapshotPrices() =>
      prices.map((key, controller) => MapEntry(key, controller.text));

  void dispose() {
    for (final controller in prices.values) {
      controller.dispose();
    }
  }
}

class _MoviePlannerScreenState extends State<MoviePlannerScreen> {
  final _title = TextEditingController();
  final _duration = TextEditingController(text: '120');
  final _language = TextEditingController(text: 'English');
  final _certification = TextEditingController(text: 'UA');
  final _genre = TextEditingController();
  final _synopsis = TextEditingController();

  XFile? _poster;
  bool _posterBusy = false;

  List<dynamic> _theatres = [];
  List<dynamic> _categories = [];
  final Map<String, List<dynamic>> _auditoriums = {};
  final Set<String> _loadingAuditoriums = {};

  final List<_Plan> _plans = [_Plan()];

  bool _loading = true;
  bool _saving = false;
  String _progress = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _title.dispose();
    _duration.dispose();
    _language.dispose();
    _certification.dispose();
    _genre.dispose();
    _synopsis.dispose();
    for (final plan in _plans) {
      plan.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final token = widget.token;
    if (token == null || token.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Session expired. Please sign in again.';
      });
      return;
    }
    try {
      final results = await Future.wait([
        Api.getTheatres(token),
        Api.getCategories(token),
      ]);
      if (!mounted) return;
      setState(() {
        _theatres = results[0];
        _categories = results[1];
        if (_theatres.isNotEmpty) {
          final first = _theatres.first['id']?.toString();
          for (final plan in _plans) {
            plan.theatreId ??= first;
          }
        }
        for (final plan in _plans) {
          plan.ensurePrices(_categories);
        }
        _loading = false;
      });
      for (final theatreId in _plans.map((p) => p.theatreId).whereType<String>()) {
        await _loadAuditoriums(theatreId);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _loadAuditoriums(String theatreId) async {
    final token = widget.token;
    if (token == null || _auditoriums.containsKey(theatreId)) return;
    setState(() => _loadingAuditoriums.add(theatreId));
    try {
      final list = await Api.getAuditoriums(token, theatreId);
      if (mounted) setState(() => _auditoriums[theatreId] = list);
    } catch (_) {
      if (mounted) setState(() => _auditoriums[theatreId] = []);
    } finally {
      if (mounted) setState(() => _loadingAuditoriums.remove(theatreId));
    }
  }

  void _selectTheatre(_Plan plan, String? theatreId) {
    if (theatreId == null) return;
    setState(() {
      plan.theatreId = theatreId;
      plan.auditoriumId = null;
    });
    _loadAuditoriums(theatreId);
  }

  List<dynamic> _screensFor(_Plan plan) {
    final list = _auditoriums[plan.theatreId] ?? const [];
    // Shows need seats, so only screens with an approved layout are usable.
    return list.whereType<Map>().toList();
  }

  Future<void> _pickDate(_Plan plan) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: plan.date,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null && mounted) setState(() => plan.date = picked);
  }

  Future<void> _pickTime(_Plan plan) async {
    final picked = await showTimePicker(context: context, initialTime: plan.time);
    if (picked != null && mounted) setState(() => plan.time = picked);
  }

  Future<void> _pickPoster() async {
    setState(() => _posterBusy = true);
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        imageQuality: 88,
      );
      if (picked != null && mounted) setState(() => _poster = picked);
    } catch (e) {
      if (mounted) _toast('Could not pick the poster. $e', isError: true);
    } finally {
      if (mounted) setState(() => _posterBusy = false);
    }
  }

  void _addPlan() {
    final previous = _plans.isEmpty ? null : _plans.last;
    final next = _Plan(
      theatreId: previous?.theatreId ?? (_theatres.isNotEmpty ? _theatres.first['id']?.toString() : null),
      auditoriumId: null,
      date: previous?.date,
      time: previous == null
          ? const TimeOfDay(hour: 18, minute: 0)
          : TimeOfDay(hour: (previous.time.hour + 3) % 24, minute: previous.time.minute),
    );
    if (previous != null) next.ensurePrices(_categories, seed: previous.snapshotPrices());
    setState(() => _plans.add(next));
    if (next.theatreId != null) _loadAuditoriums(next.theatreId!);
  }

  void _removePlan(_Plan plan) {
    if (_plans.length == 1) return;
    setState(() => _plans.remove(plan));
    plan.dispose();
  }

  void _toast(String message, {bool isError = false}) {
    if (!mounted) return;
    AppToast.show(
      context,
      message,
      type: isError ? AppToastType.error : AppToastType.success,
    );
  }

  String _slugFor(String title) {
    final base = title
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    final suffix = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
    return '${base.isEmpty ? 'movie' : base}-$suffix';
  }

  Future<void> _save() async {
    final token = widget.token;
    if (token == null || token.isEmpty) {
      _toast('Session expired. Please sign in again.', isError: true);
      return;
    }

    final title = _title.text.trim();
    if (title.isEmpty) {
      _toast('Enter the movie title.', isError: true);
      return;
    }
    final duration = int.tryParse(_duration.text.trim());
    if (duration == null || duration < 20 || duration > 400) {
      _toast('Enter a duration in minutes (20–400).', isError: true);
      return;
    }
    for (final plan in _plans) {
      if (plan.theatreId == null || plan.auditoriumId == null) {
        _toast('Every show needs a theatre and a screen.', isError: true);
        return;
      }
    }

    if (_categories.isEmpty) {
      _toast('No seat categories found. Add them in Seat Builder first.', isError: true);
      return;
    }

    // Price per category, per show: Standard, Premium, Recliner, …
    final planPrices = <_Plan, List<Map<String, dynamic>>>{};
    for (final plan in _plans) {
      final priced = <Map<String, dynamic>>[];
      for (final category in _categories) {
        final id = category is Map ? category['id']?.toString() : null;
        if (id == null) continue;
        final raw = plan.prices[id]?.text.trim() ?? '';
        final value = double.tryParse(raw);
        final name = category['name']?.toString() ?? 'Seat';
        if (value == null || value <= 0) {
          _toast('Enter a valid $name price for every show.', isError: true);
          return;
        }
        priced.add({
          'categoryId': id,
          'amountMinor': (value * 100).round(),
          'currency': 'INR',
        });
      }
      if (priced.isEmpty) {
        _toast('Enter at least one ticket price.', isError: true);
        return;
      }
      planPrices[plan] = priced;
    }

    setState(() => _saving = true);

    var createdShows = 0;
    final failures = <String>[];

    try {
      final movie = await Api.createMovie(token, {
        'slug': _slugFor(title),
        'title': title,
        'durationMinutes': duration,
        'language': _language.text.trim().isEmpty ? 'English' : _language.text.trim(),
        'certification': _certification.text.trim().isEmpty ? 'UA' : _certification.text.trim(),
        if (_genre.text.trim().isNotEmpty) 'genre': _genre.text.trim(),
        if (_synopsis.text.trim().isNotEmpty) 'synopsis': _synopsis.text.trim(),
        'status': 'published',
      });
      final movieId = movie['id']?.toString();
      if (movieId == null || movieId.isEmpty) {
        throw Exception('the API did not return the new movie id');
      }

      if (_poster != null) {
        await Api.uploadMedia(token, movieId, _poster!, 'poster');
      }

      for (final plan in _plans) {
        final prices = planPrices[plan]!;
        final amountMinor = prices
            .map((p) => p['amountMinor'] as int)
            .reduce((a, b) => a < b ? a : b);
        final start = plan.startsAt;
        final end = start.add(Duration(minutes: duration));
        final closes = start.subtract(const Duration(minutes: 15));
        final now = DateTime.now();
        final opensAt = now.isBefore(closes) ? now : start;
        final closesAt = now.isBefore(closes) ? closes : start;

        if (mounted) {
          setState(() => _progress =
              'Creating show ${createdShows + failures.length + 1} of ${_plans.length}…');
        }

        final theatreName = _theatres
            .firstWhere(
              (t) => t['id']?.toString() == plan.theatreId,
              orElse: () => {'name': 'Theatre'},
            )['name']
            ?.toString();

        try {
          await Api.createShow(token, {
            'movieId': movieId,
            'auditoriumId': plan.auditoriumId,
            'startsAt': start.toIso8601String(),
            'endsAt': end.toIso8601String(),
            'bookingOpensAt': opensAt.toIso8601String(),
            'bookingClosesAt': closesAt.toIso8601String(),
            'status': 'scheduled',
            'defaultPriceMinor': amountMinor,
            'prices': prices,
          });
          createdShows++;
        } catch (e) {
          final reason = e.toString().replaceFirst('Exception: ', '').replaceFirst('Failed to create show: ', '');
          failures.add('$theatreName · ${_timeLabel(plan)}: $reason');
        }
      }

      if (!mounted) return;

      if (failures.isEmpty) {
        _toast('$title created with $createdShows show${createdShows == 1 ? '' : 's'}.');
        Navigator.pop(context, true);
        return;
      }

      if (createdShows == 0) {
        _toast('Movie created, but no shows could be scheduled.', isError: true);
      } else {
        _toast('Movie created with $createdShows show${createdShows == 1 ? '' : 's'}; ${failures.length} failed.', isError: true);
      }
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF1A1A1E),
          title: const Text('Some shows were not scheduled'),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: failures
                  .map((f) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(f, style: const TextStyle(fontSize: 12, color: Color(0xFFE07A52))),
                      ))
                  .toList(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Close'),
            ),
          ],
        ),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        final detail = e.toString().replaceFirst('Exception: ', '');
        _toast('Could not create the movie. $detail', isError: true);
      }
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
          _progress = '';
        });
      }
    }
  }

  String _timeLabel(_Plan plan) {
    final h = plan.time.hour % 12 == 0 ? 12 : plan.time.hour % 12;
    final m = plan.time.minute.toString().padLeft(2, '0');
    final suffix = plan.time.hour < 12 ? 'AM' : 'PM';
    return '${plan.date.day}/${plan.date.month} $h:$m $suffix';
  }

  @override
  Widget build(BuildContext context) {
    const bg = Color(0xFF131315);
    const card = Color(0xFF1A1A1E);
    const line = Color(0xFF2A2A2E);
    const muted = Color(0xFF8E8E96);
    const sand = Color(0xFFFAF6F0);
    const accent = Color(0xFFC85A32);

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        title: const Text('New movie & shows'),
        backgroundColor: bg,
        foregroundColor: sand,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: accent))
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!, style: const TextStyle(color: Color(0xFFE07A52))),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
                  children: [
                    _sectionTitle('Movie', sand, muted),
                    const SizedBox(height: 8),
                    _card(
                      card,
                      line,
                      children: [
                        _field(_title, 'Title', sand, muted, textCapitalization: TextCapitalization.words),
                        Row(
                          children: [
                            Expanded(child: _field(_duration, 'Duration (min)', sand, muted, keyboardType: TextInputType.number)),
                            const SizedBox(width: 10),
                            Expanded(child: _field(_certification, 'Certificate', sand, muted)),
                          ],
                        ),
                        Row(
                          children: [
                            Expanded(child: _field(_language, 'Language', sand, muted)),
                            const SizedBox(width: 10),
                            Expanded(child: _field(_genre, 'Genre', sand, muted)),
                          ],
                        ),
                        _field(_synopsis, 'Synopsis (optional)', sand, muted, maxLines: 3),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            OutlinedButton.icon(
                              onPressed: _posterBusy ? null : _pickPoster,
                              icon: const Icon(TablerIcons.photo, size: 16),
                              label: Text(_poster == null ? 'Pick poster' : 'Replace poster'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: sand,
                                side: const BorderSide(color: line),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                            ),
                            const SizedBox(width: 10),
                            if (_poster != null)
                              Expanded(
                                child: Text(
                                  _poster!.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 11, color: muted),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 22),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _sectionTitle('Shows', sand, muted),
                        Text(
                          '${_plans.length} scheduled',
                          style: const TextStyle(fontSize: 11, color: muted),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ..._plans.map((plan) => _planCard(plan, card, line, muted, sand, accent)),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: _saving ? null : _addPlan,
                      icon: const Icon(TablerIcons.plus, size: 18),
                      label: const Text('Another theatre or timing'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: accent,
                        side: const BorderSide(color: Color(0xFF3A3A42)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ],
                ),
      bottomNavigationBar: _loading || _error != null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _saving ? null : _save,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: accent,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text(
                      _saving
                          ? (_progress.isEmpty ? 'Creating movie…' : _progress)
                          : 'Create movie & ${_plans.length} show${_plans.length == 1 ? '' : 's'}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _sectionTitle(String text, Color sand, Color muted) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: 11,
        letterSpacing: 1.4,
        fontWeight: FontWeight.w700,
        color: muted,
      ),
    );
  }

  Widget _card(Color card, Color line, {required List<Widget> children}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label,
    Color sand,
    Color muted, {
    TextInputType? keyboardType,
    int maxLines = 1,
    TextCapitalization textCapitalization = TextCapitalization.none,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        maxLines: maxLines,
        textCapitalization: textCapitalization,
        style: TextStyle(fontSize: 13, color: sand),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: TextStyle(fontSize: 12, color: muted),
          isDense: true,
        ),
      ),
    );
  }

  Widget _planCard(_Plan plan, Color card, Color line, Color muted, Color sand, Color accent) {
    final screens = _screensFor(plan);
    final loadingScreens = plan.theatreId != null && _loadingAuditoriums.contains(plan.theatreId);
    final selectedScreenExists = screens.any((a) => a['id']?.toString() == plan.auditoriumId);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _timeLabel(plan),
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: sand),
                ),
              ),
              if (_plans.length > 1)
                IconButton(
                  visualDensity: VisualDensity.compact,
                  onPressed: _saving ? null : () => _removePlan(plan),
                  icon: Icon(TablerIcons.x, size: 16, color: muted),
                ),
            ],
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: plan.theatreId,
            isExpanded: true,
            decoration: InputDecoration(labelText: 'Theatre', labelStyle: TextStyle(fontSize: 12, color: muted), isDense: true),
            style: TextStyle(fontSize: 13, color: sand),
            items: _theatres
                .map(
                  (t) => DropdownMenuItem<String>(
                    value: t['id']?.toString(),
                    child: Text(t['name']?.toString() ?? 'Theatre', overflow: TextOverflow.ellipsis),
                  ),
                )
                .toList(),
            onChanged: _saving ? null : (value) => _selectTheatre(plan, value),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: selectedScreenExists ? plan.auditoriumId : null,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: loadingScreens ? 'Screen (loading…)' : 'Screen',
              labelStyle: TextStyle(fontSize: 12, color: muted),
              isDense: true,
              helperText: screens.isEmpty && !loadingScreens ? 'No screens yet — add one in Seat Builder' : null,
              helperStyle: const TextStyle(fontSize: 10, color: Color(0xFFE0B95A)),
            ),
            style: TextStyle(fontSize: 13, color: sand),
            items: screens
                .map(
                  (a) => DropdownMenuItem<String>(
                    value: a['id']?.toString(),
                    child: Text(a['name']?.toString() ?? 'Screen', overflow: TextOverflow.ellipsis),
                  ),
                )
                .toList(),
            onChanged: (screens.isEmpty || _saving) ? null : (value) => setState(() => plan.auditoriumId = value),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _saving ? null : () => _pickDate(plan),
                  icon: const Icon(TablerIcons.calendar, size: 14),
                  label: Text('${plan.date.day}/${plan.date.month}/${plan.date.year}', style: const TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: sand,
                    side: BorderSide(color: line),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _saving ? null : () => _pickTime(plan),
                  icon: const Icon(TablerIcons.clock, size: 14),
                  label: Text(_timeLabel(plan).split(' ').sublist(1).join(' '), style: const TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: sand,
                    side: BorderSide(color: line),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'TICKET PRICES',
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w700,
              color: muted,
            ),
          ),
          if (_categories.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'No seat categories yet — add them in Seat Builder.',
                style: TextStyle(fontSize: 11, color: muted),
              ),
            )
          else
            ..._categories.map((category) {
              final id = category is Map ? category['id']?.toString() : null;
              if (id == null) return const SizedBox.shrink();
              final controller = plan.prices[id];
              if (controller == null) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        category['name']?.toString() ?? 'Seat',
                        style: TextStyle(fontSize: 12, color: sand),
                      ),
                    ),
                    SizedBox(
                      width: 120,
                      child: TextField(
                        controller: controller,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: TextStyle(fontSize: 13, color: sand),
                        decoration: const InputDecoration(
                          isDense: true,
                          prefixText: '₹ ',
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}
