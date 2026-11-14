import 'package:flutter/material.dart';

import '../services/api.dart';
import '../widgets/app_toast.dart';

/// Members of the Samudai: everyone on the list, plus a manual add.
class MembersScreen extends StatefulWidget {
  const MembersScreen({super.key, required this.token});

  final String? token;

  @override
  State<MembersScreen> createState() => _MembersScreenState();
}

class _MembersScreenState extends State<MembersScreen> {
  List<dynamic> _members = [];
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
      final list = await Api.getCommunityMembers(token);
      if (!mounted) return;
      setState(() {
        _members = list;
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
    final name = TextEditingController();
    final email = TextEditingController();
    final phone = TextEditingController();
    var plan = 'family';

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialog) => AlertDialog(
          backgroundColor: const Color(0xFF1A1A1E),
          title: const Text('Add member'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
                TextField(controller: email, decoration: const InputDecoration(labelText: 'Email')),
                TextField(
                  controller: phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Phone'),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: plan,
                  decoration: const InputDecoration(labelText: 'Plan'),
                  items: const [
                    DropdownMenuItem(value: 'single', child: Text('Single · ₹600')),
                    DropdownMenuItem(value: 'family', child: Text('Family · ₹1,200')),
                    DropdownMenuItem(value: 'patron', child: Text('Patron · ₹5,000')),
                  ],
                  onChanged: (value) => setDialog(() => plan = value ?? 'family'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
          ],
        ),
      ),
    );

    if (ok != true) return;
    if (name.text.trim().isEmpty) {
      if (mounted) AppToast.show(context, 'Enter the member name.', type: AppToastType.error);
      return;
    }

    try {
      await Api.createCommunityMember(widget.token!, {
        'name': name.text.trim(),
        'email': email.text.trim().isEmpty ? null : email.text.trim(),
        'phone': phone.text.trim().isEmpty ? null : phone.text.trim(),
        'plan': plan,
      });
      await _load();
      if (mounted) AppToast.show(context, 'Member added.', type: AppToastType.success);
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

  Future<void> _toggleStatus(dynamic member) async {
    final status = (member['status'] ?? 'pending').toString();
    final next = status == 'active' ? 'pending' : 'active';
    try {
      await Api.updateCommunityMember(widget.token!, member['id'].toString(), {'status': next});
      await _load();
      if (mounted) {
        AppToast.show(
          context,
          next == 'active' ? 'Membership confirmed.' : 'Membership set to pending.',
          type: AppToastType.success,
        );
      }
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

  Future<void> _delete(dynamic member) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A1E),
        title: const Text('Remove member?'),
        content: Text('${member['name'] ?? 'This member'} will be taken off the roll.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await Api.deleteCommunityMember(widget.token!, member['id'].toString());
      await _load();
      if (mounted) AppToast.show(context, 'Member removed.', type: AppToastType.success);
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
      backgroundColor: const Color(0xFF121214),
      appBar: AppBar(
        title: Text('Members · ${_members.length}'),
        backgroundColor: const Color(0xFF121214),
        foregroundColor: const Color(0xFFF5EFEB),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        backgroundColor: const Color(0xFFD96B43),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.person_add_alt_1, size: 18),
        label: const Text('Add member'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFD96B43)))
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!, style: const TextStyle(color: Color(0xFFE07A52))),
                  ),
                )
              : _members.isEmpty
                  ? const Center(
                      child: Text(
                        'No members yet.',
                        style: TextStyle(color: Color(0xFF9E9890)),
                      ),
                    )
                  : RefreshIndicator(
                      color: const Color(0xFFD96B43),
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                        itemCount: _members.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (ctx, i) {
                          final member = _members[i];
                          final plan = (member['plan'] ?? '').toString();
                          final status = (member['status'] ?? '').toString();
                          return Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1A1A1E),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFF2A2A2E)),
                            ),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  radius: 18,
                                  backgroundColor: const Color(0xFFD96B43).withValues(alpha: 0.18),
                                  child: Text(
                                    (member['name'] ?? '?').toString().characters.first.toUpperCase(),
                                    style: const TextStyle(
                                      color: Color(0xFFD96B43),
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        (member['name'] ?? 'Member').toString(),
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          color: Color(0xFFF5EFEB),
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        [
                                          plan,
                                          if ((member['phone'] ?? '').toString().isNotEmpty)
                                            member['phone'].toString(),
                                          status,
                                        ].join(' · '),
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: Color(0xFF9E9890),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  tooltip: status == 'active'
                                      ? 'Set back to pending'
                                      : 'Confirm payment',
                                  onPressed: () => _toggleStatus(member),
                                  icon: Icon(
                                    status == 'active'
                                        ? Icons.verified
                                        : Icons.verified_outlined,
                                    size: 18,
                                    color: status == 'active'
                                        ? const Color(0xFF6FBF8B)
                                        : const Color(0xFF9E9890),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Remove member',
                                  onPressed: () => _delete(member),
                                  icon: const Icon(Icons.delete_outline, size: 18),
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
