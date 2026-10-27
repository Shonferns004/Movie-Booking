import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import '../services/api.dart';
import '../widgets/app_toast.dart';
import '../widgets/skeleton.dart';

class ShowDetailScreen extends StatefulWidget {
  final String showId;
  final String? token;
  const ShowDetailScreen({super.key, required this.showId, this.token});

  @override
  State<ShowDetailScreen> createState() => _ShowDetailScreenState();
}

class _ShowDetailScreenState extends State<ShowDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<dynamic> _seats = [];
  List<dynamic> _bookings = [];
  List<Widget>? _seatRows;
  Map<String, dynamic>? _show;
  bool _seatsLoading = true;
  bool _bookingsLoading = true;
  bool _savingShow = false;
  bool _deletingShow = false;
  bool _movieLoading = true;
  bool _pricingLoading = true;
  bool _venueLoading = true;
  bool _auditoriumLoading = false;
  String? _movieTitle;
  String? _movieThumbnailUrl;
  String? _movieStatus;
  String? _error;
  DateTime? _startsAt;
  DateTime? _bookingOpensAt;
  DateTime? _bookingClosesAt;
  String _status = 'scheduled';

  final _movieTitleCtrl = TextEditingController();
  XFile? _pickedPoster;

  List<dynamic> _categories = [];
  final Map<String, TextEditingController> _priceCtrls = {};
  final Map<String, String> _priceLabels = {};
  final Map<String, int> _originalPricesMinor = {};

  List<dynamic> _theatres = [];
  List<dynamic> _venueAuditoriums = [];
  String? _theatreId;
  String? _auditoriumId;
  String? _originalTheatreId;
  String? _originalAuditoriumId;

  @override
  void dispose() {
    _tabs.dispose();
    _movieTitleCtrl.dispose();
    for (final controller in _priceCtrls.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _tabs = TabController(
      length: 3,
      vsync: this,
      animationDuration: const Duration(milliseconds: 220),
    );
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _seatsLoading = true;
      _bookingsLoading = true;
      _movieLoading = true;
      _pricingLoading = true;
      _venueLoading = true;
      _error = null;
      _seatRows = null;
    });
    try {
      final data = await Api.getShowSeats(widget.token!, widget.showId);
      if (!mounted) return;
      setState(() {
        _seats = data['seats'] ?? [];
        _seatRows = null;
        final rawShow = data['show'];
        _show = rawShow is Map ? Map<String, dynamic>.from(rawShow) : null;
        _movieStatus = _show?['movie_status']?.toString() ?? _movieStatus;
        _hydrateShowForm();
        _seatsLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Seats: $e';
        _seatsLoading = false;
      });
    }
    try {
      final all = await Api.getBookings(widget.token!);
      if (!mounted) return;
      setState(() {
        _bookings = all.where((b) => b['show_id'] == widget.showId).toList();
        _bookingsLoading = false;
      });
    } catch (e) {
      // bookings may be forbidden for non-admin; ignore
      if (!mounted) return;
      setState(() => _bookingsLoading = false);
    }
    await _loadCategories();
    await _loadMovieDetails();
    await _loadVenueOptions();
  }

  Future<void> _loadCategories() async {
    final token = widget.token;
    if (token == null || token.isEmpty) {
      if (mounted) setState(() => _pricingLoading = false);
      return;
    }
    try {
      final categories = await Api.getCategories(token);
      if (!mounted) return;
      setState(() {
        _categories = categories;
        _pricingLoading = false;
        _hydratePriceEditors();
      });
    } catch (_) {
      if (mounted) setState(() => _pricingLoading = false);
    }
  }

  Future<void> _loadMovieDetails() async {
    final token = widget.token;
    final movieId = _show?['movie_id']?.toString();
    if (token == null || token.isEmpty || movieId == null) {
      if (mounted) setState(() => _movieLoading = false);
      return;
    }
    try {
      final movie = await Api.getMovie(token, movieId);
      if (!mounted) return;
      final title = movie['title']?.toString() ?? '';
      String? poster;
      final media = movie['media'];
      if (media is List) {
        for (final item in media) {
          if (item is Map &&
              item['media_type']?.toString() == 'poster' &&
              item['url'] != null) {
            poster = item['url'].toString();
            break;
          }
        }
      }
      poster ??= movie['thumbnail_url']?.toString();
      setState(() {
        if (title.isNotEmpty) _movieTitle = title;
        _movieThumbnailUrl = poster;
        _movieStatus = movie['status']?.toString() ?? _movieStatus;
        _movieTitleCtrl.text = _movieTitle ?? title;
        _movieLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _movieLoading = false);
    }
  }

  Future<void> _loadVenueOptions() async {
    final token = widget.token;
    final currentAuditoriumId = _show?['auditorium_id']?.toString();
    if (token == null || token.isEmpty || currentAuditoriumId == null) {
      if (mounted) {
        setState(() {
          _venueLoading = false;
          _originalAuditoriumId = currentAuditoriumId;
          _auditoriumId = currentAuditoriumId;
        });
      }
      return;
    }
    if (mounted) setState(() => _venueLoading = true);
    try {
      final theatres = await Api.getTheatres(token);
      List<dynamic> matchedAuditoriums = [];
      String? matchedTheatreId;

      for (final theatre in theatres) {
        if (theatre is! Map) continue;
        final id = theatre['id']?.toString();
        if (id == null || id.isEmpty) continue;
        List<dynamic> auditoriums = [];
        try {
          auditoriums = await Api.getAuditoriums(token, id);
        } catch (_) {}
        if (_containsAuditorium(auditoriums, currentAuditoriumId)) {
          matchedTheatreId = id;
          matchedAuditoriums = auditoriums;
          break;
        }
      }

      if (matchedTheatreId == null && theatres.isNotEmpty) {
        final first = theatres.first;
        if (first is Map) {
          matchedTheatreId = first['id']?.toString();
          if (matchedTheatreId != null && matchedTheatreId.isNotEmpty) {
            try {
              matchedAuditoriums = await Api.getAuditoriums(
                token,
                matchedTheatreId,
              );
            } catch (_) {}
          }
        }
        if (!_containsAuditorium(matchedAuditoriums, currentAuditoriumId)) {
          matchedAuditoriums = [
            {'id': currentAuditoriumId, 'name': 'Current screen'},
            ...matchedAuditoriums,
          ];
        }
      }

      if (!mounted) return;
      setState(() {
        _theatres = theatres;
        _venueAuditoriums = matchedAuditoriums;
        _theatreId = matchedTheatreId;
        _auditoriumId = currentAuditoriumId;
        _originalTheatreId = matchedTheatreId;
        _originalAuditoriumId = currentAuditoriumId;
        _venueLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _venueLoading = false);
    }
  }

  Future<void> _loadAuditoriumsForTheatre(
    String theatreId, {
    String? selectId,
  }) async {
    final token = widget.token;
    if (token == null || token.isEmpty) return;
    setState(() {
      _auditoriumLoading = true;
      _venueAuditoriums = [];
      _auditoriumId = null;
    });
    try {
      final auditoriums = await Api.getAuditoriums(token, theatreId);
      if (!mounted) return;
      String? selected;
      if (selectId != null && _containsAuditorium(auditoriums, selectId)) {
        selected = selectId;
      } else if (auditoriums.isNotEmpty && auditoriums.first is Map) {
        selected = (auditoriums.first as Map)['id']?.toString();
      }
      setState(() {
        _venueAuditoriums = auditoriums;
        _auditoriumId = selected;
        _auditoriumLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _auditoriumLoading = false);
    }
  }

  bool _containsAuditorium(List<dynamic> auditoriums, String id) {
    return auditoriums.any(
      (auditorium) => auditorium is Map && auditorium['id']?.toString() == id,
    );
  }

  Future<void> _confirmDelete() async {
    if (_deletingShow) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A1E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text(
          'Delete this show?',
          style: TextStyle(
            color: Color(0xFFF5EFEB),
            fontSize: 17,
            fontWeight: FontWeight.w700,
          ),
        ),
        content: const Text(
          'This cancels the show, its bookings, and releases its seats. This cannot be undone.',
          style: TextStyle(color: Color(0xFF9E9890), fontSize: 12, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text(
              'CANCEL',
              style: TextStyle(color: Color(0xFF9E9890)),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text(
              'DELETE',
              style: TextStyle(color: Color(0xFFD96B43)),
            ),
          ),
        ],
      ),
    );
    if (confirmed == true) await _delete();
  }

  Future<void> _delete() async {
    if (_deletingShow) return;
    setState(() => _deletingShow = true);
    try {
      await Api.deleteShow(widget.token!, widget.showId);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      setState(() => _deletingShow = false);
      _showSnack(
        'Could not delete show. ${e.toString().replaceFirst('Exception: ', '')}',
        type: AppToastType.error,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121214),
      appBar: AppBar(
        title: Text(
          _movieTitle ?? _show?['movie_title']?.toString() ?? 'SHOW DETAILS',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            color: Color(0xFFF5EFEB),
          ),
        ),
        bottom: TabBar(
          controller: _tabs,
          labelColor: const Color(0xFFF5EFEB),
          unselectedLabelColor: const Color(0xFF9E9890),
          indicatorColor: const Color(0xFFD96B43),
          tabs: const [
            Tab(text: 'Seats'),
            Tab(text: 'Collection'),
            Tab(text: 'Edit Show'),
          ],
        ),
      ),
      body: SafeArea(
        child: TabBarView(
          controller: _tabs,
          physics: const PageScrollPhysics(parent: ClampingScrollPhysics()),
          children: [
            // Seats
            _seatsLoading
                ? _buildSeatsLoading()
                : _error != null
                ? Center(child: Text(_error!))
                : _seats.isEmpty
                ? const Center(child: Text('No seats'))
                : Column(
                    children: [
                      const SizedBox(height: 26),
                      _buildScreenHeader(),
                      const SizedBox(height: 14),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                          child: Align(
                            alignment: Alignment.topCenter,
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.topCenter,
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.center,
                                children: _getSeatRows(),
                              ),
                            ),
                          ),
                        ),
                      ),
                      // legend + pricing
                      _buildSeatDock(),
                    ],
                  ),
            // Collection
            _bookingsLoading
                ? _buildCollectionLoading()
                : _buildCollectionTab(),
            // Edit Show
            _buildEditShowTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildScreenHeader() {
    return const Center(
      child: SizedBox(
        width: 160,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 160,
              height: 2,
              child: DecoratedBox(
                decoration: BoxDecoration(color: Color(0xFF71717A)),
              ),
            ),
            SizedBox(height: 5),
            Text(
              'CINEMA SCREEN THIS WAY',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 9,
                letterSpacing: 1.5,
                color: Color(0xFF9E9890),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSeatsLoading() {
    return Column(
      children: [
        const SizedBox(height: 26),
        _buildScreenHeader(),
        const SizedBox(height: 14),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Align(
              alignment: Alignment.topCenter,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.topCenter,
                child: SeatSkeleton(
                  rows: _skeletonRowCount,
                  seatsPerRow: _skeletonSeatsPerRow,
                ),
              ),
            ),
          ),
        ),
        _buildFooterSkeleton(),
      ],
    );
  }

  Widget _buildFooterSkeleton() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      decoration: const BoxDecoration(
        color: Color(0xFF1A1A1E),
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(top: BorderSide(color: Color(0xFF2C2C32))),
      ),
      child: SkeletonPulse(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                SkeletonBox(width: 82, height: 8),
                Spacer(),
                SkeletonBox(
                  width: 58,
                  height: 16,
                  borderRadius: BorderRadius.all(Radius.circular(999)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                SkeletonBox(
                  width: 64,
                  height: 17,
                  borderRadius: BorderRadius.all(Radius.circular(999)),
                ),
                SkeletonBox(
                  width: 60,
                  height: 17,
                  borderRadius: BorderRadius.all(Radius.circular(999)),
                ),
                SkeletonBox(
                  width: 64,
                  height: 17,
                  borderRadius: BorderRadius.all(Radius.circular(999)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              decoration: BoxDecoration(
                color: const Color(0xFF141416),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFF2C2C32)),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      SkeletonBox(
                        width: 64,
                        height: 18,
                        borderRadius: BorderRadius.all(Radius.circular(999)),
                      ),
                      Spacer(),
                      SkeletonBox(width: 42, height: 10),
                    ],
                  ),
                  SizedBox(height: 10),
                  Row(
                    children: [
                      SkeletonBox(
                        width: 40,
                        height: 12,
                        borderRadius: BorderRadius.all(Radius.circular(999)),
                      ),
                      SizedBox(width: 6),
                      Expanded(child: SkeletonBox(height: 9)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCollectionTab() {
    final bookedSeats = _seats
        .where((seat) => seat['status'] == 'booked')
        .length;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        _buildCollectionSummary(bookedSeats),
        const SizedBox(height: 24),
        _buildSectionHeader('BOOKINGS', '${_bookings.length} RECORDS'),
        const SizedBox(height: 10),
        if (_bookings.isEmpty)
          _buildEmptyState(
            icon: Icons.receipt_long_outlined,
            title: 'No bookings yet',
            message: 'Bookings for this show will appear here as soon as tickets are sold.',
          )
        else
          for (var i = 0; i < _bookings.length; i++)
            _buildBookingCard(_bookings[i]),
      ],
    );
  }

  Widget _buildCollectionSummary(int bookedSeats) {
    final currency = _bookings.isEmpty
        ? 'INR'
        : (_bookings.first['currency']?.toString() ?? 'INR');
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1E),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFF2C2C32)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'TOTAL COLLECTION',
                style: TextStyle(
                  fontSize: 9,
                  letterSpacing: 1.3,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF9E9890),
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFF222226),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: const Color(0xFF2C2C32)),
                ),
                child: Text(
                  'THIS SHOW',
                  style: GoogleFonts.spaceMono(
                    fontSize: 7.5,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFFD8C7A5),
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            _formatMinor(_collectionTotalMinor, currency),
            style: GoogleFonts.spaceMono(
              fontSize: 28,
              fontWeight: FontWeight.w700,
              color: const Color(0xFFF5EFEB),
              height: 1.05,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 16),
          Container(height: 1, color: const Color(0xFF2C2C32)),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _buildSummaryStat('BOOKINGS', '${_bookings.length}'),
              ),
              Container(width: 1, height: 32, color: const Color(0xFF2C2C32)),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(left: 16),
                  child: _buildSummaryStat('SEATS SOLD', '$bookedSeats'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryStat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 8,
            letterSpacing: 1.2,
            fontWeight: FontWeight.w700,
            color: Color(0xFF71717A),
          ),
        ),
        const SizedBox(height: 5),
        Text(
          value,
          style: GoogleFonts.spaceMono(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: const Color(0xFFF5EFEB),
          ),
        ),
      ],
    );
  }

  Widget _buildSectionHeader(String title, String trailing) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 9,
            letterSpacing: 1.4,
            fontWeight: FontWeight.w700,
            color: Color(0xFF9E9890),
          ),
        ),
        Text(
          trailing,
          style: GoogleFonts.spaceMono(
            fontSize: 8.5,
            fontWeight: FontWeight.w500,
            color: const Color(0xFF71717A),
          ),
        ),
      ],
    );
  }

  Widget _buildBookingCard(dynamic booking) {
    final status = booking['status']?.toString();
    final currency = booking['currency']?.toString();
    final reference = (booking['booking_reference'] ?? 'BOOKING').toString();
    final contact =
        (booking['contact_mobile'] ?? booking['contact_email'] ?? '')
            .toString();
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1E),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF2C2C32)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'BOOKING REFERENCE',
                      style: TextStyle(
                        fontSize: 7.5,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF71717A),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      reference,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.spaceMono(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFFF5EFEB),
                        letterSpacing: 0.3,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              _buildStatusPill(status),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _formatMinor(booking['total_minor'], currency),
                style: GoogleFonts.spaceMono(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFFD96B43),
                  letterSpacing: -0.3,
                ),
              ),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text(
                    'CREATED',
                    style: TextStyle(
                      fontSize: 7,
                      letterSpacing: 1,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF71717A),
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _formatDateTime(booking['created_at']),
                    style: GoogleFonts.spaceMono(
                      fontSize: 8.5,
                      color: const Color(0xFF9E9890),
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (contact.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(height: 1, color: const Color(0xFF25252A)),
            const SizedBox(height: 9),
            Row(
              children: [
                const Icon(
                  Icons.person_outline,
                  size: 11,
                  color: Color(0xFF71717A),
                ),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(
                    contact,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 9,
                      color: Color(0xFF9E9890),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildEmptyState({
    required IconData icon,
    required String title,
    required String message,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 36),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1E),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF2C2C32)),
      ),
      child: Column(
        children: [
          Icon(icon, size: 28, color: const Color(0xFF5E5E66)),
          const SizedBox(height: 12),
          Text(
            title,
            textAlign: TextAlign.center,
            style: GoogleFonts.syne(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: const Color(0xFFF5EFEB),
            ),
          ),
          const SizedBox(height: 5),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 10,
              height: 1.4,
              color: Color(0xFF9E9890),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusPill(String? status, {Color? color}) {
    final label = (status ?? 'unknown').toUpperCase();
    final resolvedColor = color ?? _statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: resolvedColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: resolvedColor.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: GoogleFonts.spaceMono(
          fontSize: 7,
          fontWeight: FontWeight.w700,
          color: resolvedColor,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Color _statusColor(String? status) {
    switch ((status ?? '').toLowerCase()) {
      case 'confirmed':
      case 'active':
        return const Color(0xFF8E9E8A);
      case 'pending':
        return const Color(0xFFD8C7A5);
      case 'cancelled':
      case 'refunded':
        return const Color(0xFF9E9890);
      default:
        return const Color(0xFFD96B43);
    }
  }

  int get _collectionTotalMinor {
    var total = 0;
    for (final booking in _bookings) {
      final status = (booking['status'] ?? '').toString().toLowerCase();
      if (status == 'cancelled' || status == 'refunded') continue;
      final amount = booking['total_minor'];
      if (amount is num) total += amount.toInt();
    }
    return total;
  }

  String _formatMinor(dynamic value, [String? currency]) {
    final minor = value is num ? value.toDouble() : 0;
    final amount = minor / 100;
    final text = amount == amount.roundToDouble()
        ? amount.toStringAsFixed(0)
        : amount.toStringAsFixed(2);
    final code = (currency ?? 'INR').toUpperCase();
    final symbol = code.isEmpty || code == 'INR' ? '₹' : '$code ';
    return '$symbol$text';
  }

  String _formatDateTime(dynamic value) {
    final raw = value?.toString();
    if (raw == null || raw.isEmpty) return '—';
    final date = DateTime.tryParse(raw)?.toLocal();
    if (date == null) return raw;
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    final minute = date.minute.toString().padLeft(2, '0');
    final suffix = date.hour >= 12 ? 'PM' : 'AM';
    return '${date.day.toString().padLeft(2, '0')}-'
        '${date.month.toString().padLeft(2, '0')}-${date.year} · '
        '$hour:$minute $suffix';
  }

  Widget _buildCollectionLoading() {
    return SkeletonPulse(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        physics: const NeverScrollableScrollPhysics(),
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A1E),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: const Color(0xFF2C2C32)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SkeletonBox(width: 104, height: 8),
                const SizedBox(height: 16),
                const SkeletonBox(width: 170, height: 32),
                const SizedBox(height: 16),
                Container(height: 1, color: const Color(0xFF2C2C32)),
                const SizedBox(height: 14),
                Row(
                  children: [
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SkeletonBox(width: 54, height: 7),
                          SizedBox(height: 7),
                          SkeletonBox(width: 36, height: 16),
                        ],
                      ),
                    ),
                    Container(
                      width: 1,
                      height: 32,
                      color: const Color(0xFF2C2C32),
                    ),
                    const Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(left: 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SkeletonBox(width: 62, height: 7),
                            SizedBox(height: 7),
                            SkeletonBox(width: 36, height: 16),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const SkeletonBox(width: 72, height: 8),
          const SizedBox(height: 10),
          for (var i = 0; i < 3; i++) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF1A1A1E),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFF2C2C32)),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: SkeletonBox(width: 140, height: 10)),
                      SkeletonBox(width: 62, height: 16),
                    ],
                  ),
                  SizedBox(height: 14),
                  Row(
                    children: [
                      SkeletonBox(width: 88, height: 20),
                      Spacer(),
                      SkeletonBox(width: 78, height: 8),
                    ],
                  ),
                ],
              ),
            ),
            if (i != 2) const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }

  Widget _buildEditShowTab() {
    if (_seatsLoading) return _buildEditShowLoading();
    if (_show == null) return _buildEditUnavailable();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        _buildEditIntro(),
        const SizedBox(height: 14),
        _buildEditCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildEditSectionLabel('MOVIE DETAILS'),
              const SizedBox(height: 10),
              if (_movieLoading)
                _buildMovieDetailsLoading()
              else ...[
                _buildEditFieldLabel('MOVIE NAME'),
                const SizedBox(height: 6),
                TextField(
                  controller: _movieTitleCtrl,
                  enabled: !_savingShow && !_deletingShow,
                  textInputAction: TextInputAction.next,
                  style: GoogleFonts.spaceMono(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFFF5EFEB),
                  ),
                  decoration: _editInputDecoration('Movie title'),
                ),
                const SizedBox(height: 14),
                _buildPosterEditor(),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        _buildEditCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildEditSectionLabel('THEATRE & SCREEN'),
              const SizedBox(height: 10),
              if (_venueLoading)
                _buildVenueLoading()
              else if (_theatres.isEmpty)
                const Text(
                  'No theatres are available for this show.',
                  style: TextStyle(
                    fontSize: 10,
                    height: 1.5,
                    color: Color(0xFF9E9890),
                  ),
                )
              else ...[
                _buildEditFieldLabel('THEATRE'),
                const SizedBox(height: 6),
                _buildEditDropdown<String>(
                  value: _theatreId,
                  hint: 'Select theatre',
                  items: [
                    for (final theatre in _theatres)
                      if (theatre is Map && theatre['id'] != null)
                        DropdownMenuItem(
                          value: theatre['id'].toString(),
                          child: Text(
                            theatre['name']?.toString() ?? 'Theatre',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                  ],
                  onChanged: (value) async {
                    if (value == null || value == _theatreId) return;
                    setState(() => _theatreId = value);
                    await _loadAuditoriumsForTheatre(value);
                  },
                ),
                const SizedBox(height: 12),
                _buildEditFieldLabel('SCREEN'),
                const SizedBox(height: 6),
                if (_auditoriumLoading)
                  _buildDropdownLoading()
                else
                  _buildEditDropdown<String>(
                    value: _auditoriumId,
                    hint: 'Select screen',
                    items: [
                      for (final auditorium in _venueAuditoriums)
                        if (auditorium is Map && auditorium['id'] != null)
                          DropdownMenuItem(
                            value: auditorium['id'].toString(),
                            child: Text(
                              auditorium['name']?.toString() ?? 'Screen',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                    ],
                    onChanged: (value) => setState(() => _auditoriumId = value),
                  ),
                const SizedBox(height: 9),
                const Text(
                  'Changing the screen rebuilds this show\'s seats. It is blocked while active bookings exist.',
                  style: TextStyle(
                    fontSize: 9,
                    height: 1.5,
                    color: Color(0xFF71717A),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF1A1A1E),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFF2C2C32)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildEditSectionLabel('SCREENING TIME'),
              const SizedBox(height: 11),
              _buildEditDateRow(
                label: 'SHOW STARTS',
                value: _startsAt,
                onDate: () => _pickEditDate(
                  _startsAt,
                  (value) => setState(() => _startsAt = value),
                ),
                onTime: () => _pickEditTime(
                  _startsAt,
                  (value) => setState(() => _startsAt = value),
                ),
              ),
              const SizedBox(height: 20),
              Container(height: 1, color: const Color(0xFF25252A)),
              const SizedBox(height: 18),
              _buildEditSectionLabel('BOOKING WINDOW'),
              const SizedBox(height: 11),
              _buildEditDateRow(
                label: 'BOOKING OPENS',
                value: _bookingOpensAt,
                onDate: () => _pickEditDate(
                  _bookingOpensAt,
                  (value) => setState(() => _bookingOpensAt = value),
                ),
                onTime: () => _pickEditTime(
                  _bookingOpensAt,
                  (value) => setState(() => _bookingOpensAt = value),
                ),
              ),
              const SizedBox(height: 14),
              _buildEditDateRow(
                label: 'BOOKING CLOSES',
                value: _bookingClosesAt,
                onDate: () => _pickEditDate(
                  _bookingClosesAt,
                  (value) => setState(() => _bookingClosesAt = value),
                ),
                onTime: () => _pickEditTime(
                  _bookingClosesAt,
                  (value) => setState(() => _bookingClosesAt = value),
                ),
              ),
              const SizedBox(height: 20),
              Container(height: 1, color: const Color(0xFF25252A)),
              const SizedBox(height: 18),
              _buildEditSectionLabel('SHOW STATUS'),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final option in _statusOptions)
                    _buildEditStatusOption(option),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        _buildEditCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildEditSectionLabel('SEAT PRICING'),
              const SizedBox(height: 7),
              const Text(
                'Price per seat for each category in the current screen.',
                style: TextStyle(
                  fontSize: 9.5,
                  height: 1.45,
                  color: Color(0xFF9E9890),
                ),
              ),
              const SizedBox(height: 13),
              if (_pricingLoading)
                _buildPricingLoading()
              else if (_priceLabels.isEmpty)
                const Text(
                  'No priced seat categories were found for this show.',
                  style: TextStyle(
                    fontSize: 10,
                    height: 1.5,
                    color: Color(0xFF9E9890),
                  ),
                )
              else ...[
                for (final entry in _priceLabels.entries) ...[
                  _buildPriceRow(entry.key, entry.value),
                  if (entry.key != _priceLabels.keys.last)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Container(
                        height: 1,
                        color: const Color(0xFF25252A),
                      ),
                    ),
                ],
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            SizedBox(
              width: 112,
              child: OutlinedButton(
                onPressed: _savingShow || _deletingShow ? null : _resetEditForm,
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF9E9890),
                  disabledForegroundColor: const Color(0xFF52525A),
                  side: const BorderSide(color: Color(0xFF2C2C32)),
                  shape: const StadiumBorder(),
                  padding: const EdgeInsets.symmetric(vertical: 15),
                ),
                child: Text(
                  'RESET',
                  style: GoogleFonts.spaceMono(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.9,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ElevatedButton(
                onPressed: _savingShow || _deletingShow ? null : _saveShow,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFD96B43),
                  foregroundColor: const Color(0xFFF5EFEB),
                  disabledBackgroundColor: const Color(0xFF3A2A24),
                  disabledForegroundColor: const Color(0xFF9E9890),
                  elevation: 0,
                  shape: const StadiumBorder(),
                  padding: const EdgeInsets.symmetric(vertical: 15),
                ),
                child: _savingShow
                    ? const SizedBox.shrink()
                    : Text(
                        'SAVE CHANGES',
                        style: GoogleFonts.spaceMono(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.9,
                        ),
                      ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          _saveNote,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 9,
            height: 1.4,
            color: Color(0xFF71717A),
          ),
        ),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF1A1A1E),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFF3A2622)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'DANGER ZONE',
                style: TextStyle(
                  fontSize: 8,
                  letterSpacing: 1.3,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFFD96B43),
                ),
              ),
              const SizedBox(height: 7),
              const Text(
                'Deleting this show cancels its bookings and releases its seats. This cannot be undone.',
                style: TextStyle(
                  fontSize: 10,
                  height: 1.5,
                  color: Color(0xFF9E9890),
                ),
              ),
              const SizedBox(height: 13),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _savingShow || _deletingShow
                      ? null
                      : _confirmDelete,
                  icon: _deletingShow
                      ? const SizedBox.shrink()
                      : const Icon(Icons.delete_outline, size: 15),
                  label: Text(
                    _deletingShow ? 'DELETING SHOW' : 'DELETE SHOW',
                    style: GoogleFonts.spaceMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.9,
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFD96B43),
                    disabledForegroundColor: const Color(0xFF7A4A3A),
                    side: const BorderSide(color: Color(0xFF5A3428)),
                    shape: const StadiumBorder(),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildEditIntro() {
    return Container(
      padding: const EdgeInsets.fromLTRB(15, 12, 15, 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1E),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF2C2C32)),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: const Color(0xFFD96B43).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: const Color(0xFFD96B43).withValues(alpha: 0.3),
              ),
            ),
            child: const Icon(
              Icons.edit_calendar_outlined,
              size: 16,
              color: Color(0xFFD96B43),
            ),
          ),
          const SizedBox(width: 11),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'SHOW EDITOR',
                  style: TextStyle(
                    fontSize: 8.5,
                    letterSpacing: 1.3,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF9E9890),
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Movie, screen, pricing, and schedule.',
                  style: TextStyle(fontSize: 10.5, color: Color(0xFFB8B2AC)),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _buildStatusPill(_status, color: _editStatusColor(_status)),
        ],
      ),
    );
  }

  Widget _buildEditSectionLabel(String label) {
    return Text(
      label,
      style: const TextStyle(
        fontSize: 8,
        letterSpacing: 1.3,
        fontWeight: FontWeight.w700,
        color: Color(0xFF71717A),
      ),
    );
  }

  Widget _buildEditCard({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF2C2C32)),
      ),
      child: child,
    );
  }

  Widget _buildEditFieldLabel(String label) {
    return Text(
      label,
      style: const TextStyle(
        fontSize: 7.5,
        letterSpacing: 0.9,
        fontWeight: FontWeight.w600,
        color: Color(0xFF9E9890),
      ),
    );
  }

  InputDecoration _editInputDecoration(String hint, {String? prefixText}) {
    const border = OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
      borderSide: BorderSide(color: Color(0xFF2C2C32)),
    );
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(fontSize: 10.5, color: Color(0xFF71717A)),
      prefixText: prefixText,
      prefixStyle: GoogleFonts.spaceMono(
        fontSize: 10,
        fontWeight: FontWeight.w600,
        color: const Color(0xFF9E9890),
      ),
      filled: true,
      fillColor: const Color(0xFF141416),
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
      border: border,
      enabledBorder: border,
      disabledBorder: border,
      focusedBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(14)),
        borderSide: BorderSide(color: Color(0xFFD96B43)),
      ),
    );
  }

  Widget _buildEditDropdown<T>({
    required T? value,
    required String hint,
    required List<DropdownMenuItem<T>> items,
    required ValueChanged<T?> onChanged,
  }) {
    return Container(
      height: 46,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF141416),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF2C2C32)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: true,
          isDense: true,
          menuMaxHeight: 320,
          borderRadius: BorderRadius.circular(14),
          dropdownColor: const Color(0xFF1B1B1D),
          icon: const Icon(
            Icons.keyboard_arrow_down_rounded,
            size: 18,
            color: Color(0xFF71717A),
          ),
          hint: Text(
            hint,
            style: GoogleFonts.spaceMono(
              fontSize: 10,
              color: const Color(0xFF71717A),
            ),
          ),
          style: GoogleFonts.spaceMono(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: const Color(0xFFF5EFEB),
          ),
          items: items,
          onChanged: _savingShow || _deletingShow ? null : onChanged,
        ),
      ),
    );
  }

  Widget _buildMovieDetailsLoading() {
    return SkeletonPulse(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SkeletonBox(width: 62, height: 6),
          const SizedBox(height: 7),
          const SkeletonBox(
            height: 44,
            borderRadius: BorderRadius.all(Radius.circular(14)),
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SkeletonBox(
                width: 88,
                height: 62,
                borderRadius: BorderRadius.all(Radius.circular(14)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SkeletonBox(width: 48, height: 6),
                    const SizedBox(height: 8),
                    const SkeletonBox(
                      width: 124,
                      height: 32,
                      borderRadius: BorderRadius.all(Radius.circular(999)),
                    ),
                    const SizedBox(height: 7),
                    const SkeletonBox(width: 134, height: 6),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildVenueLoading() {
    return SkeletonPulse(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SkeletonBox(width: 54, height: 6),
          const SizedBox(height: 7),
          const SkeletonBox(
            height: 46,
            borderRadius: BorderRadius.all(Radius.circular(14)),
          ),
          const SizedBox(height: 12),
          const SkeletonBox(width: 44, height: 6),
          const SizedBox(height: 7),
          const SkeletonBox(
            height: 46,
            borderRadius: BorderRadius.all(Radius.circular(14)),
          ),
        ],
      ),
    );
  }

  Widget _buildDropdownLoading() {
    return const SkeletonPulse(
      child: SkeletonBox(
        height: 46,
        borderRadius: BorderRadius.all(Radius.circular(14)),
      ),
    );
  }

  Widget _buildPricingLoading() {
    return SkeletonPulse(
      child: Column(
        children: [
          for (var i = 0; i < 3; i++) ...[
            Row(
              children: [
                const Expanded(child: SkeletonBox(height: 10)),
                const SizedBox(width: 12),
                const SkeletonBox(
                  width: 108,
                  height: 44,
                  borderRadius: BorderRadius.all(Radius.circular(14)),
                ),
              ],
            ),
            if (i != 2) const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }

  Widget _buildPosterEditor() {
    final networkUrl = _mediaUrl(_movieThumbnailUrl);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 88,
          height: 62,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: const Color(0xFF141416),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFF2C2C32)),
          ),
          child: _pickedPoster != null
              ? Image.file(
                  File(_pickedPoster!.path),
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => _posterPlaceholder(),
                )
              : networkUrl != null
              ? Image.network(
                  networkUrl,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                  errorBuilder: (_, _, _) => _posterPlaceholder(),
                )
              : _posterPlaceholder(),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildEditFieldLabel('POSTER'),
              const SizedBox(height: 6),
              OutlinedButton.icon(
                onPressed: _savingShow || _deletingShow ? null : _pickPoster,
                icon: const Icon(Icons.photo_library_outlined, size: 14),
                label: Text(
                  _pickedPoster == null ? 'CHANGE IMAGE' : 'IMAGE READY',
                  style: GoogleFonts.spaceMono(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.7,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFFD96B43),
                  disabledForegroundColor: const Color(0xFF7A4A3A),
                  side: const BorderSide(color: Color(0xFF5A3428)),
                  shape: const StadiumBorder(),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                ),
              ),
              const SizedBox(height: 5),
              Text(
                _pickedPoster == null
                    ? 'Select a new poster from the gallery.'
                    : 'The new poster uploads when you save.',
                style: const TextStyle(
                  fontSize: 8.5,
                  height: 1.4,
                  color: Color(0xFF71717A),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _posterPlaceholder() {
    return const Center(
      child: Icon(
        Icons.movie_creation_outlined,
        size: 20,
        color: Color(0xFF52525A),
      ),
    );
  }

  Widget _buildPriceRow(String categoryId, String label) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFFF5EFEB),
                ),
              ),
              const SizedBox(height: 3),
              const Text(
                'PER SEAT',
                style: TextStyle(
                  fontSize: 7,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF71717A),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 112,
          child: TextField(
            controller: _priceCtrls[categoryId],
            enabled: !_savingShow && !_deletingShow,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.done,
            textAlign: TextAlign.right,
            style: GoogleFonts.spaceMono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: const Color(0xFFF5EFEB),
            ),
            decoration: _editInputDecoration('0', prefixText: '₹ '),
          ),
        ),
      ],
    );
  }

  Widget _buildEditDateRow({
    required String label,
    required DateTime? value,
    required VoidCallback onDate,
    required VoidCallback onTime,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 7.5,
            letterSpacing: 0.9,
            fontWeight: FontWeight.w600,
            color: Color(0xFF9E9890),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              flex: 3,
              child: _buildEditPicker(
                icon: Icons.calendar_today_outlined,
                text: _formatEditDate(value),
                onTap: onDate,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: _buildEditPicker(
                icon: Icons.schedule,
                text: _formatEditTime(value),
                onTap: onTime,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildEditPicker({
    required IconData icon,
    required String text,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 46,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: const Color(0xFF141416),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF2C2C32)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 13, color: const Color(0xFFD96B43)),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.spaceMono(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFFF5EFEB),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEditStatusOption(String option) {
    final selected = _status == option;
    final color = _editStatusColor(option);
    return InkWell(
      onTap: () => setState(() => _status = option),
      borderRadius: BorderRadius.circular(999),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? color.withValues(alpha: 0.16)
              : const Color(0xFF141416),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected
                ? color.withValues(alpha: 0.55)
                : const Color(0xFF2C2C32),
          ),
        ),
        child: Text(
          option.replaceAll('_', ' ').toUpperCase(),
          style: GoogleFonts.spaceMono(
            fontSize: 8.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: selected ? color : const Color(0xFF9E9890),
          ),
        ),
      ),
    );
  }

  Widget _buildEditShowLoading() {
    return SkeletonPulse(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        physics: const NeverScrollableScrollPhysics(),
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(15, 12, 15, 12),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A1E),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFF2C2C32)),
            ),
            child: const Row(
              children: [
                SkeletonCircle(size: 34),
                SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SkeletonBox(width: 92, height: 7),
                      SizedBox(height: 7),
                      SkeletonBox(width: 148, height: 9),
                    ],
                  ),
                ),
                SizedBox(width: 8),
                SkeletonBox(
                  width: 66,
                  height: 22,
                  borderRadius: BorderRadius.all(Radius.circular(999)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A1E),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF2C2C32)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SkeletonBox(width: 88, height: 7),
                const SizedBox(height: 12),
                for (var i = 0; i < 3; i++) ...[
                  const SkeletonBox(width: 64, height: 6),
                  const SizedBox(height: 7),
                  const Row(
                    children: [
                      Expanded(
                        flex: 3,
                        child: SkeletonBox(
                          height: 46,
                          borderRadius: BorderRadius.all(Radius.circular(14)),
                        ),
                      ),
                      SizedBox(width: 8),
                      Expanded(
                        flex: 2,
                        child: SkeletonBox(
                          height: 46,
                          borderRadius: BorderRadius.all(Radius.circular(14)),
                        ),
                      ),
                    ],
                  ),
                  if (i != 2) const SizedBox(height: 14),
                ],
                const SizedBox(height: 18),
                const SkeletonBox(width: 66, height: 7),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (var i = 0; i < 4; i++)
                      const SkeletonBox(
                        width: 78,
                        height: 31,
                        borderRadius: BorderRadius.all(Radius.circular(999)),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Row(
            children: [
              SizedBox(
                width: 112,
                child: SkeletonBox(
                  height: 48,
                  borderRadius: BorderRadius.all(Radius.circular(999)),
                ),
              ),
              SizedBox(width: 10),
              Expanded(
                child: SkeletonBox(
                  height: 48,
                  borderRadius: BorderRadius.all(Radius.circular(999)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEditUnavailable() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.edit_calendar_outlined,
              size: 34,
              color: Color(0xFF5E5E66),
            ),
            const SizedBox(height: 12),
            const Text(
              'Show details unavailable',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: Color(0xFFF5EFEB),
              ),
            ),
            const SizedBox(height: 5),
            const Text(
              'Refresh to try loading the editable fields again.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 10.5,
                height: 1.4,
                color: Color(0xFF9E9890),
              ),
            ),
            const SizedBox(height: 14),
            OutlinedButton(
              onPressed: _load,
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFD96B43),
                side: const BorderSide(color: Color(0xFF2C2C32)),
                shape: const StadiumBorder(),
              ),
              child: Text(
                'RETRY',
                style: GoogleFonts.spaceMono(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<String> get _statusOptions {
    const options = ['scheduled', 'active', 'completed', 'cancelled'];
    if (options.contains(_status)) return options;
    return [...options, _status];
  }

  Color _editStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return const Color(0xFF8E9E8A);
      case 'completed':
      case 'cancelled':
        return const Color(0xFF9E9890);
      case 'scheduled':
        return const Color(0xFFD8C7A5);
      default:
        return const Color(0xFFD96B43);
    }
  }

  void _hydrateShowForm() {
    final show = _show;
    if (show == null) return;
    _startsAt = _parseShowTimestamp(show['starts_at']);
    _bookingOpensAt = _parseShowTimestamp(show['booking_opens_at']);
    _bookingClosesAt = _parseShowTimestamp(show['booking_closes_at']);
    final rawStatus = (show['status'] ?? 'scheduled')
        .toString()
        .trim()
        .toLowerCase();
    _status = rawStatus.isEmpty ? 'scheduled' : rawStatus;
  }

  DateTime? _parseShowTimestamp(dynamic value) {
    final raw = value?.toString();
    if (raw == null || raw.isEmpty) return null;
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) return null;
    return DateTime(
      parsed.year,
      parsed.month,
      parsed.day,
      parsed.hour,
      parsed.minute,
    );
  }

  void _hydratePriceEditors() {
    final priceById = <String, int>{};
    final priceByName = <String, int>{};
    for (final seat in _seats) {
      if (seat is! Map) continue;
      final price = seat['price_minor'];
      if (price is! num) continue;
      final id = seat['category_id']?.toString();
      if (id != null && id.isNotEmpty) {
        priceById.putIfAbsent(id, () => price.toInt());
      }
      final name = seat['category_name']?.toString().trim();
      if (name != null && name.isNotEmpty) {
        priceByName.putIfAbsent(name, () => price.toInt());
      }
    }

    final keep = <String>{};
    for (final category in _categories) {
      if (category is! Map) continue;
      final id = category['id']?.toString();
      final name = category['name']?.toString().trim() ?? '';
      if (id == null || id.isEmpty || name.isEmpty) continue;
      final minor = priceById[id] ?? priceByName[name];
      if (minor == null) continue;
      keep.add(id);
      final controller = _priceCtrls.putIfAbsent(
        id,
        () => TextEditingController(),
      );
      controller.text = _formatPriceInput(minor);
      _priceLabels[id] = _displaySeatType(name);
      _originalPricesMinor[id] = minor;
    }
    for (final id in _priceCtrls.keys.toList()) {
      if (keep.contains(id)) continue;
      _priceCtrls.remove(id)?.dispose();
      _priceLabels.remove(id);
      _originalPricesMinor.remove(id);
    }
  }

  String _formatPriceInput(int minor) {
    final value = minor / 100;
    return value == value.roundToDouble()
        ? value.toStringAsFixed(0)
        : value.toStringAsFixed(2);
  }

  Future<void> _refreshSeatsAfterSave() async {
    final token = widget.token;
    if (token == null || token.isEmpty) return;
    try {
      final data = await Api.getShowSeats(token, widget.showId);
      if (!mounted) return;
      final previousAuditorium = _originalAuditoriumId;
      setState(() {
        _seats = data['seats'] ?? [];
        _seatRows = null;
        final rawShow = data['show'];
        if (rawShow is Map) {
          _show = Map<String, dynamic>.from(rawShow);
          _movieStatus = _show?['movie_status']?.toString() ?? _movieStatus;
          _hydrateShowForm();
          final serverAuditorium = _show?['auditorium_id']?.toString();
          if (serverAuditorium != null && serverAuditorium.isNotEmpty) {
            _originalAuditoriumId = serverAuditorium;
          }
        }
        _hydratePriceEditors();
      });
      final serverAuditorium = _show?['auditorium_id']?.toString();
      if (serverAuditorium != null &&
          previousAuditorium != null &&
          serverAuditorium != previousAuditorium) {
        await _loadVenueOptions();
      }
    } catch (_) {}
  }

  Future<void> _resetEditForm() async {
    final theatreId = _originalTheatreId;
    final auditoriumId = _originalAuditoriumId;
    final canSelectAuditorium =
        auditoriumId != null &&
        _containsAuditorium(_venueAuditoriums, auditoriumId);
    setState(() {
      _hydrateShowForm();
      _movieTitleCtrl.text = _movieTitle ?? '';
      _pickedPoster = null;
      _hydratePriceEditors();
      _theatreId = theatreId;
      _auditoriumId = canSelectAuditorium ? auditoriumId : null;
    });
    if (theatreId == null || canSelectAuditorium) return;
    await _loadAuditoriumsForTheatre(theatreId, selectId: auditoriumId);
  }

  Future<void> _pickPoster() async {
    try {
      final picker = ImagePicker();
      final image = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
      );
      if (image != null && mounted) {
        setState(() => _pickedPoster = image);
      }
    } catch (e) {
      _showSnack('Gallery error: $e');
    }
  }

  String? _mediaUrl(String? raw) {
    final value = raw?.trim();
    if (value == null || value.isEmpty) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    final base = Uri.parse(Api.baseUrl);
    final origin =
        '${base.scheme}://${base.host}${base.hasPort ? ':${base.port}' : ''}';
    return value.startsWith('/') ? '$origin$value' : '$origin/$value';
  }

  Future<void> _pickEditDate(
    DateTime? current,
    ValueChanged<DateTime> apply,
  ) async {
    final seed = current ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: seed,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: const ColorScheme.dark(
            primary: Color(0xFFD96B43),
            onPrimary: Color(0xFFF5EFEB),
            surface: Color(0xFF1A1A1E),
            onSurface: Color(0xFFF5EFEB),
          ),
          datePickerTheme: const DatePickerThemeData(
            backgroundColor: Color(0xFF1A1A1E),
            headerBackgroundColor: Color(0xFF222226),
            headerForegroundColor: Color(0xFFF5EFEB),
          ),
        ),
        child: child!,
      ),
    );
    if (picked == null || !mounted) return;
    apply(
      DateTime(picked.year, picked.month, picked.day, seed.hour, seed.minute),
    );
  }

  Future<void> _pickEditTime(
    DateTime? current,
    ValueChanged<DateTime> apply,
  ) async {
    final seed = current ?? DateTime.now();
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(seed),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: const ColorScheme.dark(
            primary: Color(0xFFD96B43),
            onPrimary: Color(0xFFF5EFEB),
            surface: Color(0xFF1A1A1E),
            onSurface: Color(0xFFF5EFEB),
          ),
          timePickerTheme: const TimePickerThemeData(
            backgroundColor: Color(0xFF1A1A1E),
            dialBackgroundColor: Color(0xFF222226),
            hourMinuteColor: Color(0xFF222226),
          ),
        ),
        child: child!,
      ),
    );
    if (picked == null || !mounted) return;
    apply(
      DateTime(seed.year, seed.month, seed.day, picked.hour, picked.minute),
    );
  }

  Future<void> _saveShow() async {
    final startsAt = _startsAt;
    final bookingOpensAt = _bookingOpensAt;
    final bookingClosesAt = _bookingClosesAt;
    if (startsAt == null || bookingOpensAt == null || bookingClosesAt == null) {
      _showSnack('Select the full screening and booking schedule.');
      return;
    }
    if (bookingClosesAt.isBefore(bookingOpensAt)) {
      _showSnack('Booking close time cannot be before the booking open time.');
      return;
    }
    if (bookingClosesAt.isAfter(startsAt)) {
      _showSnack('Booking must close before the show starts.');
      return;
    }
    final token = widget.token;
    if (token == null || token.isEmpty) {
      _showSnack('Session expired. Please sign in again.');
      return;
    }

    final movieId = _show?['movie_id']?.toString();
    if (movieId == null || movieId.isEmpty) {
      _showSnack('Movie details are unavailable for this show.');
      return;
    }
    final movieTitle = _movieTitleCtrl.text.trim();
    if (movieTitle.isEmpty) {
      _showSnack('Enter the movie name.');
      return;
    }
    final titleChanged = _movieTitle == null || movieTitle != _movieTitle;

    final targetAuditoriumId = _auditoriumId;
    final venueChanged =
        targetAuditoriumId != null &&
        targetAuditoriumId != _originalAuditoriumId;
    if (venueChanged &&
        (_theatreId == null || _venueLoading || _auditoriumLoading)) {
      _showSnack('Wait for the screen list to load, then choose a screen.');
      return;
    }

    final prices = <Map<String, dynamic>>[];
    var pricesChanged = false;
    for (final entry in _priceCtrls.entries) {
      final value = double.tryParse(entry.value.text.trim());
      if (value == null || value <= 0) {
        _showSnack('Enter a valid positive price for every seat category.');
        return;
      }
      final amountMinor = (value * 100).round();
      prices.add({
        'categoryId': entry.key,
        'amountMinor': amountMinor,
        'currency': 'INR',
      });
      if (_originalPricesMinor[entry.key] != amountMinor) {
        pricesChanged = true;
      }
    }

    final shouldSchedulePublish =
        (_movieStatus == 'draft' || _movieStatus == 'pending') &&
        prices.isNotEmpty;

    final originalStart = _parseShowTimestamp(_show?['starts_at']);
    final originalEnd = _parseShowTimestamp(_show?['ends_at']);
    var duration = const Duration(minutes: 120);
    if (originalStart != null &&
        originalEnd != null &&
        originalEnd.isAfter(originalStart)) {
      duration = originalEnd.difference(originalStart);
    }
    final endsAt = startsAt.add(duration);

    final payload = <String, dynamic>{
      'startsAt': startsAt.toIso8601String(),
      'endsAt': endsAt.toIso8601String(),
      'bookingOpensAt': bookingOpensAt.toIso8601String(),
      'bookingClosesAt': bookingClosesAt.toIso8601String(),
      'status': _status,
      if (venueChanged) 'auditoriumId': targetAuditoriumId,
      if (pricesChanged && prices.isNotEmpty) 'prices': prices,
    };

    setState(() => _savingShow = true);
    var showSaved = false;
    try {
      await Api.updateShow(token, widget.showId, payload);
      showSaved = true;
      if (!mounted) return;
      setState(() {
        _show = {
          ...?_show,
          'starts_at': payload['startsAt'],
          'ends_at': payload['endsAt'],
          'booking_opens_at': payload['bookingOpensAt'],
          'booking_closes_at': payload['bookingClosesAt'],
          'status': _status,
          if (venueChanged) 'auditorium_id': targetAuditoriumId,
        };
        if (venueChanged) {
          _originalAuditoriumId = targetAuditoriumId;
          if (_theatreId != null) _originalTheatreId = _theatreId;
        }
      });

      final moviePayload = <String, dynamic>{
        if (titleChanged) 'title': movieTitle,
        if (shouldSchedulePublish) 'status': 'pending',
      };
      if (moviePayload.isNotEmpty) {
        await Api.updateMovie(token, movieId, moviePayload);
        if (mounted) {
          setState(() {
            if (titleChanged) _movieTitle = movieTitle;
            if (shouldSchedulePublish) _movieStatus = 'pending';
          });
        }
      }
      if (_pickedPoster != null) {
        final uploaded = await Api.uploadMedia(
          token,
          movieId,
          _pickedPoster!,
          'poster',
        );
        if (mounted && uploaded != null && uploaded.isNotEmpty) {
          setState(() => _movieThumbnailUrl = uploaded);
        }
      }
      if (mounted) setState(() => _pickedPoster = null);
      _showSnack(
        shouldSchedulePublish
            ? 'Seat prices saved. This movie goes live in 10 minutes.'
            : 'Show updated successfully.',
        type: AppToastType.success,
      );
    } catch (e) {
      if (mounted) {
        final detail = e.toString().replaceFirst('Exception: ', '');
        _showSnack(
          showSaved
              ? 'Show saved, but movie details could not be updated. $detail'
              : 'Could not save changes. $detail',
          type: AppToastType.error,
        );
      }
    } finally {
      if (mounted && showSaved && (venueChanged || pricesChanged)) {
        await _refreshSeatsAfterSave();
      }
      if (mounted) setState(() => _savingShow = false);
    }
  }

  void _showSnack(String message, {AppToastType? type}) {
    if (!mounted) return;
    AppToast.show(context, message, type: type ?? _toastTypeFor(message));
  }

  AppToastType _toastTypeFor(String message) {
    final lower = message.toLowerCase();
    if (lower.contains('saved') ||
        lower.contains('success') ||
        lower.contains('updated') ||
        lower.contains('live') ||
        lower.contains('deleted')) {
      return AppToastType.success;
    }
    if (lower.contains('error') ||
        lower.contains('could not') ||
        lower.contains('expired') ||
        lower.contains('invalid') ||
        lower.contains('select') ||
        lower.contains('enter') ||
        lower.contains('unavailable') ||
        lower.contains('cannot') ||
        lower.contains('must') ||
        lower.contains('wait')) {
      return AppToastType.error;
    }
    return AppToastType.info;
  }

  String get _saveNote {
    if (_movieStatus == 'draft') {
      return 'Saving seat prices keeps this movie hidden for 10 minutes, then publishes it automatically.';
    }
    if (_movieStatus == 'pending') {
      return 'This movie goes live automatically within 10 minutes of its last price save.';
    }
    return 'Movie, screen, pricing, schedule, and booking window updates are applied immediately.';
  }

  String _formatEditDate(DateTime? value) {
    if (value == null) return 'Select date';
    return '${value.day.toString().padLeft(2, '0')}-'
        '${value.month.toString().padLeft(2, '0')}-${value.year}';
  }

  String _formatEditTime(DateTime? value) {
    if (value == null) return 'Select time';
    final hour = value.hour % 12 == 0 ? 12 : value.hour % 12;
    final minute = value.minute.toString().padLeft(2, '0');
    final suffix = value.hour >= 12 ? 'PM' : 'AM';
    return '$hour:$minute $suffix';
  }

  static const Map<String, Color> _seatTypeColors = {
    'standard': Color(0xFF8B8B93),
    'classic': Color(0xFF8B8B93),
    'premium': Color(0xFFD96B43),
    'prime': Color(0xFFD96B43),
    'recliner': Color(0xFF8B5CF6),
    'wheelchair': Color(0xFF3B82F6),
    'handicapped': Color(0xFF3B82F6),
    'accessible': Color(0xFF3B82F6),
    'disabled': Color(0xFF6B7280),
  };

  Color _seatTypeColor(String type) {
    return _seatTypeColors[type.toLowerCase()] ?? const Color(0xFF9E9890);
  }

  String _displaySeatType(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return 'Standard';
    switch (value.toLowerCase()) {
      case 'seat':
      case 'standard':
        return 'Standard';
      case 'premium':
        return 'Premium';
      case 'recliner':
        return 'Recliner';
      case 'wheelchair':
      case 'handicapped':
        return 'Wheelchair';
      case 'disabled':
        return 'Disabled';
      default:
        return value
            .split(RegExp(r'[\s_-]+'))
            .map((part) {
              if (part.isEmpty) return part;
              return '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}';
            })
            .join(' ');
    }
  }

  List<_SeatTypeSummary> _seatTypeSummaries() {
    final rowsByType = <String, Set<String>>{};
    final pricesByType = <String, Set<int>>{};
    final currencyByType = <String, String>{};
    for (final seat in _seats) {
      final category = (seat['category_name'] ?? '').toString().trim();
      final rawType = category.isNotEmpty
          ? category
          : (seat['seat_type'] ?? 'standard').toString();
      if (rawType.toLowerCase() == 'gap' || rawType.toLowerCase() == 'empty') {
        continue;
      }
      final type = _displaySeatType(rawType);
      final row = (seat['row_label'] ?? '').toString().trim();
      if (row.isEmpty) continue;
      rowsByType.putIfAbsent(type, () => <String>{}).add(row);
      final price = seat['price_minor'];
      if (price is num) {
        pricesByType.putIfAbsent(type, () => <int>{}).add(price.toInt());
      }
      final currency = (seat['currency'] ?? '').toString().trim();
      if (currency.isNotEmpty) currencyByType[type] = currency;
    }
    final result = <_SeatTypeSummary>[];
    for (final entry in rowsByType.entries) {
      final prices = (pricesByType[entry.key] ?? <int>{}).toList()..sort();
      final rows = entry.value.toList()..sort();
      result.add(
        _SeatTypeSummary(
          name: entry.key,
          rows: _compressRows(rows),
          minPriceMinor: prices.isEmpty ? null : prices.first,
          maxPriceMinor: prices.isEmpty ? null : prices.last,
          currency: currencyByType[entry.key],
        ),
      );
    }
    return result;
  }

  List<String> _compressRows(List<String> rows) {
    if (rows.length < 2 || rows.any((row) => row.length != 1)) return rows;
    final result = <String>[];
    var start = rows.first;
    var previous = rows.first;
    for (var i = 1; i < rows.length; i++) {
      final current = rows[i];
      if (current.codeUnitAt(0) == previous.codeUnitAt(0) + 1) {
        previous = current;
        continue;
      }
      result.add(start == previous ? start : '$start–$previous');
      start = current;
      previous = current;
    }
    result.add(start == previous ? start : '$start–$previous');
    return result;
  }

  Widget _buildSeatDock() {
    final groups = _seatTypeSummaries();
    final rowCount = _seats
        .map((seat) => (seat['row_label'] ?? '').toString().trim())
        .where((row) => row.isNotEmpty)
        .toSet()
        .length;
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF1A1A1E),
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(top: BorderSide(color: Color(0xFF2C2C32))),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'SEAT PRICING',
                style: TextStyle(
                  fontSize: 9,
                  letterSpacing: 1.4,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF9E9890),
                ),
              ),
              const Spacer(),
              if (rowCount > 0)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF222226),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: const Color(0xFF2C2C32)),
                  ),
                  child: Text(
                    '$rowCount ROWS',
                    style: GoogleFonts.spaceMono(
                      fontSize: 8,
                      fontWeight: FontWeight.w700,
                      color: const Color(0xFFD8C7A5),
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _Legend(color: Color(0xFF8B8B93), label: 'Available'),
              _Legend(color: Color(0xFFD96B43), label: 'Selected'),
              _Legend(color: Color(0xFF7A7570), label: 'Occupied'),
            ],
          ),
          if (groups.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (var i = 0; i < groups.length; i++) ...[
              _buildPricingCard(groups[i]),
              if (i != groups.length - 1) const SizedBox(height: 8),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildPricingCard(_SeatTypeSummary group) {
    final accent = _seatTypeColor(group.name);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: const Color(0xFF141416),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF2C2C32)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: accent.withValues(alpha: 0.35)),
                  ),
                  child: Text(
                    group.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.syne(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: const Color(0xFFF5EFEB),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (group.priceLabel.isNotEmpty)
                Text(
                  group.priceLabel,
                  style: GoogleFonts.spaceMono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFFD96B43),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF222226),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: const Color(0xFF2C2C32)),
                ),
                child: const Text(
                  'ROWS',
                  style: TextStyle(
                    fontSize: 6.5,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF71717A),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  group.rowsLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.spaceMono(
                    fontSize: 9,
                    fontWeight: FontWeight.w500,
                    color: const Color(0xFFB8B2AC),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  int get _skeletonRowCount {
    if (_seats.isEmpty) return 18;
    final rows = <String>{};
    for (final seat in _seats) {
      final label = seat['row_label'];
      if (label != null) rows.add(label.toString());
    }
    return rows.isEmpty ? 18 : rows.length;
  }

  int get _skeletonSeatsPerRow {
    if (_seats.isEmpty) return 23;
    int? minX;
    int? maxX;
    for (final seat in _seats) {
      final x = int.tryParse(seat['x']?.toString() ?? '');
      if (x == null) continue;
      if (minX == null || x < minX) minX = x;
      if (maxX == null || x > maxX) maxX = x;
    }
    if (minX == null || maxX == null) return 23;
    final count = maxX - minX + 1;
    return count < 1 ? 23 : count;
  }

  List<Widget> _getSeatRows() => _seatRows ??= _createSeatRows();

  List<Widget> _createSeatRows() {
    if (_seats.isEmpty) {
      return [
        const Text('No seats', style: TextStyle(color: Color(0xFFA1A1AA))),
      ];
    }
    final xs = _seats.map((s) => int.parse(s['x'].toString())).toList();
    final minX = xs.reduce((a, b) => a < b ? a : b);
    final maxX = xs.reduce((a, b) => a > b ? a : b);
    final cols = maxX - minX + 1;
    final rowLabels = _seats
        .map((s) => s['row_label'] as String)
        .toSet()
        .toList();
    rowLabels.sort();
    final widgets = <Widget>[];
    for (final row in rowLabels) {
      final cells = List<dynamic>.filled(cols, null);
      for (final s in _seats) {
        if (s['row_label'] == row) {
          cells[int.parse(s['x'].toString()) - minX] = s;
        }
      }
      widgets.add(
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 20,
                child: Text(
                  row,
                  style: GoogleFonts.spaceMono(
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF9E9890),
                    fontSize: 10,
                  ),
                ),
              ),
              ...cells.map((s) {
                if (s == null) {
                  return Container(
                    width: 22,
                    height: 22,
                    margin: const EdgeInsets.all(1),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1c1c1f),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  );
                }
                final status = s['status'] ?? 'available';
                Color color = const Color(0xFF4a4a50);
                Color border = Colors.transparent;
                if (status == 'booked') {
                  color = const Color(0xFF232326);
                  border = const Color(0xFF2e2e33);
                }
                if (status == 'held') color = Colors.orange;
                return Container(
                  width: 22,
                  height: 22,
                  margin: const EdgeInsets.all(1),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(4),
                    border: border != Colors.transparent
                        ? Border.all(color: border)
                        : null,
                  ),
                  child: Text(
                    '${s['seat_number']}',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.spaceMono(
                      fontSize: 8,
                      height: 1,
                      fontWeight: status == 'booked'
                          ? FontWeight.w500
                          : FontWeight.w700,
                      letterSpacing: -0.2,
                      color: status == 'booked'
                          ? const Color(0xFF6E6A67)
                          : Colors.white,
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
      );
    }
    return widgets;
  }
}

class _SeatTypeSummary {
  final String name;
  final List<String> rows;
  final int? minPriceMinor;
  final int? maxPriceMinor;
  final String? currency;

  const _SeatTypeSummary({
    required this.name,
    required this.rows,
    this.minPriceMinor,
    this.maxPriceMinor,
    this.currency,
  });

  String get rowsLabel => rows.join(' · ');

  String get priceLabel {
    final min = minPriceMinor;
    if (min == null) return '';
    final code = (currency ?? 'INR').toUpperCase();
    final symbol = code == 'INR'
        ? '₹'
        : (currency?.isNotEmpty == true ? '${currency!} ' : '');
    String amount(int minor) {
      final value = minor / 100;
      return value == value.roundToDouble()
          ? value.toStringAsFixed(0)
          : value.toStringAsFixed(2);
    }

    final max = maxPriceMinor;
    if (max == null || max == min) return '$symbol${amount(min)}';
    return '$symbol${amount(min)}–${amount(max)}';
  }
}

class _Legend extends StatelessWidget {
  final Color color;
  final String label;
  const _Legend({required this.color, required this.label});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 9,
          color: color,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}
