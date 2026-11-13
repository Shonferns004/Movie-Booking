import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

/// Realtime channel to the movie API.
///
/// The API holds one Neon Realtime subscription (Neon's client is JS-only, so the
/// Flutter apps cannot subscribe directly) and pushes `{type:'change', topic}` frames.
/// Topics: `catalog`, `seats`, `payments`. No row data travels over this socket - the
/// app just refreshes its own state when something it cares about changed.
class RealtimeService {
  RealtimeService._() ;

  static final RealtimeService instance = RealtimeService._();

  /// The Worker, not the payment gateway: the gateway runs on Render separately.
  static const String _apiOrigin = 'https://movie-worker.konkani-samudai.workers.dev';

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _retry;
  int _attempt = 0;
  bool _stopped = false;

  void Function(String topic)? onEvent;
  void Function()? onConnected;

  bool get isConnected => _channel != null;

  Future<void> connect() async {
    if (_channel != null) return;
    _stopped = false;

    try {
      final uri = Uri.parse('${_apiOrigin.replaceFirst('https://', 'wss://')}/api/v1/realtime');
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
}
