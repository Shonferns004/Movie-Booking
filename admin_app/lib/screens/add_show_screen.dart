import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api.dart';
import '../widgets/skeleton.dart';

class AddShowSheet extends StatefulWidget {
  final String? token;
  const AddShowSheet({super.key, this.token});

  @override
  State<AddShowSheet> createState() => _AddShowSheetState();
}

class _AddShowSheetState extends State<AddShowSheet> {
  String? _token;
  final _titleCtrl = TextEditingController();
  final _trailerCtrl = TextEditingController();
  final _dateCtrl = TextEditingController(text: '2026-10-31');
  final _timeCtrl = TextEditingController(text: '09:30 PM');

  XFile? _pickedThumb;

  List<dynamic> _theatres = [];
  List<dynamic> _auditoriums = [];
  String? _theatreId;
  String? _auditoriumId;
  List<dynamic> _categories = [];

  bool _submitting = false;
  bool _loadingOptions = true;
  bool _loadingAuditoriums = false;

  @override
  void initState() {
    super.initState();
    _token = widget.token;
    _init();
  }

  Future<void> _init() async {
    if (_token == null) {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString('token');
    }
    await _loadTheatres();
    await _loadCategories();
    if (mounted) setState(() => _loadingOptions = false);
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
    if (_token == null || _theatreId == null) {
      if (mounted) setState(() => _loadingAuditoriums = false);
      return;
    }
    if (mounted) setState(() => _loadingAuditoriums = true);
    try {
      final a = await Api.getAuditoriums(_token!, _theatreId!);
      setState(() => _auditoriums = a);
      if (a.isNotEmpty && _auditoriumId == null) {
        _auditoriumId = a[0]['id'];
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingAuditoriums = false);
    }
  }

  Future<void> _loadCategories() async {
    if (_token == null) return;
    try {
      final c = await Api.getCategories(_token!);
      setState(() => _categories = c);
    } catch (_) {}
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
    if (t != null && mounted) {
      _timeCtrl.text = t.format(context);
    }
  }

  DateTime? _parseStartDateTime() {
    final date = DateTime.tryParse(_dateCtrl.text.trim());
    if (date == null) return null;
    final normalized = _timeCtrl.text.trim().replaceAll(RegExp(r'\s+'), ' ');
    final match = RegExp(
      r'^(\d{1,2}):(\d{2})\s*([AP]M)?$',
      caseSensitive: false,
    ).firstMatch(normalized);
    if (match == null) return null;
    var hour = int.parse(match.group(1)!);
    final minute = int.parse(match.group(2)!);
    final suffix = match.group(3)?.toUpperCase();
    if (suffix == 'PM' && hour != 12) hour += 12;
    if (suffix == 'AM' && hour == 12) hour = 0;
    return DateTime(date.year, date.month, date.day, hour, minute);
  }

  Future<void> _create() async {
    if (_token == null) return;
    setState(() => _submitting = true);
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
        'status': 'published',
        'trailerUrl': _trailerCtrl.text.trim().isEmpty
            ? null
            : _trailerCtrl.text.trim(),
      });
      if (_pickedThumb != null) {
        await Api.uploadMedia(_token!, movie['id'], _pickedThumb!, 'poster');
      }
      final startsAt = _parseStartDateTime() ?? DateTime.now();
      final endsAt = startsAt.add(Duration(minutes: duration));
      final prices = _categories
          .map((c) => {'categoryId': c['id'], 'amountMinor': 25000})
          .toList();
      final createdShow = await Api.createShow(_token!, {
        'movieId': movie['id'],
        'auditoriumId': _auditoriumId,
        'startsAt': startsAt.toIso8601String(),
        'endsAt': endsAt.toIso8601String(),
        'bookingOpensAt': startsAt.toIso8601String(),
        'bookingClosesAt': startsAt.toIso8601String(),
        'status': 'active',
        'prices': prices,
      });
      var isActive =
          createdShow['status']?.toString().toLowerCase() == 'active';
      final createdId = createdShow['id']?.toString();
      if (!isActive && createdId != null) {
        try {
          await Api.updateShow(_token!, createdId, {'status': 'active'});
          isActive = true;
        } catch (_) {
          // The show exists; activation can be retried from Edit Show.
        }
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              isActive
                  ? 'Show created'
                  : 'Show created. Activate it from Edit Show.',
            ),
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const sumi850 = Color(0xFF17171a);
    const sumi800 = Color(0xFF1b1b1d);
    const sumi600 = Color(0xFF2a2a2e);
    const sumi500 = Color(0xFF333338);
    const sumi400 = Color(0xFF52525a);
    const sumi300 = Color(0xFF8e8e96);
    const sand = Color(0xFFFAF6F0);
    const terracotta = Color(0xFFC85A32);

    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF131315),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: Color(0xFF2a2a2e))),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // drag handle
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 4),
            child: Container(
              width: 32,
              height: 4,
              decoration: BoxDecoration(
                color: sumi500,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          // header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Add New Movie',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: sand,
                      ),
                    ),
                    const Text(
                      'Publish a new movie',
                      style: TextStyle(
                        fontSize: 11,
                        color: sumi300,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                InkWell(
                  onTap: () => Navigator.pop(context),
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: sumi800,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: sumi600),
                    ),
                    child: const Icon(Icons.close, size: 14, color: sumi300),
                  ),
                ),
              ],
            ),
          ),
          Container(height: 1, color: sumi600),
          // scrollable form
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // title
                  _fieldLabel('Movie Title', sumi300),
                  const SizedBox(height: 4),
                  _input(
                    _titleCtrl,
                    'Movie title',
                    sumi850,
                    sumi600,
                    sand,
                    sumi400,
                  ),
                  const SizedBox(height: 12),
                  // thumbnail picker
                  Container(
                    decoration: BoxDecoration(
                      color: sumi850,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: sumi600,
                        style: BorderStyle.solid,
                      ),
                    ),
                    padding: const EdgeInsets.symmetric(
                      vertical: 10,
                      horizontal: 12,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: sumi800,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Icon(
                            Icons.image,
                            size: 16,
                            color: terracotta,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Click to upload or drag & drop',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: sand,
                              ),
                            ),
                            const Text(
                              'SVG, PNG, JPG or WebP • 16:9 (max 5MB)',
                              style: TextStyle(fontSize: 10, color: sumi400),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (_pickedThumb != null) ...[
                    const SizedBox(height: 8),
                    Image.file(File(_pickedThumb!.path), height: 80),
                  ],
                  InkWell(
                    onTap: () async {
                      final messenger = ScaffoldMessenger.of(context);
                      try {
                        final picker = ImagePicker();
                        final img = await picker.pickImage(
                          source: ImageSource.gallery,
                          imageQuality: 80,
                        );
                        if (img != null) setState(() => _pickedThumb = img);
                      } catch (e) {
                        if (!mounted) return;
                        messenger.showSnackBar(
                          SnackBar(content: Text('Gallery error: $e')),
                        );
                      }
                    },
                    child: const SizedBox(height: 4),
                  ),
                  const SizedBox(height: 12),
                  // trailer url
                  _fieldLabel('Trailer URL (optional)', sumi300),
                  const SizedBox(height: 4),
                  _input(
                    _trailerCtrl,
                    'Trailer URL (optional)',
                    sumi850,
                    sumi600,
                    sand,
                    sumi400,
                  ),
                  const SizedBox(height: 12),
                  // date & time grid
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _fieldLabel('Show Date', sumi300),
                            const SizedBox(height: 4),
                            _pickerBox(
                              _dateCtrl,
                              Icons.calendar_today,
                              _pickDate,
                              sumi850,
                              sumi600,
                              sand,
                              sumi400,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _fieldLabel('Show Time', sumi300),
                            const SizedBox(height: 4),
                            _pickerBox(
                              _timeCtrl,
                              Icons.access_time,
                              _pickTime,
                              sumi850,
                              sumi600,
                              sand,
                              sumi400,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // theatre
                  _fieldLabel('Theatre', sumi300),
                  const SizedBox(height: 4),
                  if (_loadingOptions)
                    _optionSkeleton(sumi850, sumi600)
                  else
                    _dropdownBox(
                      DropdownButton<String>(
                        value: _theatreId,
                        isExpanded: true,
                        underline: const SizedBox(),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: sand,
                        ),
                        dropdownColor: sumi800,
                        items: _theatres
                            .map(
                              (t) => DropdownMenuItem(
                                value: t['id'] as String,
                                child: Text(t['name'] ?? ''),
                              ),
                            )
                            .toList(),
                        onChanged: (v) async {
                          setState(() {
                            _theatreId = v;
                            _auditoriumId = null;
                            _auditoriums = [];
                          });
                          await _loadAuditoriums();
                          setState(() {});
                        },
                      ),
                      sumi850,
                      sumi600,
                    ),
                  const SizedBox(height: 10),
                  // auditorium
                  _fieldLabel('Auditorium', sumi300),
                  const SizedBox(height: 4),
                  if (_loadingOptions || _loadingAuditoriums)
                    _optionSkeleton(sumi850, sumi600)
                  else
                    _dropdownBox(
                      DropdownButton<String>(
                        value: _auditoriumId,
                        isExpanded: true,
                        underline: const SizedBox(),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: sand,
                        ),
                        dropdownColor: sumi800,
                        items: _auditoriums
                            .map(
                              (a) => DropdownMenuItem(
                                value: a['id'] as String,
                                child: Text(a['name'] ?? ''),
                              ),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => _auditoriumId = v),
                      ),
                      sumi850,
                      sumi600,
                    ),
                ],
              ),
            ),
          ),
          // footer
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: sumi600)),
            ),
            child: Column(
              children: [
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _create,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: terracotta,
                      foregroundColor: sand,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                    child: Text(
                      _submitting ? 'Adding...' : 'Add Movie',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: () => Navigator.pop(context),
                    style: TextButton.styleFrom(foregroundColor: sumi300),
                    child: const Text(
                      'Cancel',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _fieldLabel(String text, Color color) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: color,
        letterSpacing: 0.5,
      ),
    );
  }

  Widget _input(
    TextEditingController ctrl,
    String placeholder,
    Color bg,
    Color border,
    Color text,
    Color hint,
  ) {
    return TextField(
      controller: ctrl,
      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: text),
      decoration: InputDecoration(
        hintText: placeholder,
        hintStyle: TextStyle(fontSize: 12, color: hint),
        filled: true,
        fillColor: bg,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Color(0xFFC85A32)),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
    );
  }

  Widget _pickerBox(
    TextEditingController ctrl,
    IconData icon,
    VoidCallback onTap,
    Color bg,
    Color border,
    Color text,
    Color hint,
  ) {
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                ctrl.text.isEmpty ? 'Select' : ctrl.text,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: text,
                ),
              ),
            ),
            Icon(icon, size: 14, color: hint),
          ],
        ),
      ),
    );
  }

  Widget _dropdownBox(Widget dropdown, Color bg, Color border) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: border),
      ),
      child: dropdown,
    );
  }

  Widget _optionSkeleton(Color bg, Color border) {
    return Container(
      height: 45,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: border),
      ),
      child: const Align(
        alignment: Alignment.centerLeft,
        child: SkeletonPulse(child: SkeletonBox(width: 118, height: 10)),
      ),
    );
  }
}
