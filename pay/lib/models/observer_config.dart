/// Observer configuration. The single source of truth lives in the Android
/// layer (SharedPreferences owned by [ObserverStore]); this class is only the
/// wire representation that crosses the method channel.
class ObserverConfig {
  const ObserverConfig({
    this.baseUrl = '',
    this.observerToken = '',
    this.receivingAccountId = '',
    this.source = 'SMS_GATEWAY',
    this.senderFilter = '',
    this.enabled = false,
    this.paired = false,
    this.deviceId = '',
    this.deviceMerchantId = '',
    this.consentAccepted = false,
  });

  /// Gateway origin, e.g. `https://movie-booking-nvmq.onrender.com/youpi`.
  final String baseUrl;

  /// Observer bearer token (`data/.secrets/observer_api_token`). Optional when
  /// the device was enrolled from the admin panel.
  final String observerToken;

  /// Receiving account UUID the credit is attributed to. When empty the app
  /// resolves it from `/api/v1/pollers/active-window` at send time (observer
  /// token mode) or lets the gateway resolve it from the merchant (paired mode).
  final String receivingAccountId;

  /// `SMS_GATEWAY` unless the deployment expects something else.
  final String source;

  /// Optional comma separated sender allow-list, e.g. `HDFCBK, ICICIB`.
  final String senderFilter;

  /// Master switch. When off the broadcast receiver drops messages untouched.
  final bool enabled;

  /// True when the admin panel pairing exchange produced a device id + signing
  /// key. The signing key itself never leaves the Android layer.
  final bool paired;

  /// Device id created by the pairing exchange.
  final String deviceId;

  /// Merchant the device is bound to; the gateway uses it to attribute credits.
  final String deviceMerchantId;
  final bool consentAccepted;

  factory ObserverConfig.fromJson(Map<String, dynamic> json) {
    return ObserverConfig(
      baseUrl: (json['baseUrl'] as String?) ?? '',
      observerToken: (json['observerToken'] as String?) ?? '',
      receivingAccountId: (json['receivingAccountId'] as String?) ?? '',
      source: (json['source'] as String?) ?? 'SMS_GATEWAY',
      senderFilter: (json['senderFilter'] as String?) ?? '',
      enabled: (json['enabled'] as bool?) ?? false,
      paired: (json['paired'] as bool?) ?? false,
      deviceId: (json['deviceId'] as String?) ?? '',
      deviceMerchantId: (json['deviceMerchantId'] as String?) ?? '',
      consentAccepted: (json['consentAccepted'] as bool?) ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'baseUrl': baseUrl,
        'observerToken': observerToken,
        'receivingAccountId': receivingAccountId,
        'source': source,
        'senderFilter': senderFilter,
        'enabled': enabled,
        'paired': paired,
        'deviceId': deviceId,
        'deviceMerchantId': deviceMerchantId,
        'consentAccepted': consentAccepted,
      };

  bool get isConfigured =>
      baseUrl.trim().isNotEmpty &&
      (observerToken.trim().isNotEmpty || paired);

  /// Paired devices do not need (and should not send) an observer token.
  String get authLabel {
    if (paired) return 'Paired device';
    if (observerToken.trim().isEmpty) return 'Not configured';
    return maskedToken;
  }

  /// Masked token for display, never renders more than the last 4 characters.
  String get maskedToken {
    final t = observerToken.trim();
    if (t.isEmpty) return '';
    if (t.length <= 8) return '••••';
    return '••••••••${t.substring(t.length - 4)}';
  }

  /// Short receiving account id for dense rows.
  String get shortAccountId {
    final id = receivingAccountId.trim();
    if (id.isEmpty) return paired ? 'Server-resolved' : 'Auto-detect';
    if (id.length <= 13) return id;
    return '${id.substring(0, 8)}…${id.substring(id.length - 4)}';
  }

  /// Short device id for the pairing card / status rows.
  String get shortDeviceId {
    final id = deviceId.trim();
    if (id.isEmpty) return '';
    if (id.length <= 13) return id;
    return '${id.substring(0, 8)}…${id.substring(id.length - 4)}';
  }

  /// Short merchant id for the pairing card.
  String get shortMerchantId {
    final id = deviceMerchantId.trim();
    if (id.isEmpty) return '';
    if (id.length <= 13) return id;
    return '${id.substring(0, 8)}…${id.substring(id.length - 4)}';
  }

  ObserverConfig copyWith({
    String? baseUrl,
    String? observerToken,
    String? receivingAccountId,
    String? source,
    String? senderFilter,
    bool? enabled,
    bool? paired,
    String? deviceId,
    String? deviceMerchantId,
    bool? consentAccepted,
  }) {
    return ObserverConfig(
      baseUrl: baseUrl ?? this.baseUrl,
      observerToken: observerToken ?? this.observerToken,
      receivingAccountId: receivingAccountId ?? this.receivingAccountId,
      source: source ?? this.source,
      senderFilter: senderFilter ?? this.senderFilter,
      enabled: enabled ?? this.enabled,
      paired: paired ?? this.paired,
      deviceId: deviceId ?? this.deviceId,
      deviceMerchantId: deviceMerchantId ?? this.deviceMerchantId,
      consentAccepted: consentAccepted ?? this.consentAccepted,
    );
  }
}
