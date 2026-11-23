import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/api.dart';
import '../widgets/app_toast.dart';

/// Community images, split into the landing hero and the photo library.
class GalleryScreen extends StatefulWidget {
  const GalleryScreen({super.key, required this.token});

  final String? token;

  @override
  State<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> {
  List<dynamic> _images = [];
  bool _loading = true;
  bool _busy = false;
  bool _placementOpen = false;
  String? _error;

  List<dynamic> get _heroImages =>
      _images.where((image) => (image['placement'] ?? 'hero') != 'library').toList();

  List<dynamic> get _libraryImages =>
      _images.where((image) => (image['placement'] ?? 'hero') == 'library').toList();

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
      final list = await Api.getHeroImages(token);
      if (!mounted) return;
      setState(() {
        _images = list;
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

  Future<void> _add({String placement = 'hero'}) async {
    // Multi-select: the picker lets the admin choose several photos at once.
    final picked = await ImagePicker().pickMultiImage(imageQuality: 86);
    if (picked.isEmpty) return;

    setState(() => _busy = true);
    var uploaded = 0;
    var failed = 0;

    for (final file in picked) {
      try {
        await Api.addHeroImage(
          widget.token!,
          file: file,
          placement: placement,
        );
        uploaded += 1;
      } catch (_) {
        failed += 1;
      }
    }

    await _load();
    if (!mounted) return;
    setState(() => _busy = false);

    final where = placement == 'library' ? 'the photo library' : 'the hero section';
    if (uploaded > 0) {
      AppToast.show(
        context,
        failed == 0
            ? 'Added $uploaded image${uploaded == 1 ? '' : 's'} to $where.'
            : 'Added $uploaded to $where · $failed failed.',
        type: failed == 0 ? AppToastType.success : AppToastType.error,
      );
    } else {
      AppToast.show(context, 'Upload failed. Try again.', type: AppToastType.error);
    }
  }

  Future<void> _delete(dynamic image) async {
    try {
      await Api.deleteHeroImage(widget.token!, image['id'].toString());
      await _load();
      if (mounted) AppToast.show(context, 'Image removed.', type: AppToastType.success);
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

  Widget _tile(dynamic image) {
    final url = (image['url'] ?? '').toString();
    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Container(
            color: const Color(0xFF1A1A1E),
            width: double.infinity,
            height: double.infinity,
            child: url.startsWith('http')
                ? Image.network(url, fit: BoxFit.cover)
                : const Icon(Icons.image, color: Color(0xFF52525A)),
          ),
        ),
        Positioned(
          top: 6,
          right: 6,
          child: InkWell(
            onTap: () => _delete(image),
            child: Container(
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.6),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.close, size: 14, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }

  Widget _section({
    required String title,
    required String hint,
    required List<dynamic> images,
    required IconData icon,
    bool horizontal = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 15, color: const Color(0xFFD96B43)),
            const SizedBox(width: 8),
            Text(
              title,
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.2,
                color: Color(0xFFF5EFEB),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '${images.length}',
              style: const TextStyle(fontSize: 10, color: Color(0xFF52525A)),
            ),
            if (horizontal && images.length > 1) ...[
              const Spacer(),
              const Text(
                'SWIPE →',
                style: TextStyle(fontSize: 8, letterSpacing: 1, color: Color(0xFF52525A)),
              ),
            ],
          ],
        ),
        const SizedBox(height: 2),
        Text(hint, style: const TextStyle(fontSize: 10, color: Color(0xFF9E9890))),
        const SizedBox(height: 10),
        if (images.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 16),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A1E),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF2A2A2E)),
            ),
            child: Text(
              'Nothing here yet — tap Upload and choose ${title == 'HERO SECTION' ? 'Hero section' : 'Photo library'}.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11, color: Color(0xFF9E9890)),
            ),
          )
        else if (horizontal)
          SizedBox(
            height: 148,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              clipBehavior: Clip.none,
              itemCount: images.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (ctx, i) => SizedBox(width: 224, child: _tile(images[i])),
            ),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.15,
            ),
            itemCount: images.length,
            itemBuilder: (ctx, i) => _tile(images[i]),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121214),
      appBar: AppBar(
        title: Text('Gallery · ${_images.length}'),
        backgroundColor: const Color(0xFF121214),
        foregroundColor: const Color(0xFFF5EFEB),
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (_placementOpen) ...[
            FloatingActionButton.extended(
              heroTag: 'pick-hero',
              onPressed: _busy
                  ? null
                  : () {
                      setState(() => _placementOpen = false);
                      _add(placement: 'hero');
                    },
              backgroundColor: const Color(0xFFD96B43),
              foregroundColor: Colors.white,
              icon: const Icon(Icons.auto_awesome, size: 18),
              label: const Text('Hero section'),
            ),
            const SizedBox(height: 10),
            FloatingActionButton.extended(
              heroTag: 'pick-library',
              onPressed: _busy
                  ? null
                  : () {
                      setState(() => _placementOpen = false);
                      _add(placement: 'library');
                    },
              backgroundColor: const Color(0xFF1A1A1E),
              foregroundColor: const Color(0xFFF5EFEB),
              icon: const Icon(Icons.photo_library_outlined, size: 18),
              label: const Text('Photo library'),
            ),
            const SizedBox(height: 10),
          ],
          Opacity(
            opacity: _placementOpen ? 0.35 : 1,
            child: FloatingActionButton.extended(
              heroTag: 'upload',
              onPressed: _busy
                  ? null
                  : () => setState(() => _placementOpen = !_placementOpen),
              backgroundColor: const Color(0xFFD96B43),
              foregroundColor: Colors.white,
              icon: Icon(
                _placementOpen ? Icons.close : Icons.add_photo_alternate,
                size: 18,
              ),
              label: Text(_placementOpen ? 'Cancel' : 'Upload'),
            ),
          ),
        ],
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
              : RefreshIndicator(
                  color: const Color(0xFFD96B43),
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 140),
                    children: [
                      _section(
                        title: 'HERO SECTION',
                        hint: 'Photos in the landing page carousel.',
                        images: _heroImages,
                        icon: Icons.auto_awesome,
                        horizontal: true,
                      ),
                      const SizedBox(height: 26),
                      _section(
                        title: 'PHOTO LIBRARY',
                        hint: 'Photos on the photo library and gallery page.',
                        images: _libraryImages,
                        icon: Icons.photo_library_outlined,
                      ),
                    ],
                  ),
                ),
    );
  }
}
