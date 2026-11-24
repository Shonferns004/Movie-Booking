import 'package:flutter/material.dart';

import '../services/api.dart';
import 'show_detail_screen.dart';
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// Movies tab: the catalogue, with every show of each film one tap away.
class MoviesScreen extends StatefulWidget {
  const MoviesScreen({super.key, required this.token});

  final String? token;

  @override
  State<MoviesScreen> createState() => _MoviesScreenState();
}

class _MoviesScreenState extends State<MoviesScreen> {
  List<dynamic> _movies = [];
  Map<String, List<dynamic>> _showsByMovie = {};
  final Set<String> _expanded = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = widget.token;
    if (token == null || token.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    try {
      final results = await Future.wait([
        Api.getMovies(token),
        Api.getShows(token),
      ]);
      final grouped = <String, List<dynamic>>{};
      for (final show in results[1]) {
        if (show is! Map) continue;
        final movieId = show['movie_id']?.toString();
        if (movieId == null) continue;
        grouped.putIfAbsent(movieId, () => []).add(show);
      }
      for (final list in grouped.values) {
        list.sort((a, b) => '${a['starts_at']}'.compareTo('${b['starts_at']}'));
      }
      if (!mounted) return;
      setState(() {
        _movies = results[0];
        _showsByMovie = grouped;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  String _date(DateTime date) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    final minute = date.minute.toString().padLeft(2, '0');
    return '${date.day} ${months[date.month - 1]} · $hour:$minute ${date.hour < 12 ? 'AM' : 'PM'}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1E2227),
      appBar: AppBar(
        title: const Text(
          'MOVIES',
          style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFF2F0EC)),
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(TablerIcons.refresh, size: 18),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFC8FF1F)))
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!, style: const TextStyle(color: Color(0xFFF08A80))),
                  ),
                )
              : _movies.isEmpty
                  ? const Center(
                      child: Text(
                        'No movies yet.',
                        style: TextStyle(color: Color(0xFF9E9890), fontSize: 13),
                      ),
                    )
                  : RefreshIndicator(
                      color: const Color(0xFFC8FF1F),
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _movies.length,
                        itemBuilder: (ctx, i) {
                          final movie = _movies[i];
                          final id = movie['id']?.toString() ?? '';
                          final shows = _showsByMovie[id] ?? const [];
                          final expanded = _expanded.contains(id);
                          final poster = (movie['thumbnail_url'] ?? movie['poster_url'])
                              ?.toString();
                          final meta = [
                            movie['language'],
                            movie['duration_minutes'] != null
                                ? '${movie['duration_minutes']}m'
                                : null,
                            '${shows.length} show${shows.length == 1 ? '' : 's'}',
                          ].whereType<Object>().map((e) => e.toString()).join(' · ');

                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(
                              color: const Color(0xFF262C33),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: const Color(0xFF2A2A2E)),
                            ),
                            child: Column(
                              children: [
                                InkWell(
                                  borderRadius: BorderRadius.circular(16),
                                  onTap: () => setState(() {
                                    if (expanded) {
                                      _expanded.remove(id);
                                    } else {
                                      _expanded.add(id);
                                    }
                                  }),
                                  child: Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Row(
                                      children: [
                                        ClipRRect(
                                          borderRadius: BorderRadius.circular(10),
                                          child: Container(
                                            width: 46,
                                            height: 64,
                                            color: const Color(0xFF242428),
                                            child: poster != null &&
                                                    poster.startsWith('http')
                                                ? Image.network(
                                                    poster,
                                                    fit: BoxFit.cover,
                                                    errorBuilder: (_, _, _) => const Icon(
                                                      TablerIcons.movie,
                                                      size: 20,
                                                      color: Color(0xFF52525A),
                                                    ),
                                                  )
                                                : const Icon(
                                                    TablerIcons.movie,
                                                    size: 20,
                                                    color: Color(0xFF52525A),
                                                  ),
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                (movie['title'] ?? 'Untitled').toString(),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  fontSize: 14,
                                                  fontWeight: FontWeight.w700,
                                                  color: Color(0xFFF2F0EC),
                                                ),
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                meta,
                                                style: const TextStyle(
                                                  fontSize: 11,
                                                  color: Color(0xFF9E9890),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        Icon(
                                          expanded ? TablerIcons.chevronUp : TablerIcons.chevronDown,
                                          size: 18,
                                          color: const Color(0xFF52525A),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                if (expanded)
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                                    child: shows.isEmpty
                                        ? const Padding(
                                            padding: EdgeInsets.symmetric(vertical: 8),
                                            child: Text(
                                              'No shows scheduled for this movie.',
                                              style: TextStyle(
                                                fontSize: 11,
                                                color: Color(0xFF9E9890),
                                              ),
                                            ),
                                          )
                                        : Column(
                                            children: shows.map((show) {
                                              final raw = show['starts_at']?.toString();
                                              final start = raw == null
                                                  ? null
                                                  : DateTime.tryParse(raw)?.toLocal();
                                              final venue = [
                                                show['theatre_name'],
                                                show['auditorium_name'],
                                              ]
                                                  .whereType<Object>()
                                                  .map((e) => e.toString())
                                                  .join(' · ');
                                              return Container(
                                                margin: const EdgeInsets.only(bottom: 8),
                                                decoration: BoxDecoration(
                                                  color: const Color(0xFF141417),
                                                  borderRadius: BorderRadius.circular(10),
                                                  border: Border.all(
                                                    color: const Color(0xFF2A2A2E),
                                                  ),
                                                ),
                                                child: ListTile(
                                                  dense: true,
                                                  visualDensity: VisualDensity.compact,
                                                  title: Text(
                                                    venue.isEmpty ? 'Show' : venue,
                                                    style: const TextStyle(
                                                      fontSize: 12,
                                                      color: Color(0xFFF2F0EC),
                                                    ),
                                                  ),
                                                  subtitle: Text(
                                                    start == null ? '' : _date(start),
                                                    style: const TextStyle(
                                                      fontSize: 11,
                                                      color: Color(0xFF9E9890),
                                                    ),
                                                  ),
                                                  trailing: const Icon(
                                                    TablerIcons.chevronRight,
                                                    size: 18,
                                                    color: Color(0xFF52525A),
                                                  ),
                                                  onTap: () async {
                                                    await Navigator.push(
                                                      context,
                                                      MaterialPageRoute(
                                                        builder: (_) => ShowDetailScreen(
                                                          showId: show['id'].toString(),
                                                          token: widget.token,
                                                        ),
                                                      ),
                                                    );
                                                    if (mounted) _load();
                                                  },
                                                ),
                                              );
                                            }).toList(),
                                          ),
                                  ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
