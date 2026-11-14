import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/api.dart';
import '../widgets/app_toast.dart';

/// Hero images for the community landing page: add, preview, delete.
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

  Future<void> _add({bool fromDevice = false}) async {
    final url = TextEditingController();
    final caption = TextEditingController();
    XFile? picked;

    if (fromDevice) {
      picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 86);
      if (picked == null) return;
    }

    if (!fromDevice) {
      if (!mounted) return;
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF1A1A1E),
          title: const Text('Add hero image'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: url,
                decoration: const InputDecoration(labelText: 'Image URL'),
              ),
              TextField(
                controller: caption,
                decoration: const InputDecoration(labelText: 'Caption (optional)'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
          ],
        ),
      );
      if (ok != true) return;
      if (url.text.trim().isEmpty) {
        if (mounted) AppToast.show(context, 'Enter an image URL.', type: AppToastType.error);
        return;
      }
    }

    setState(() => _busy = true);
    try {
      await Api.addHeroImage(
        widget.token!,
        url: fromDevice ? null : url.text.trim(),
        file: picked,
        caption: caption.text,
      );
      await _load();
      if (mounted) AppToast.show(context, 'Hero image added.', type: AppToastType.success);
    } catch (e) {
      if (mounted) {
        AppToast.show(
          context,
          e.toString().replaceFirst('Exception: ', ''),
          type: AppToastType.error,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
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
          FloatingActionButton.extended(
            heroTag: 'hero-url',
            onPressed: _busy ? null : () => _add(),
            backgroundColor: const Color(0xFF1A1A1E),
            foregroundColor: const Color(0xFFF5EFEB),
            icon: const Icon(Icons.link, size: 18),
            label: const Text('Add by URL'),
          ),
          const SizedBox(height: 10),
          FloatingActionButton.extended(
            heroTag: 'hero-upload',
            onPressed: _busy ? null : () => _add(fromDevice: true),
            backgroundColor: const Color(0xFFD96B43),
            foregroundColor: Colors.white,
            icon: const Icon(Icons.add_photo_alternate, size: 18),
            label: const Text('Upload'),
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
              : _images.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'No hero images yet.\nAdd photos to replace the gradient hero.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Color(0xFF9E9890)),
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      color: const Color(0xFFD96B43),
                      onRefresh: _load,
                      child: GridView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 140),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 1.15,
                        ),
                        itemCount: _images.length,
                        itemBuilder: (ctx, i) {
                          final image = _images[i];
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
                        },
                      ),
                    ),
    );
  }
}
