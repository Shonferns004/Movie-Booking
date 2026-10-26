import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/observer_config.dart';
import '../models/observer_event.dart';
import '../services/gateway_bridge.dart';

/// App-wide observer state. The Kotlin side is authoritative; this class only
/// mirrors it and exposes the actions the screens need.
class AppState extends ChangeNotifier with WidgetsBindingObserver {
  AppState([this._bridge = const GatewayBridge()]) {
    WidgetsBinding.instance.addObserver(this);
  }

  final GatewayBridge _bridge;

  GatewayState? _state;
  List<ActiveSession> _activeSessions = const [];
  String? _platformError;
  String? _activeWindowError;
  bool _busy = false;
  bool _refreshingActiveWindow = false;
  Timer? _poll;

  GatewayState? get state => _state;
  ObserverConfig get config => _state?.config ?? const ObserverConfig();
  List<ObserverEvent> get events => _state?.events ?? const [];
  List<ActiveSession> get activeSessions => _activeSessions;
  String? get platformError => _platformError;
  String? get activeWindowError => _activeWindowError;
  bool get busy => _busy;
  bool get refreshingActiveWindow => _refreshingActiveWindow;
  bool get isReady => _state != null;

  /// Newest event that was actually forwarded.
  ObserverEvent? get lastForwarded {
    for (final event in events) {
      if (event.status == EventStatus.sent) return event;
    }
    return null;
  }

  Future<void> start() async {
    await refresh();
    _startPolling();
  }

  void _startPolling() {
    _poll?.cancel();
    // Keeps the dashboard honest while the app is in the foreground: the
    // receiver can log events without the UI being involved.
    _poll = Timer.periodic(const Duration(seconds: 8), (_) {
      if (_busy) return;
      refresh(quiet: true);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      refresh(quiet: true);
      _startPolling();
    } else if (state == AppLifecycleState.paused) {
      _poll?.cancel();
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> refresh({bool quiet = false}) async {
    if (!quiet) {
      _busy = true;
      notifyListeners();
    }
    try {
      _state = await _bridge.loadState();
      _platformError = null;
    } on PlatformException catch (error) {
      _platformError = error.message ?? error.code;
    } on MissingPluginException {
      _platformError = 'The native SMS bridge is unavailable on this device.';
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<bool> saveConfig(ObserverConfig next) async {
    _busy = true;
    notifyListeners();
    try {
      _state = await _bridge.saveConfig(next);
      _platformError = null;
      return true;
    } on PlatformException catch (error) {
      _platformError = error.message ?? error.code;
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> setEnabled(bool enabled) async {
    try {
      _state = await _bridge.setEnabled(enabled);
      _platformError = null;
    } on PlatformException catch (error) {
      _platformError = error.message ?? error.code;
    }
    notifyListeners();
  }

  /// Pairs this phone with the admin panel's enrollment secret.
  Future<PairDeviceResult> pairDevice({
    required String secret,
    required String baseUrl,
  }) async {
    _busy = true;
    notifyListeners();
    try {
      final result = await _bridge.pairDevice(secret: secret, baseUrl: baseUrl);
      _state = await _bridge.loadState();
      _platformError = result.ok ? null : result.message;
      return result;
    } on PlatformException catch (error) {
      final message = error.message ?? error.code;
      _platformError = message;
      return PairDeviceResult(
        ok: false,
        httpStatus: 0,
        message: message,
      );
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Forgets the device credentials on this phone (the server-side device
  /// registration is removed from the admin panel).
  Future<bool> unpairDevice() async {
    _busy = true;
    notifyListeners();
    try {
      _state = await _bridge.unpairDevice();
      _platformError = null;
      return true;
    } on PlatformException catch (error) {
      _platformError = error.message ?? error.code;
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<bool> requestSmsPermission() async {
    final granted = await _bridge.requestSmsPermission();
    await refresh(quiet: true);
    return granted;
  }

  Future<bool> requestNotificationPermission() async {
    final granted = await _bridge.requestNotificationPermission();
    await refresh(quiet: true);
    return granted;
  }

  Future<void> openAppSettings() => _bridge.openAppSettings();

  Future<void> clearLog() async {
    await _bridge.clearLog();
    await refresh(quiet: true);
  }

  Future<void> flushQueue() async {
    await _bridge.flushQueue();
    // The worker runs asynchronously; give it a moment before re-reading.
    await Future<void>.delayed(const Duration(milliseconds: 600));
    await refresh(quiet: true);
  }

  Future<TestSendResult> sendTest({
    required String text,
    required String sender,
  }) async {
    final result = await _bridge.sendTestObservation(text: text, sender: sender);
    await refresh(quiet: true);
    return result;
  }

  Future<Map<String, dynamic>?> parsePreview(String text) =>
      _bridge.parsePreview(text);

  Future<void> refreshActiveWindow() async {
    if (!config.isConfigured || _refreshingActiveWindow) return;
    _refreshingActiveWindow = true;
    _activeWindowError = null;
    notifyListeners();
    try {
      final result = await _bridge.fetchActiveWindow();
      _activeSessions = result.sessions;
      if (!result.ok) {
        _activeSessions = const [];
        _activeWindowError = result.message.isEmpty
            ? 'Gateway returned HTTP ${result.httpStatus}'
            : result.message;
      }
    } on PlatformException catch (error) {
      _activeSessions = const [];
      _activeWindowError = error.message ?? error.code;
    } finally {
      _refreshingActiveWindow = false;
      notifyListeners();
    }
  }
}

/// `InheritedNotifier` avoids pulling in a state-management package for what
/// is a single observable object.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({
    super.key,
    required AppState state,
    required super.child,
  }) : super(notifier: state);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope is missing from the widget tree');
    return scope!.notifier!;
  }
}
