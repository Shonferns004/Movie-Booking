import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import 'api_config.dart';
import 'auth_service.dart';

/// Pushes catalog changes from the API into the app.
///
/// The server holds one Neon Realtime subscription (Neon's own client is JS-only) and
/// forwards a tiny `{"type":"change"}` event over this WebSocket. Screens listen with
/// [onEvent] and refetch their data, so a theatre added on another device appears here
/// without any polling.
class RealtimeService {
  RealtimeService._();

  static final RealtimeService instance = RealtimeService._();

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _retry;
  int _attempt = 0;
  bool _stopped = false;

  /// Called on every server event. `topic` is `catalog`, `seats` or `payments`.
  void Function(String topic)? onEvent;

  /// Called when the socket opens, so a screen can resync after a reconnect gap.
  void Function()? onConnected;

  bool get isConnected => _channel != null;

  Future<void> connect() async {
    if (_channel != null || _stopped) return;
    _stopped = false;

    final token = await AuthService.validAccessToken(AuthService.accessToken ?? '');
    if (token.isEmpty) return;

    try {
      // The platform-agnostic channel cannot send headers on web, so the short-lived
      // access token travels as a query parameter (the server also accepts a header).
      final uri = Uri.parse('$_wsOrigin/api/v1/realtime?token=${Uri.encodeQueryComponent(token)}');
      final channel = WebSocketChannel.connect(uri);
      await channel.ready;

      _channel = channel;
      _attempt = 0;
      onConnected?.call();

      _subscription = channel.stream.listen(
        (message) {
          if (message is! String) return;
          try {
            final payload = jsonDecode(message);
            if (payload is Map && payload['type'] == 'change') {
              final topic = (payload['topic'] as String?) ?? 'catalog';
              onEvent?.call(topic);
            }
          } catch (_) {
            /* ignore malformed frames */
          }
        },
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void disconnect() {
    _stopped = true;
    _retry?.cancel();
    _retry = null;
    _subscription?.cancel();
    _subscription = null;
    _channel?.sink.close();
    _channel = null;
  }

  void _scheduleReconnect() {
    _subscription?.cancel();
    _subscription = null;
    _channel = null;
    if (_stopped) return;

    _attempt = (_attempt + 1).clamp(1, 6);
    final delay = Duration(seconds: [2, 4, 8, 16, 30, 30][_attempt - 1]);
    _retry?.cancel();
    _retry = Timer(delay, connect);
  }

  String get _wsOrigin {
    final origin = apiBaseUrl.replaceFirst(RegExp(r'/api/v1/?$'), '');
    if (origin.startsWith('https://')) {
      return origin.replaceFirst('https://', 'wss://');
    }
    return origin.replaceFirst('http://', 'ws://');
  }
}
