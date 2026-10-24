import 'package:flutter/material.dart';
import '../services/api.dart';

class SeatBuilderScreen extends StatefulWidget {
  final String token;
  const SeatBuilderScreen({super.key, required this.token});

  @override
  State<SeatBuilderScreen> createState() => _SeatBuilderScreenState();
}

class _SeatBuilderScreenState extends State<SeatBuilderScreen> {
  List<dynamic> _theatres = [];
  List<dynamic> _auditoriums = [];
  String? _theatreId;
  String? _auditoriumId;
  String _view = 'theaters'; // theaters | auditoriums | builder

  List<List<Map<String, dynamic>>> _grid = [];
  int _rows = 10;
  int _cols = 12;
  final _rowsCtrl = TextEditingController(text: '10');
  final _colsCtrl = TextEditingController(text: '12');
  final _aisleColCtrl = TextEditingController(text: '6');
  final _aisleRowCtrl = TextEditingController(text: '6');

  final Map<int, TextEditingController> _rowLabelCtrls = {};

  String _paintTool = 'cycle';
  String _numberingMode = 'compact';
  String _numberingDir = 'ltr';
  bool _useRowLetters = false;

  int _lastRow = -1;
  int _lastCol = -1;

  static const _seatTypes = ['standard', 'premium', 'recliner', 'wheelchair', 'gap', 'disabled', 'empty'];

  @override
  void initState() {
    super.initState();
    _loadTheatres();
  }

  Future<void> _loadTheatres() async {
    try {
      final t = await Api.getTheatres(widget.token);
      setState(() => _theatres = t);
      if (t.isNotEmpty && _theatreId == null) {
        _theatreId = t[0]['id'];
        await _loadAuditoriums();
      }
    } catch (_) {}
  }

  Future<void> _loadAuditoriums() async {
    if (_theatreId == null) return;
    try {
      final a = await Api.getAuditoriums(widget.token, _theatreId!);
      setState(() => _auditoriums = a);
      if (a.isNotEmpty && _auditoriumId == null) {
        _auditoriumId = a[0]['id'];
        await _loadLayout();
      }
    } catch (_) {}
  }

  Future<void> _addTheatre() async {
    final nameCtrl = TextEditingController();
    final addrCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Theater'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name')),
            TextField(controller: addrCtrl, decoration: const InputDecoration(labelText: 'Address')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.createTheatre(widget.token, nameCtrl.text.trim(), addrCtrl.text.trim().isEmpty ? null : addrCtrl.text.trim());
      await _loadTheatres();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _editTheatre(Map<String, dynamic> t) async {
    final nameCtrl = TextEditingController(text: t['name'] ?? '');
    final addrCtrl = TextEditingController(text: t['address'] ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Theater'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name')),
            TextField(controller: addrCtrl, decoration: const InputDecoration(labelText: 'Address')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.updateTheatre(widget.token, t['id'], nameCtrl.text.trim(), addrCtrl.text.trim().isEmpty ? null : addrCtrl.text.trim());
      await _loadTheatres();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _deleteTheatre(Map<String, dynamic> t) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Theater'),
        content: Text('Delete ${t['name']}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.deleteTheatre(widget.token, t['id']);
      if (_theatreId == t['id']) {
        _theatreId = null;
        _auditoriums = [];
        _auditoriumId = null;
        _grid = [];
      }
      await _loadTheatres();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _loadLayout() async {
    if (_auditoriumId == null) return;
    try {
      final res = await Api.getLayout(widget.token, _auditoriumId!);
      final seats = (res['seats'] as List<dynamic>?) ?? [];
      if (seats.isNotEmpty) {
        final maxY = seats.map((s) => (s['y'] as num).toInt()).reduce((a, b) => a > b ? a : b);
        final maxX = seats.map((s) => (s['x'] as num).toInt()).reduce((a, b) => a > b ? a : b);
        final g = List.generate(maxY + 1, (_) => List.generate(maxX + 1, (_) => <String, dynamic>{
          'type': 'empty', 'label': '', 'row_label': '', 'seat_number': '', 'col_span': 1, 'merged': false, 'manual': false,
        }));
        for (final s in seats) {
          final y = (s['y'] as num).toInt();
          final x = (s['x'] as num).toInt();
          g[y][x] = {
            'type': _seatToType(s),
            'label': s['seat_key'] ?? '',
            'row_label': s['row_label'] ?? '',
            'seat_number': s['seat_number'] ?? '',
            'col_span': (s['col_span'] as num?)?.toInt() ?? 1,
            'merged': false,
            'manual': true,
          };
        }
        _useRowLetters = g.any((r) => r.any((c) => (c['row_label'] ?? '').toString().isNotEmpty));
        setState(() {
          _grid = g;
          _rows = g.length;
          _cols = g.isEmpty ? 12 : g[0].length;
          _rowsCtrl.text = _rows.toString();
          _colsCtrl.text = _cols.toString();
        });
        _rowLabelCtrls.clear();
        for (int y = 0; y < _grid.length; y++) {
          _rowLabelCtrls[y] = TextEditingController(text: _grid[y].isNotEmpty ? (_grid[y][0]['row_label'] ?? '') : '');
        }
      }
    } catch (_) {}
  }

  String _seatToType(Map<String, dynamic> s) {
    if (s['seat_type'] == 'gap') return 'gap';
    if (s['accessible'] == true) return 'wheelchair';
    switch ((s['category_name'] ?? '').toString().toLowerCase()) {
      case 'prime': return 'premium';
      case 'recliner': return 'recliner';
      case 'handicapped': return 'wheelchair';
      default: return 'standard';
    }
  }

  String _rowLabel(int y) {
    int n = y;
    String label = '';
    do {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = (n / 26).floor() - 1;
    } while (n >= 0);
    return label;
  }

  void _applySeatType(Map<String, dynamic> cell, String type, int x, int y) {
    cell['type'] = type;
    if (type == 'gap' || type == 'empty') {
      cell['label'] = '';
      cell['seat_number'] = '';
    }
    if (type == 'gap' || type == 'empty') {
      _numberingMode = 'compact';
    }
    if (cell['col_span'] == null) cell['col_span'] = 1;
    _renumberRow(y);
  }

  void _renumberRow(int y) {
    if (y < 0 || y >= _grid.length) return;
    final rl = _useRowLetters ? _rowLabel(y) : '';
    final cols = _grid[y].length;
    final activeIndices = <int>[];
    for (int x = 0; x < cols; x++) {
      final t = _grid[y][x]['type'];
      if (t != 'gap' && t != 'empty') activeIndices.add(x);
    }
    final activeCount = activeIndices.length;

    Map<int, int> compactMap = {};
    if (_numberingMode == 'compact') {
      if (_numberingDir == 'ltr') {
        for (int i = 0; i < activeIndices.length; i++) compactMap[activeIndices[i]] = i + 1;
      } else {
        for (int i = 0; i < activeIndices.length; i++) compactMap[activeIndices[i]] = activeCount - i;
      }
    }

    for (int x = 0; x < cols; x++) {
      final cell = _grid[y][x];
      final t = cell['type'];
      if (t == 'gap' || t == 'empty') {
        cell['label'] = '';
        cell['seat_number'] = '';
        cell['row_label'] = cell['row_label'] ?? rl;
        continue;
      }
      int num;
      if (_numberingMode == 'fixed') {
        num = _numberingDir == 'ltr' ? (x + 1) : (cols - x);
      } else {
        num = compactMap[x]!;
      }
      cell['row_label'] = rl;
      cell['seat_number'] = num.toString();
      if (cell['manual'] != true) {
        cell['label'] = rl.isNotEmpty ? '$rl$num' : '$num';
      }
    }
  }

  void _buildGrid() {
    final r = int.tryParse(_rowsCtrl.text) ?? 10;
    final c = int.tryParse(_colsCtrl.text) ?? 12;
    if (r <= 0 || c <= 0) return;
    final old = _grid;
    final g = List.generate(r, (y) {
      return List.generate(c, (x) {
        if (y < old.length && x < (old[y].length) && old[y][x]['type'] != 'empty') {
          final cell = Map<String, dynamic>.from(old[y][x]);
          cell['manual'] = cell['manual'] == true;
          cell['col_span'] = cell['col_span'] ?? 1;
          return cell;
        }
        return <String, dynamic>{
          'type': 'standard',
          'label': '',
          'row_label': '',
          'seat_number': '',
          'col_span': 1,
          'merged': false,
          'manual': false,
        };
      });
    });
    setState(() {
      _grid = g;
      _rows = r;
      _cols = c;
    });
    _rowLabelCtrls.clear();
    for (int y = 0; y < _grid.length; y++) {
      _rowLabelCtrls[y] = TextEditingController(text: _grid[y].isNotEmpty ? (_grid[y][0]['row_label'] ?? '') : '');
    }
    for (int y = 0; y < _grid.length; y++) _renumberRow(y);
    setState(() {});
  }

  void _insertAisleCol() {
    if (_grid.isEmpty) return;
    final col = (int.tryParse(_aisleColCtrl.text) ?? 1) - 1;
    if (col < 0 || col > _grid[0].length) return;
    for (int y = 0; y < _grid.length; y++) {
      _grid[y].insert(col, <String, dynamic>{
        'type': 'gap', 'label': '', 'row_label': '', 'seat_number': '', 'col_span': 1, 'merged': false, 'manual': false,
      });
    }
    _cols = _grid[0].length;
    _colsCtrl.text = _cols.toString();
    _numberingMode = 'compact';
    for (int y = 0; y < _grid.length; y++) _renumberRow(y);
    setState(() {});
  }

  void _removeAisleCol() {
    if (_grid.isEmpty) return;
    final col = (int.tryParse(_aisleColCtrl.text) ?? 1) - 1;
    if (col < 0 || col >= _grid[0].length) return;
    final allGap = _grid.every((row) => row[col]['type'] == 'gap' || row[col]['type'] == 'empty');
    if (!allGap) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Column contains seats')));
      return;
    }
    for (int y = 0; y < _grid.length; y++) _grid[y].removeAt(col);
    _cols = _grid[0].length;
    _colsCtrl.text = _cols.toString();
    for (int y = 0; y < _grid.length; y++) _renumberRow(y);
    setState(() {});
  }

  void _insertAisleRow() {
    if (_grid.isEmpty) return;
    final row = (int.tryParse(_aisleRowCtrl.text) ?? 1) - 1;
    if (row < 0 || row > _grid.length) return;
    final cols = _grid[0].length;
    final newRow = List.generate(cols, (_) => <String, dynamic>{
      'type': 'gap', 'label': '', 'row_label': '', 'seat_number': '', 'col_span': 1, 'merged': false, 'manual': false,
    });
    _grid.insert(row, newRow);
    _rows = _grid.length;
    _rowsCtrl.text = _rows.toString();
    for (int y = 0; y < _grid.length; y++) _renumberRow(y);
    setState(() {});
  }

  void _removeAisleRow() {
    if (_grid.isEmpty) return;
    final row = (int.tryParse(_aisleRowCtrl.text) ?? 1) - 1;
    if (row < 0 || row >= _grid.length) return;
    final allGap = _grid[row].every((c) => c['type'] == 'gap' || c['type'] == 'empty');
    if (!allGap) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Row contains seats')));
      return;
    }
    _grid.removeAt(row);
    _rows = _grid.length;
    _rowsCtrl.text = _rows.toString();
    for (int y = 0; y < _grid.length; y++) _renumberRow(y);
    setState(() {});
  }

  Future<void> _save() async {
    if (_auditoriumId == null) return;
    try {
      await Api.saveLayout(widget.token, _auditoriumId!, _grid.length, _grid.isEmpty ? 0 : _grid[0].length, _grid);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Layout saved')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Widget _legend(String label, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 16, height: 16, decoration: BoxDecoration(color: color, border: Border.all(color: Colors.white54), borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(fontSize: 11)),
      ],
    );
  }

  Color _colorFor(String type) {
    switch (type) {
      case 'premium': return Colors.amber;
      case 'recliner': return Colors.green;
      case 'wheelchair': return Colors.blue;
      case 'gap': return Colors.transparent;
      case 'disabled': return Colors.grey;
      case 'empty': return Colors.black26;
      default: return Colors.lightBlue;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_view == 'theaters' ? 'Theaters' : _view == 'auditoriums' ? 'Auditoriums' : 'Seat Builder'),
        leading: _view != 'theaters' ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: () {
          setState(() {
            if (_view == 'builder') _view = 'auditoriums';
            else if (_view == 'auditoriums') _view = 'theaters';
          });
        }) : null,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: _view == 'theaters'
              ? _theaterListWidgets()
              : _view == 'auditoriums'
                  ? _auditoriumListWidgets()
                  : _builderWidgets(),
        ),
      ),
    );
  }

  List<Widget> _theaterListWidgets() {
    return [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Text('Theaters', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          ElevatedButton.icon(onPressed: _addTheatre, icon: const Icon(Icons.add), label: const Text('Add')),
        ],
      ),
      const SizedBox(height: 8),
      if (_theatres.isEmpty) const Text('No theaters yet'),
      ..._theatres.map((t) {
        final selected = t['id'] == _theatreId;
        return Card(
          color: selected ? Colors.blueGrey : null,
          child: ListTile(
            title: Text(t['name'] ?? ''),
            subtitle: Text(t['address'] ?? ''),
            onTap: () async {
              setState(() { _theatreId = t['id']; _auditoriumId = null; _auditoriums = []; _grid = []; _view = 'auditoriums'; });
              await _loadAuditoriums();
            },
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(icon: const Icon(Icons.edit), onPressed: () => _editTheatre(t)),
                IconButton(icon: const Icon(Icons.delete), onPressed: () => _deleteTheatre(t)),
              ],
            ),
          ),
        );
      }),
    ];
  }

  List<Widget> _auditoriumListWidgets() {
    return [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Text('Auditoriums', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          ElevatedButton.icon(onPressed: _addAuditorium, icon: const Icon(Icons.add), label: const Text('Add')),
        ],
      ),
      const SizedBox(height: 8),
      if (_auditoriums.isEmpty) const Text('No auditoriums yet'),
      ..._auditoriums.map((a) {
        return Card(
          child: ListTile(
            title: Text(a['name'] ?? ''),
            subtitle: Text(a['active_version'] != null ? 'Layout v${a['active_version']} • ${a['seat_count']} seats' : 'No layout yet'),
            onTap: () async {
              setState(() { _auditoriumId = a['id']; _grid = []; _view = 'builder'; });
              await _loadLayout();
            },
          ),
        );
      }),
    ];
  }

  Future<void> _addAuditorium() async {
    if (_theatreId == null) return;
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Auditorium'),
        content: TextField(controller: ctrl, decoration: const InputDecoration(labelText: 'Name')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.createAuditorium(widget.token, _theatreId!, ctrl.text.trim());
      await _loadAuditoriums();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  List<Widget> _builderWidgets() {
    return [
      Row(children: [
        Expanded(child: TextField(controller: _rowsCtrl, decoration: const InputDecoration(labelText: 'Rows'))),
        const SizedBox(width: 8),
        Expanded(child: TextField(controller: _colsCtrl, decoration: const InputDecoration(labelText: 'Cols'))),
        const SizedBox(width: 8),
        ElevatedButton(onPressed: _buildGrid, child: const Text('Build')),
      ]),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: DropdownButtonFormField<String>(
          initialValue: _paintTool,
          decoration: const InputDecoration(labelText: 'Paint'),
          items: ['cycle', ..._seatTypes].map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
          onChanged: (v) => setState(() => _paintTool = v ?? 'cycle'),
        )),
        const SizedBox(width: 8),
        Expanded(child: DropdownButtonFormField<String>(
          initialValue: _numberingMode,
          decoration: const InputDecoration(labelText: 'Numbering'),
          items: const [
            DropdownMenuItem(value: 'compact', child: Text('Compact')),
            DropdownMenuItem(value: 'fixed', child: Text('Fixed')),
          ],
          onChanged: (v) { setState(() => _numberingMode = v ?? 'compact'); _rebuildNumbers(); },
        )),
        const SizedBox(width: 8),
        Expanded(child: DropdownButtonFormField<String>(
          initialValue: _numberingDir,
          decoration: const InputDecoration(labelText: 'Direction'),
          items: const [
            DropdownMenuItem(value: 'ltr', child: Text('L->R')),
            DropdownMenuItem(value: 'rtl', child: Text('R->L')),
          ],
          onChanged: (v) { setState(() => _numberingDir = v ?? 'ltr'); _rebuildNumbers(); },
        )),
      ]),
      const SizedBox(height: 8),
      Row(children: [
        Checkbox(value: _useRowLetters, onChanged: (v) { setState(() => _useRowLetters = v ?? false); _rebuildNumbers(); }),
        const Text('Row letters'),
        const SizedBox(width: 8),
        Expanded(child: TextField(controller: _aisleColCtrl, decoration: const InputDecoration(labelText: 'Aisle col'))),
        const SizedBox(width: 4),
        ElevatedButton(onPressed: _insertAisleCol, child: const Text('Ins')),
        const SizedBox(width: 4),
        ElevatedButton(onPressed: _removeAisleCol, child: const Text('Rem')),
      ]),
      Row(children: [
        Expanded(child: TextField(controller: _aisleRowCtrl, decoration: const InputDecoration(labelText: 'Aisle row'))),
        const SizedBox(width: 4),
        ElevatedButton(onPressed: _insertAisleRow, child: const Text('Ins')),
        const SizedBox(width: 4),
        ElevatedButton(onPressed: _removeAisleRow, child: const Text('Rem')),
      ]),
      const SizedBox(height: 8),
      ElevatedButton(onPressed: _save, child: const Text('Save Layout')),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        children: [
          _legend('Standard', Colors.lightBlue),
          _legend('Premium', Colors.amber),
          _legend('Recliner', Colors.green),
          _legend('Wheelchair', Colors.blue),
          _legend('Gap', Colors.transparent),
          _legend('Disabled', Colors.grey),
          _legend('Empty', Colors.black26),
        ],
      ),
      const SizedBox(height: 12),
      if (_grid.isNotEmpty)
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: _grid.asMap().entries.map((entry) {
              final y = entry.key;
              final row = entry.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    SizedBox(
                      width: 48,
                      child: TextField(
                        controller: _rowLabelCtrls.putIfAbsent(y, () => TextEditingController(text: row.isNotEmpty ? (row[0]['row_label'] ?? '') : '')),
                        decoration: const InputDecoration(isDense: true, hintText: 'A'),
                        onChanged: (val) {
                          for (final cell in row) {
                            if (cell['type'] == 'gap' || cell['type'] == 'empty') continue;
                            cell['row_label'] = val;
                          }
                          _renumberRow(y);
                          setState(() {});
                        },
                      ),
                    ),
                    const SizedBox(width: 6),
                    Row(
                      children: row.asMap().entries.map((e) {
                        final x = e.key;
                        final cell = e.value;
                        if (cell['merged'] == true) return const SizedBox.shrink();
                        final span = (cell['col_span'] ?? 1) as int;
                        return Padding(
                          padding: const EdgeInsets.only(right: 4),
                          child: GestureDetector(
                            onTap: () => _onCellTap(x, y),
                            child: Container(
                              width: 40.0 * span + 4.0 * (span - 1),
                              height: 40,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: _colorFor(cell['type']),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: Colors.white54),
                              ),
                              child: Text(
                                (cell['type'] == 'gap' || cell['type'] == 'empty') ? '' : (cell['label'] ?? ''),
                                style: const TextStyle(fontSize: 10, color: Colors.white),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
    ];
  }
  void _onCellTap(int x, int y) {
    final cell = _grid[y][x];
    String next;
    if (_paintTool == 'cycle') {
      final idx = _seatTypes.indexOf(cell['type']);
      next = _seatTypes[(idx + 1) % _seatTypes.length];
    } else {
      next = _paintTool;
    }
    _applySeatType(cell, next, x, y);
    _lastRow = y;
    _lastCol = x;
    setState(() {});
  }

  void _rebuildNumbers() {
    for (int y = 0; y < _grid.length; y++) _renumberRow(y);
    setState(() {});
  }
}
