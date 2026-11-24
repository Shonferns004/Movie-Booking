import 'package:flutter/material.dart';

import '../services/api.dart';
import '../widgets/app_toast.dart';
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

/// Members of the Samudai: everyone on the list, plus a manual add.
class MembersScreen extends StatefulWidget {
  const MembersScreen({super.key, required this.token});

  final String? token;

  @override
  State<MembersScreen> createState() => _MembersScreenState();
}

class _MembersScreenState extends State<MembersScreen> {
  List<dynamic> _members = [];
  int _amountMinor = 120000;
  String _planLabel = 'Annual membership';
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
        Api.getCommunityMembers(token),
        Api.getMembershipSettings(token),
      ]);
      final plan = results[1] as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _members = results[0] as List<dynamic>;
        _amountMinor = (plan['amountMinor'] as num?)?.toInt() ?? _amountMinor;
        _planLabel = (plan['label'] ?? _planLabel).toString();
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

  Future<void> _editAmount() async {
    final rupees = (TextEditingController(text: (_amountMinor / 100).toStringAsFixed(0)));
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF262C33),
        title: const Text('Membership price'),
        content: TextField(
          controller: rupees,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(
            labelText: 'Amount per year (₹)',
            helperText: 'Applies to new memberships immediately.',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true) return;

    final value = double.tryParse(rupees.text.trim());
    if (value == null || value < 1) {
      if (mounted) AppToast.show(context, 'Enter an amount of at least ₹1.', type: AppToastType.error);
      return;
    }

    try {
      final plan = await Api.updateMembershipAmount(widget.token!, (value * 100).round());
      if (!mounted) return;
      setState(() {
        _amountMinor = (plan['amountMinor'] as num?)?.toInt() ?? _amountMinor;
        _planLabel = (plan['label'] ?? _planLabel).toString();
      });
      AppToast.show(context, 'Membership price updated.', type: AppToastType.success);
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

  Future<void> _add() async {
    final name = TextEditingController();
    final email = TextEditingController();
    final phone = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF262C33),
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
              const SizedBox(height: 12),
              Text(
                'Added at the current annual price · ₹${(_amountMinor / 100).toStringAsFixed(0)}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11, color: Color(0xFF9E9890)),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
        ],
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
        backgroundColor: const Color(0xFF262C33),
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

  Widget _priceCard() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF262C33),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF2A2A2E)),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: const Color(0xFFC8FF1F).withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              TablerIcons.award,
              size: 20,
              color: Color(0xFFC8FF1F),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _planLabel.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.1,
                    color: Color(0xFF9E9890),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '₹${(_amountMinor / 100).toStringAsFixed(0)} / year',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFFF2F0EC),
                  ),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: _editAmount,
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFC8FF1F)),
            icon: const Icon(TablerIcons.edit, size: 16),
            label: const Text(
              'Change',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1E2227),
      appBar: AppBar(
        title: Text('Members · ${_members.length}'),
        backgroundColor: const Color(0xFF1E2227),
        foregroundColor: const Color(0xFFF2F0EC),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        backgroundColor: const Color(0xFFC8FF1F),
        foregroundColor: const Color(0xFF171B1F),
        icon: const Icon(TablerIcons.userPlus, size: 18),
        label: const Text('Add member'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFC8FF1F)))
          : Column(
              children: [
                _priceCard(),
                Expanded(
                  child: _error != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(_error!, style: const TextStyle(color: Color(0xFFF08A80))),
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
                              color: const Color(0xFFC8FF1F),
                              onRefresh: _load,
                              child: ListView.separated(
                                padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                                itemCount: _members.length,
                                separatorBuilder: (_, _) => const SizedBox(height: 8),
                                itemBuilder: (ctx, i) {
                          final member = _members[i];
                          final amount = ((member['amountMinor'] as num?)?.toInt() ?? 0) / 100;
                          final status = (member['status'] ?? '').toString();
                          return Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFF262C33),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFF2A2A2E)),
                            ),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  radius: 18,
                                  backgroundColor: const Color(0xFFC8FF1F).withValues(alpha: 0.18),
                                  child: Text(
                                    (member['name'] ?? '?').toString().characters.first.toUpperCase(),
                                    style: const TextStyle(
                                      color: Color(0xFFC8FF1F),
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
                                          color: Color(0xFFF2F0EC),
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        [
                                          if (amount > 0) '₹${amount.toStringAsFixed(0)} / year',
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
                                        ? TablerIcons.rosetteDiscountCheck
                                        : TablerIcons.rosetteDiscountCheck,
                                    size: 18,
                                    color: status == 'active'
                                        ? const Color(0xFF6FBF8B)
                                        : const Color(0xFF9E9890),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Remove member',
                                  onPressed: () => _delete(member),
                                  icon: const Icon(TablerIcons.trash, size: 18),
                                  color: const Color(0xFF9E9890),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ],
              ),
    );
  }
}
