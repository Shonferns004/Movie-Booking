import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'api_config.dart';

/// Owns the access/refresh token pair and keeps it in SharedPreferences.
///
/// The access token is short-lived; the refresh token is used to silently
/// obtain a new pair when the access token has expired or the API returns 401.
class AuthService {
  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';
  static const _legacyTokenKey = 'token';
  static const _emailKey = 'email';
  static const _rolesKey = 'roles';

  static SharedPreferences? _prefs;
  static String? _accessToken;
  static String? _refreshToken;
  static Future<String?>? _refreshing;

  static String? get accessToken => _accessToken;
  static bool get hasToken => _accessToken?.isNotEmpty ?? false;

  static Future<void> init() async {
    if (_prefs != null) return;
    _prefs = await SharedPreferences.getInstance();
    _accessToken = _prefs!.getString(_accessKey) ?? _prefs!.getString(_legacyTokenKey);
    _refreshToken = _prefs!.getString(_refreshKey);
    // Migrate sessions created before refresh tokens existed.
    if (_accessToken != null && _prefs!.getString(_accessKey) == null) {
      await _prefs!.setString(_accessKey, _accessToken!);
    }
  }

  /// Called once at launch. Returns true when a usable session was restored.
  static Future<bool> restoreSession() async {
    await init();
    final access = _accessToken;
    if (access != null && access.isNotEmpty && !_isExpired(access)) {
      return true;
    }
    if (_refreshToken != null && _refreshToken!.isNotEmpty) {
      final renewed = await refresh();
      return renewed != null && renewed.isNotEmpty;
    }
    await logout();
    return false;
  }

  /// Returns the current access token, refreshing it first when necessary.
  ///
  /// [fallback] lets older call sites that still pass a stored token keep
  /// working without changing every screen at once.
  static Future<String> validAccessToken(String fallback) async {
    await init();
    if ((_accessToken == null || _accessToken!.isEmpty) && fallback.isNotEmpty) {
      _accessToken = fallback;
      await _persistAccess(fallback);
    }
    final token = _accessToken ?? fallback;
    if (token.isEmpty || !_isExpired(token)) return token;
    final renewed = await refresh();
    return renewed ?? token;
  }

  /// Exchanges the refresh token for a fresh access/refresh pair.
  static Future<String?> refresh() async {
    await init();
    final refreshToken = _refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) return null;
    if (_refreshing != null) return _refreshing;
    _refreshing = _performRefresh(refreshToken);
    try {
      return await _refreshing;
    } finally {
      _refreshing = null;
    }
  }

  static Future<String?> _performRefresh(String refreshToken) async {
    try {
      final res = await http.post(
        Uri.parse('$apiBaseUrl/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      );
      if (res.statusCode != 200) {
        if (res.statusCode == 400 || res.statusCode == 401 || res.statusCode == 403) {
          await logout();
        }
        return null;
      }
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      await saveSession(data);
      return _accessToken;
    } catch (_) {
      // Network failure: keep the refresh token for the next attempt.
      return null;
    }
  }

  static Future<void> saveSession(Map<String, dynamic> data) async {
    await init();
    final access = (data['accessToken'] ?? data['token'])?.toString();
    final refresh = data['refreshToken']?.toString();
    if (access == null || access.isEmpty) {
      throw Exception('Login response did not include an access token');
    }
    _accessToken = access;
    _refreshToken = refresh;
    final prefs = _prefs!;
    await prefs.setString(_accessKey, access);
    await prefs.setString(_legacyTokenKey, access);
    if (refresh != null && refresh.isNotEmpty) {
      await prefs.setString(_refreshKey, refresh);
    } else {
      await prefs.remove(_refreshKey);
    }
    final user = data['user'];
    if (user is Map) {
      if (user['email'] != null) {
        await prefs.setString(_emailKey, user['email'].toString());
      }
      final roles = user['roles'];
      if (roles is List) {
        await prefs.setString(_rolesKey, roles.join(','));
      }
    }
  }

  static Future<void> saveLogin(Map<String, dynamic> data) => saveSession(data);

  static Future<void> logout() async {
    await init();
    _accessToken = null;
    _refreshToken = null;
    final prefs = _prefs;
    if (prefs == null) return;
    await prefs.remove(_accessKey);
    await prefs.remove(_refreshKey);
    await prefs.remove(_legacyTokenKey);
    await prefs.remove(_rolesKey);
    await prefs.remove(_emailKey);
  }

  static Future<void> _persistAccess(String token) async {
    final prefs = _prefs;
    if (prefs == null) return;
    await prefs.setString(_accessKey, token);
    await prefs.setString(_legacyTokenKey, token);
  }

  /// Reads the JWT `exp` claim without verifying the signature. This is only
  /// used to decide whether a refresh should happen before making a request.
  static bool _isExpired(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return false;
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      );
      if (payload is! Map) return false;
      final exp = payload['exp'];
      if (exp is! num) return false;
      final expiresAt = exp.toInt() * 1000;
      return DateTime.now().millisecondsSinceEpoch >= expiresAt - 30000;
    } catch (_) {
      return false;
    }
  }
}
