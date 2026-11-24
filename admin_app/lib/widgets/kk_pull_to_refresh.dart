import 'package:flutter/material.dart';
import 'package:liquid_pull_to_refresh/liquid_pull_to_refresh.dart';

import '../screens/scanner_shell.dart' show KkSurface;

/// Liquid pull-to-refresh used across the admin app.
///
/// The rubber-band stretch, the spinning droplet and the spring settle all come
/// from `liquid_pull_to_refresh`; this wrapper only fixes the palette and the
/// timing so every screen feels the same.
class KkPullToRefresh extends StatelessWidget {
  const KkPullToRefresh({
    super.key,
    required this.onRefresh,
    required this.child,
    this.color,
    this.backgroundColor,
  });

  final Future<void> Function() onRefresh;
  final Widget child;
  final Color? color;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    return LiquidPullToRefresh(
      onRefresh: onRefresh,
      color: color ?? KkSurface.primary,
      backgroundColor: backgroundColor ?? KkSurface.container,
      height: 96,
      showChildOpacityTransition: false,
      springAnimationDurationInMilliseconds: 700,
      child: child,
    );
  }
}
