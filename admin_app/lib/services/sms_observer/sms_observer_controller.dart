import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'gateway_bridge.dart';
import 'observer_config.dart';
import 'observer_event.dart';

/// Local SMS observer state for the admin app.
///
/// The Kotlin side is authoritative. This controller only mirrors it and exposes
/// the actions the SMS Hub needs. It polls while the tab is visible because the
/// receiver can log an event without the UI being involved.
class SmsObserverController extends ChangeNotifier
    with WidgetsBindingObserver {
  SmsObserverController([this._bridge = const GatewayBridge()]) {
    WidgetsBinding.instance.addObserver(this);
  }

  final GatewayBridge _bridge;

  GatewayState? _state;
  String? _platformError;
  bool _busy = false;
  bool _refreshing = false;
  Timer? _poll;

  static const Duration _pollInterval = Duration(seconds: 5);

  GatewayState? get state => _state;
  ObserverConfig get config => _state?.config ?? const ObserverConfig();
  List<ObserverEvent> get events => _state?.events ?? const [];
  String? get platformError => _platformError;
  bool get busy => _busy;
  bool get isReady => _state != null;

  Future<void> start() async {
    await refresh();
    _startPolling();
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(_pollInterval, (_) {
      if (_busy || _refreshing) return;
      refresh(quiet: true);
    });
  }

  void _stopPolling() {
    _poll?.cancel();
    _poll = null;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startPolling();
      refresh(quiet: true);
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.detached) {
      _stopPolling();
    }
  }

  @override
  void dispose() {
    _stopPolling();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> refresh({bool quiet = false}) async {
    if (_refreshing) return;
    _refreshing = true;
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
      _platformError = 'The SMS observer is only available on Android.';
    } finally {
      _refreshing = false;
      _busy = false;
      notifyListeners();
    }
  }

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
      return PairDeviceResult(ok: false, httpStatus: 0, message: message);
    } on MissingPluginException {
      const message = 'The SMS observer is only available on Android.';
      _platformError = message;
      return const PairDeviceResult(
        ok: false,
        httpStatus: 0,
        message: message,
      );
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

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
    } on MissingPluginException {
      _platformError = 'The SMS observer is only available on Android.';
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
    } on MissingPluginException {
      _platformError = 'The SMS observer is only available on Android.';
    }
    notifyListeners();
  }

  Future<bool> requestSmsPermission() async {
    try {
      final granted = await _bridge.requestSmsPermission();
      await refresh(quiet: true);
      return granted;
    } on MissingPluginException {
      _platformError = 'The SMS observer is only available on Android.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> requestNotificationPermission() async {
    try {
      final granted = await _bridge.requestNotificationPermission();
      await refresh(quiet: true);
      return granted;
    } on MissingPluginException {
      _platformError = 'The SMS observer is only available on Android.';
      notifyListeners();
      return false;
    }
  }

  Future<void> setConsent(bool accepted) async {
    await _bridge.setConsent(accepted);
    await refresh(quiet: true);
  }

  Future<void> openAppSettings() async {
    try {
      await _bridge.openAppSettings();
    } on MissingPluginException {
      _platformError = 'The SMS observer is only available on Android.';
      notifyListeners();
    }
  }

  Future<void> clearLog() async {
    await _bridge.clearLog();
    await refresh(quiet: true);
  }

  Future<void> flushQueue() async {
    await _bridge.flushQueue();
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
}
