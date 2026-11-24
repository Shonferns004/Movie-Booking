import 'observer_config.dart';

/// Lifecycle of a single observed SMS.
enum EventStatus {
  /// Parsed as a credit and waiting for the gateway (network, backoff, or an
  /// unresolved receiving account).
  pending,

  /// The gateway returned 200. The payment may still be rejected downstream —
  /// [ObserverEvent.message] carries the gateway's verdict.
  sent,

  /// Permanent rejection (4xx) or the retry budget ran out.
  failed,

  /// Not forwarded on purpose: wrong sender, or not a credit message.
  ignored;

  static EventStatus fromWire(String? value) {
    return switch (value) {
      'sent' => EventStatus.sent,
      'failed' => EventStatus.failed,
      'ignored' => EventStatus.ignored,
      _ => EventStatus.pending,
    };
  }

  String get wire => name;

  String get label => switch (this) {
        EventStatus.sent => 'Forwarded',
        EventStatus.failed => 'Failed',
        EventStatus.pending => 'Waiting',
        EventStatus.ignored => 'Skipped',
      };
}

/// One bank SMS seen by the device, with its delivery state.
class ObserverEvent {
  const ObserverEvent({
    required this.id,
    required this.sender,
    required this.body,
    required this.receivedAt,
    required this.status,
    this.amount,
    this.amountPaise,
    this.reference,
    this.httpStatus = 0,
    this.message,
    this.attempts = 0,
  });

  final String id;
  final String sender;
  final String body;

  /// Epoch millis at which the SMS was received.
  final int receivedAt;

  final EventStatus status;
  final String? amount;
  final int? amountPaise;
  final String? reference;
  final int httpStatus;
  final String? message;
  final int attempts;

  DateTime get receivedAtDate =>
      DateTime.fromMillisecondsSinceEpoch(receivedAt);

  /// Gateway rejected the observation for a known business reason.
  bool get isRejected =>
      status == EventStatus.sent &&
      message != null &&
      message!.isNotEmpty &&
      !const {'ACCEPTED', 'VERIFIED', 'MATCHED'}.contains(message);

  factory ObserverEvent.fromJson(Map<String, dynamic> json) {
    return ObserverEvent(
      id: (json['id'] as String?) ?? '',
      sender: (json['sender'] as String?) ?? 'Unknown',
      body: (json['body'] as String?) ?? '',
      receivedAt: (json['receivedAt'] as num?)?.toInt() ?? 0,
      status: EventStatus.fromWire(json['status'] as String?),
      amount: json['amount'] as String?,
      amountPaise: (json['amountPaise'] as num?)?.toInt(),
      reference: json['reference'] as String?,
      httpStatus: (json['httpStatus'] as num?)?.toInt() ?? 0,
      message: json['message'] as String?,
      attempts: (json['attempts'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Aggregate counters shown on the status screen.
class GatewayStats {
  const GatewayStats({
    this.forwarded = 0,
    this.failed = 0,
    this.pending = 0,
    this.ignored = 0,
  });

  final int forwarded;
  final int failed;
  final int pending;
  final int ignored;

  int get total => forwarded + failed + pending + ignored;

  factory GatewayStats.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const GatewayStats();
    return GatewayStats(
      forwarded: (json['forwarded'] as num?)?.toInt() ?? 0,
      failed: (json['failed'] as num?)?.toInt() ?? 0,
      pending: (json['pending'] as num?)?.toInt() ?? 0,
      ignored: (json['ignored'] as num?)?.toInt() ?? 0,
    );
  }
}

/// An in-flight checkout session returned by `/api/v1/pollers/active-window`.
class ActiveSession {
  const ActiveSession({
    required this.receivingAccountId,
    required this.amount,
    required this.status,
  });

  final String receivingAccountId;
  final String amount;
  final String status;

  factory ActiveSession.fromJson(Map<String, dynamic> json) {
    return ActiveSession(
      receivingAccountId: (json['receivingAccountId'] as String?) ?? '',
      amount: (json['amount'] as String?) ?? '',
      status: (json['status'] as String?) ?? '',
    );
  }
}

/// Full snapshot rendered by the UI.
class GatewayState {
  const GatewayState({
    this.config = const ObserverConfig(),
    this.stats = const GatewayStats(),
    this.events = const [],
    this.smsPermission = false,
    this.notificationsPermission = false,
    this.gatewayReachable,
  });

  final ObserverConfig config;
  final GatewayStats stats;
  final List<ObserverEvent> events;
  final bool smsPermission;
  final bool notificationsPermission;

  /// Result of the last connection probe, when one has been run.
  final bool? gatewayReachable;

  factory GatewayState.fromJson(Map<String, dynamic> json) {
    final rawEvents = (json['events'] as List<dynamic>?) ?? const [];
    return GatewayState(
      config: ObserverConfig.fromJson(
        (json['config'] as Map<String, dynamic>?) ?? const {},
      ),
      stats: GatewayStats.fromJson(json['stats'] as Map<String, dynamic>?),
      events: rawEvents
          .whereType<Map<String, dynamic>>()
          .map(ObserverEvent.fromJson)
          .toList(growable: false),
      smsPermission: (json['smsPermission'] as bool?) ?? false,
      notificationsPermission:
          (json['notificationsPermission'] as bool?) ?? false,
      gatewayReachable: json['gatewayReachable'] as bool?,
    );
  }
}
