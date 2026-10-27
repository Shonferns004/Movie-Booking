import 'dart:convert';

import 'package:flutter/services.dart';

import '../models/observer_config.dart';
import '../models/observer_event.dart';

/// Result of a manual test send from the settings screen.
class TestSendResult {
  const TestSendResult({
    required this.ok,
    required this.httpStatus,
    required this.message,
    this.response,
  });

  /// True when the observation was understood by the gateway (HTTP 2xx).
  final bool ok;
  final int httpStatus;
  final String message;
  final String? response;

  factory TestSendResult.fromJson(Map<String, dynamic> json) {
    return TestSendResult(
      ok: (json['ok'] as bool?) ?? false,
      httpStatus: (json['httpStatus'] as num?)?.toInt() ?? 0,
      message: (json['message'] as String?) ?? '',
      response: json['response'] as String?,
    );
  }
}

class ActiveWindowResult {
  const ActiveWindowResult({
    required this.ok,
    required this.message,
    this.httpStatus = 0,
    this.sessions = const [],
  });

  final bool ok;
  final int httpStatus;
  final String message;
  final List<ActiveSession> sessions;

  factory ActiveWindowResult.fromJson(Map<String, dynamic> json) {
    final raw = (json['sessions'] as List<dynamic>?) ?? const [];
    return ActiveWindowResult(
      ok: (json['ok'] as bool?) ?? false,
      httpStatus: (json['httpStatus'] as num?)?.toInt() ?? 0,
      message: (json['message'] as String?) ?? '',
      sessions: raw
          .whereType<Map<String, dynamic>>()
          .map(ActiveSession.fromJson)
          .toList(growable: false),
    );
  }
}

/// Result of an admin-panel device pairing exchange.
class PairDeviceResult {
  const PairDeviceResult({
    required this.ok,
    required this.httpStatus,
    required this.message,
    this.paired = false,
    this.deviceId = '',
    this.merchantId = '',
  });

  final bool ok;
  final int httpStatus;
  final String message;
  final bool paired;
  final String deviceId;
  final String merchantId;

  factory PairDeviceResult.fromJson(Map<String, dynamic> json) {
    return PairDeviceResult(
      ok: (json['ok'] as bool?) ?? false,
      httpStatus: (json['httpStatus'] as num?)?.toInt() ?? 0,
      message: (json['message'] as String?) ?? '',
      paired: (json['paired'] as bool?) ?? false,
      deviceId: (json['deviceId'] as String?) ?? '',
      merchantId: (json['merchantId'] as String?) ?? '',
    );
  }
}

/// Thin adapter over the `konkani.sms_gateway/bridge` method channel.
///
/// Every mutation of the observer state happens in Kotlin so the broadcast
/// receiver and the WorkManager job see exactly what the UI sees.
class GatewayBridge {
  const GatewayBridge();

  static const MethodChannel _channel =
      MethodChannel('konkani.sms_gateway/bridge');

  static Future<Map<String, dynamic>> _invoke(
    String method, [
    Map<String, dynamic>? arguments,
  ]) async {
    final result = await _channel.invokeMethod<Object?>(method, arguments);
    if (result == null) return <String, dynamic>{};
    return jsonDecode(jsonEncode(result)) as Map<String, dynamic>;
  }

  Future<GatewayState> loadState() async {
    return GatewayState.fromJson(await _invoke('getState'));
  }

  Future<GatewayState> saveConfig(ObserverConfig config) async {
    return GatewayState.fromJson(
      await _invoke('saveConfig', config.toJson()),
    );
  }

  Future<GatewayState> setEnabled(bool enabled) async {
    return GatewayState.fromJson(
      await _invoke('setEnabled', {'enabled': enabled}),
    );
  }

  /// Exchanges the admin panel's enrollment secret (or full QR JSON) for a
  /// device signing key. [baseUrl] wins over the saved URL so the user can pair
  /// before saving the form.
  Future<PairDeviceResult> pairDevice({
    required String secret,
    required String baseUrl,
  }) async {
    return PairDeviceResult.fromJson(
      await _invoke('pairDevice', {'secret': secret, 'baseUrl': baseUrl}),
    );
  }

  /// Removes the paired device credentials from this phone.
  Future<GatewayState> unpairDevice() async {
    return GatewayState.fromJson(await _invoke('unpairDevice'));
  }

  Future<void> clearLog() => _invoke('clearLog');

  /// True when the user granted RECEIVE_SMS.
  Future<bool> requestSmsPermission() async {
    final result = await _invoke('requestSmsPermission');
    return (result['granted'] as bool?) ?? false;
  }

  Future<bool> requestNotificationPermission() async {
    final result = await _invoke('requestNotificationPermission');
    return (result['granted'] as bool?) ?? false;
  }

  Future<void> openAppSettings() => _invoke('openAppSettings');

  Future<void> setConsent(bool accepted) =>
      _invoke('setConsent', {'accepted': accepted});

  Future<void> openUrl(String url) =>
      _invoke('openUrl', {'url': url});

  Future<ActiveWindowResult> fetchActiveWindow() async {
    return ActiveWindowResult.fromJson(await _invoke('fetchActiveWindow'));
  }

  Future<TestSendResult> sendTestObservation({
    required String text,
    required String sender,
  }) async {
    return TestSendResult.fromJson(
      await _invoke('testSend', {'text': text, 'sender': sender}),
    );
  }

  /// Runs the local parser without touching the network.
  Future<Map<String, dynamic>?> parsePreview(String text) async {
    final result = await _channel.invokeMethod<Object?>(
      'parsePreview',
      {'text': text},
    );
    if (result == null) return null;
    return jsonDecode(jsonEncode(result)) as Map<String, dynamic>;
  }

  /// Asks WorkManager to drain the pending queue now.
  Future<void> flushQueue() => _invoke('flushQueue');
}
