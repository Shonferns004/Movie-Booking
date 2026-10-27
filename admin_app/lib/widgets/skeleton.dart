import 'package:flutter/material.dart';

const Color _skeletonBase = Color(0xFF1E1E23);

/// Pulses its skeleton subtree between two opacity levels.
class SkeletonPulse extends StatefulWidget {
  final Widget child;
  final Duration duration;

  const SkeletonPulse({
    super.key,
    required this.child,
    this.duration = const Duration(milliseconds: 850),
  });

  @override
  State<SkeletonPulse> createState() => _SkeletonPulseState();
}

class _SkeletonPulseState extends State<SkeletonPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.duration);
    _opacity = Tween<double>(
      begin: 0.45,
      end: 0.92,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
    _controller.repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(opacity: _opacity, child: widget.child);
  }
}

/// A single placeholder block inside a [SkeletonPulse].
class SkeletonBox extends StatelessWidget {
  final double? width;
  final double? height;
  final BorderRadius borderRadius;
  final Color color;

  const SkeletonBox({
    super.key,
    this.width,
    this.height = 12,
    this.borderRadius = const BorderRadius.all(Radius.circular(6)),
    this.color = _skeletonBase,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(color: color, borderRadius: borderRadius),
    );
  }
}

class SkeletonCircle extends StatelessWidget {
  final double size;
  final Color color;

  const SkeletonCircle({
    super.key,
    required this.size,
    this.color = _skeletonBase,
  });

  @override
  Widget build(BuildContext context) {
    return SkeletonBox(
      width: size,
      height: size,
      borderRadius: BorderRadius.circular(size / 2),
      color: color,
    );
  }
}

/// Non-circular indeterminate loader (a sliding bar).
///
/// The circular `CircularProgressIndicator` is avoided on purpose: the app
/// uses a rounded "pill" visual language and a sweeping bar matches it.
class KkLoader extends StatefulWidget {
  const KkLoader({
    super.key,
    this.width = 120,
    this.height = 3,
    this.color = _skeletonBase,
  });

  final double width;
  final double height;
  final Color color;

  @override
  State<KkLoader> createState() => _KkLoaderState();
}

class _KkLoaderState extends State<KkLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.width,
      height: widget.height,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(widget.height / 2),
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final t = _controller.value;
            // Slide a short segment from left to right and back.
            final x = (t * 2) % 2;
            final offset = x <= 1 ? x : 2 - x;
            return Stack(
              children: [
                Container(color: widget.color),
                FractionallySizedBox(
                  widthFactor: 0.4,
                  child: Align(
                    alignment: Alignment(-1 + (2 * offset), 0),
                    child: Container(
                      decoration: BoxDecoration(
                        color: widget.color,
                        borderRadius: BorderRadius.circular(widget.height / 2),
                      ),
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

/// Card shell used by the list/screen skeletons.
class SkeletonCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final double radius;

  const SkeletonCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.margin = const EdgeInsets.only(bottom: 10),
    this.radius = 16,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1E),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: const Color(0xFF2C2C32)),
      ),
      child: child,
    );
  }
}

/// A compact seat-map placeholder: row labels plus mini seat squares.
class SeatSkeleton extends StatelessWidget {
  final int rows;
  final int seatsPerRow;

  const SeatSkeleton({super.key, this.rows = 18, this.seatsPerRow = 23});

  @override
  Widget build(BuildContext context) {
    return SkeletonPulse(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var row = 0; row < rows; row++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(
                    width: 20,
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: SkeletonBox(
                        width: 12,
                        height: 8,
                        borderRadius: BorderRadius.all(Radius.circular(2)),
                      ),
                    ),
                  ),
                  for (var seat = 0; seat < seatsPerRow; seat++)
                    const Padding(
                      padding: EdgeInsets.all(1),
                      child: SkeletonBox(
                        width: 22,
                        height: 22,
                        borderRadius: BorderRadius.all(Radius.circular(4)),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
