import 'package:flutter_test/flutter_test.dart';
import 'package:konkani_sms_gateway/models/observer_config.dart';
import 'package:konkani_sms_gateway/models/observer_event.dart';

void main() {
  test('ObserverConfig round-trips through the wire format', () {
    const config = ObserverConfig(
      baseUrl: 'http://192.168.0.151:4000/youpi',
      observerToken: 'observer-token-value',
      receivingAccountId: '00000000-0000-0000-0000-000000000002',
      senderFilter: 'HDFCBK, ICICIB',
      enabled: true,
    );

    final restored = ObserverConfig.fromJson(config.toJson());

    expect(restored.baseUrl, config.baseUrl);
    expect(restored.observerToken, config.observerToken);
    expect(restored.receivingAccountId, config.receivingAccountId);
    expect(restored.source, 'SMS_GATEWAY');
    expect(restored.senderFilter, config.senderFilter);
    expect(restored.enabled, isTrue);
    expect(restored.isConfigured, isTrue);
  });

  test('maskedToken never exposes the whole secret', () {
    const config = ObserverConfig(observerToken: 'abcdefghijklmnop');
    expect(config.maskedToken, '••••••••mnop');
    expect(config.maskedToken.contains('abcdefgh'), isFalse);
  });

  test('a paired config is configured without an observer token', () {
    const config = ObserverConfig(
      baseUrl: 'http://192.168.0.151:4000/youpi',
      paired: true,
      deviceId: '12345678-aaaa-bbbb-cccc-1234567890ab',
      deviceMerchantId: '00000000-0000-0000-0000-000000000001',
      enabled: true,
    );

    expect(config.isConfigured, isTrue);
    expect(config.shortDeviceId, '12345678…90ab');
    expect(config.shortMerchantId, '00000000…0001');
    expect(config.shortAccountId, 'Server-resolved');
    expect(config.authLabel, 'Paired device');

    final restored = ObserverConfig.fromJson(config.toJson());
    expect(restored.paired, isTrue);
    expect(restored.deviceId, config.deviceId);
    expect(restored.deviceMerchantId, config.deviceMerchantId);
    expect(restored.isConfigured, isTrue);
  });

  test('an unpaired config still needs an observer token', () {
    const config = ObserverConfig(baseUrl: 'http://192.168.0.151:4000/youpi');
    expect(config.isConfigured, isFalse);
    expect(config.authLabel, 'Not configured');

    const withToken = ObserverConfig(
      baseUrl: 'http://192.168.0.151:4000/youpi',
      observerToken: 'abcdefghijklmnop',
    );
    expect(withToken.isConfigured, isTrue);
    expect(withToken.authLabel, '••••••••mnop');
  });

  test('ObserverEvent parses a forwarded observation', () {
    final event = ObserverEvent.fromJson(const {
      'id': 'evt-1',
      'sender': 'HDFCBK',
      'body': 'Rs.20.00 credited ... ref 412345678901',
      'receivedAt': 1729600000000,
      'status': 'sent',
      'amount': '20.00',
      'amountPaise': 2000,
      'reference': '412345678901',
      'httpStatus': 200,
      'message': 'VERIFIED',
      'attempts': 1,
    });

    expect(event.status, EventStatus.sent);
    expect(event.amountPaise, 2000);
    expect(event.reference, '412345678901');
    expect(event.isRejected, isFalse);
  });

  test('a 2xx with a business rejection is flagged', () {
    final event = ObserverEvent.fromJson(const {
      'id': 'evt-2',
      'sender': 'HDFCBK',
      'body': 'credit',
      'receivedAt': 1729600000000,
      'status': 'sent',
      'httpStatus': 200,
      'message': 'LATE_UNMATCHED',
    });

    expect(event.isRejected, isTrue);
  });

  test('unknown wire statuses fall back to pending', () {
    expect(EventStatus.fromWire('something-new'), EventStatus.pending);
    expect(EventStatus.fromWire(null), EventStatus.pending);
    expect(EventStatus.fromWire('failed'), EventStatus.failed);
  });
}
