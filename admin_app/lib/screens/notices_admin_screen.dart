import 'package:flutter/material.dart';
import '../widgets/kk_pull_to_refresh.dart';

import '../services/api.dart';
import '../widgets/app_toast.dart';
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// Notices shown in the "From the committee" list on the landing page.
class NoticesAdminScreen extends StatefulWidget {
  const NoticesAdminScreen({super.key, required this.token});

  final String? token;

  @override
  State<NoticesAdminScreen> createState() => _NoticesAdminScreenState();
}

class _NoticesAdminScreenState extends State<NoticesAdminScreen> {
  List<dynamic> _notices = [];
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
      final list = await Api.getCommunityNotices(token);
      if (!mounted) return;
      setState(() {
        _notices = list;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _add() async {
    final title = TextEditingController();
    final body = TextEditingController();
    final tag = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF262C33),
        title: const Text('New notice'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
              TextField(
                controller: body,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Details'),
              ),
              TextField(
                controller: tag,
                decoration: const InputDecoration(labelText: 'Tag (Membership, Classes, …)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Publish')),
        ],
      ),
    );

    if (ok != true) return;
    if (title.text.trim().isEmpty) {
      if (mounted) AppToast.show(context, 'Enter a title.', type: AppToastType.error);
      return;
    }

    try {
      await Api.createCommunityNotice(widget.token!, {
        'title': title.text.trim(),
        'body': body.text.trim(),
        'tag': tag.text.trim().isEmpty ? 'Notice' : tag.text.trim(),
      });
      await _load();
      if (mounted) AppToast.show(context, 'Notice published.', type: AppToastType.success);
    } catch (e) {
      if (mounted) {
        AppToast.show(
          context,
          e.toString().replaceFirst('Exception: ', ''),
          type: AppToastType.error,
        );
      }
    }
  }

  Future<void> _delete(dynamic notice) async {
    try {
      await Api.deleteCommunityNotice(widget.token!, notice['id'].toString());
      await _load();
      if (mounted) AppToast.show(context, 'Notice removed.', type: AppToastType.success);
    } catch (e) {
      if (mounted) {
        AppToast.show(
          context,
          e.toString().replaceFirst('Exception: ', ''),
          type: AppToastType.error,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1E2227),
      appBar: AppBar(
        title: Text('Notices · ${_notices.length}'),
        backgroundColor: const Color(0xFF1E2227),
        foregroundColor: const Color(0xFFF2F0EC),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        backgroundColor: const Color(0xFFC8FF1F),
        foregroundColor: const Color(0xFF171B1F),
        icon: const Icon(TablerIcons.speakerphone, size: 18),
        label: const Text('New notice'),
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
              : _notices.isEmpty
                  ? const Center(
                      child: Text('No notices yet.', style: TextStyle(color: Color(0xFF9E9890))),
                    )
                  : KkPullToRefresh(
                      color: const Color(0xFFC8FF1F),
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                        itemCount: _notices.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (ctx, i) {
                          final notice = _notices[i];
                          return Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFF262C33),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFF2A2A2E)),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        (notice['title'] ?? '').toString(),
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          color: Color(0xFFF2F0EC),
                                        ),
                                      ),
                                      if ((notice['body'] ?? '').toString().isNotEmpty) ...[
                                        const SizedBox(height: 3),
                                        Text(
                                          notice['body'].toString(),
                                          maxLines: 3,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontSize: 11,
                                            color: Color(0xFF9E9890),
                                          ),
                                        ),
                                      ],
                                      const SizedBox(height: 4),
                                      Text(
                                        [
                                          (notice['tag'] ?? '').toString(),
                                          (notice['dateLabel'] ?? '').toString(),
                                        ].where((v) => v.isNotEmpty).join(' · '),
                                        style: const TextStyle(
                                          fontSize: 10,
                                          color: Color(0xFF52525A),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  onPressed: () => _delete(notice),
                                  icon: const Icon(TablerIcons.trash, size: 18),
                                  color: const Color(0xFF9E9890),
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
