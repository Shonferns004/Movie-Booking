import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Thin client for the YouPI merchant-admin API.
///
/// The admin panel uses a separate bearer token (`ADMIN_TOKEN` on Render); the
/// movie admin JWT is not accepted by these routes.
class YoupiAdminApi {
  static const String base =
      'https://movie-booking-2-3owk.onrender.com/youpi/api/v1';
  static const String tokenKey = 'youpi_admin_token';
  static String token = '';

  static Future<void> loadToken() async {
    final prefs = await SharedPreferences.getInstance();
    token = prefs.getString(tokenKey) ?? '';
  }

  static Future<void> saveToken(String value) async {
    token = value.trim();
    final prefs = await SharedPreferences.getInstance();
    if (token.isEmpty) {
      await prefs.remove(tokenKey);
    } else {
      await prefs.setString(tokenKey, token);
    }
  }

  static Map<String, String> _headers({bool json = false}) => {
        if (token.isNotEmpty) 'Authorization': 'Bearer $token',
        if (json) 'Content-Type': 'application/json',
      };

  static Future<Map<String, dynamic>> get(String path) async {
    final response = await http.get(
      Uri.parse('$base$path'),
      headers: _headers(),
    );
    return _decode(response);
  }

  static Future<Map<String, dynamic>> post(
    String path, [
    Map<String, dynamic>? body,
  ]) async {
    final response = await http.post(
      Uri.parse('$base$path'),
      headers: _headers(json: true),
      body: jsonEncode(body ?? const <String, dynamic>{}),
    );
    return _decode(response);
  }

  static Future<Map<String, dynamic>> delete(String path) async {
    final response = await http.delete(
      Uri.parse('$base$path'),
      headers: _headers(),
    );
    return _decode(response);
  }

  /// Test SMS goes through the observer intake, not the admin namespace.
  static Future<Map<String, dynamic>> sendTestSms({
    required String sender,
    required String body,
  }) async {
    final response = await http.post(
      Uri.parse('$base/observers/sms'),
      headers: const {'Content-Type': 'application/json'},
      body: jsonEncode({
        'sender': sender,
        'body': body,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      }),
    );
    return _decode(response);
  }

  static Map<String, dynamic> _decode(http.Response response) {
    Map<String, dynamic> data = <String, dynamic>{};
    if (response.body.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map) data = decoded.cast<String, dynamic>();
      } catch (_) {
        // Non-JSON error page.
      }
    }
    if (response.statusCode >= 400) {
      throw Exception(
        data['error']?.toString() ??
            data['message']?.toString() ??
            'Gateway request failed (${response.statusCode})',
      );
    }
    return data;
  }
}
