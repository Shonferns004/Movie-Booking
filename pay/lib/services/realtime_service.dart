import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

/// Realtime channel to the movie API.
///
/// The API holds one Neon Realtime subscription (Neon's client is JS-only, so the
/// Flutter apps cannot subscribe directly) and pushes `{type:'change', topic}` frames.
/// Topics: `catalog`, `seats`, `payments`. No row data travels over this socket - the
/// app just refreshes its own state when something it cares about changed.
///
/// The origin can be overridden at build time:
///
/// ```
/// flutter run --dart-define=REALTIME_BASE_URL=https://api.example.com
/// ```
class RealtimeService {
  RealtimeService._();

  static final RealtimeService instance = RealtimeService._();

  /// The Worker, not the payment gateway: the gateway runs on Render separately.
  static const String _defaultOrigin =
      'https://movie-worker.konkani-samudai.workers.dev';
  static const String _buildOrigin = String.fromEnvironment(
    'REALTIME_BASE_URL',
    defaultValue: _defaultOrigin,
  );
  static const String _socketPath = '/api/v1/realtime';

  String _origin = _normalizeOrigin(_buildOrigin);

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _retry;
  int _attempt = 0;
  bool _stopped = false;
  Future<void>? _connecting;

  void Function(String topic)? onEvent;
  void Function()? onConnected;
  void Function(bool connected)? onConnectionChanged;

  bool get isConnected => _channel != null;

  /// Point the socket at another API host (staging Worker, self-hosted API).
  /// Accepts an origin such as `https://api.example.com`; an empty value falls
  /// back to the build-time default. The socket reconnects when the host changes.
  Future<void> configure(String? url) async {
    final next = _normalizeOrigin(url ?? '');
    if (next == _origin) return;

    final wasStopped = _stopped;
    disconnect();
    _origin = next;
    if (!wasStopped) await connect();
  }

  Future<void> connect() {
    if (_channel != null) return Future<void>.value();

    // Only one handshake at a time; callers join the attempt already running.
    final inFlight = _connecting;
    if (inFlight != null) return inFlight;

    late final Future<void> tracked;
    tracked = _connect().whenComplete(() {
      if (identical(_connecting, tracked)) _connecting = null;
    });
    _connecting = tracked;
    return tracked;
  }

  Future<void> _connect() async {
    _retry?.cancel();
    _retry = null;
    _stopped = false;

    WebSocketChannel? channel;
    try {
      final uri = Uri.parse('${_socketOrigin(_origin)}$_socketPath');
      channel = WebSocketChannel.connect(uri);
      await channel.ready.timeout(const Duration(seconds: 15));

      // The app was paused or configured elsewhere while the handshake ran.
      if (_stopped) {
        await channel.sink.close();
        return;
      }

      _channel = channel;
      _attempt = 0;
      onConnected?.call();
      onConnectionChanged?.call(true);

      _subscription = channel.stream.listen(
        (message) {
          if (message is! String) return;
          try {
            final payload = jsonDecode(message);
            if (payload is Map && payload['type'] == 'change') {
              onEvent?.call((payload['topic'] as String?) ?? 'catalog');
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
      await channel?.sink.close();
      _scheduleReconnect();
    }
  }

  /// Drops the current socket and opens a fresh one. Used when the app returns
  /// to the foreground, where the OS may have left a half-dead connection.
  Future<void> reconnect() async {
    disconnect();
    // A handshake may already be running; wait for it to abort before opening
    // the new socket, otherwise the old attempt would swallow the reconnect.
    final inFlight = _connecting;
    if (inFlight != null) await inFlight;
    await connect();
  }

  void disconnect() {
    _stopped = true;
    _retry?.cancel();
    _retry = null;
    _subscription?.cancel();
    _subscription = null;

    final channel = _channel;
    _channel = null;
    if (channel != null) {
      channel.sink.close();
      onConnectionChanged?.call(false);
    }
  }

  void _scheduleReconnect() {
    final wasConnected = _channel != null;
    _subscription?.cancel();
    _subscription = null;
    _channel = null;
    if (wasConnected) onConnectionChanged?.call(false);
    if (_stopped || _retry != null) return;

    _attempt = (_attempt + 1).clamp(1, 6);
    final delay = Duration(seconds: [2, 4, 8, 16, 30, 30][_attempt - 1]);
    _retry?.cancel();
    _retry = Timer(delay, () {
      _retry = null;
      connect();
    });
  }

  static String _normalizeOrigin(String raw) {
    var value = raw.trim();
    if (value.isEmpty) return _defaultOrigin;
    value = value.replaceFirst(RegExp(r'/+$'), '');
    if (value.endsWith(_socketPath)) {
      value = value.substring(0, value.length - _socketPath.length);
    }
    return value;
  }

  static String _socketOrigin(String origin) {
    if (origin.startsWith('https://')) {
      return 'wss://${origin.substring('https://'.length)}';
    }
    if (origin.startsWith('http://')) {
      return 'ws://${origin.substring('http://'.length)}';
    }
    if (origin.startsWith('wss://') || origin.startsWith('ws://')) {
      return origin;
    }
    return 'wss://$origin';
  }
}
