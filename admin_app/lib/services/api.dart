import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import 'api_config.dart';
import 'auth_service.dart';

class Api {
  static const baseUrl = apiBaseUrl;

  static Future<http.Response> _request(
    String token,
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$baseUrl$path');

    Future<http.Response> send(String activeToken) {
      final headers = body != null
          ? {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $activeToken',
            }
          : {'Authorization': 'Bearer $activeToken'};
      switch (method) {
        case 'GET':
          return http.get(uri, headers: headers);
        case 'POST':
          return http.post(
            uri,
            headers: headers,
            body: body == null ? null : jsonEncode(body),
          );
        case 'PATCH':
          return http.patch(
            uri,
            headers: headers,
            body: body == null ? null : jsonEncode(body),
          );
        case 'DELETE':
          return http.delete(uri, headers: headers);
        default:
          throw ArgumentError('Unsupported method: $method');
      }
    }

    var activeToken = await AuthService.validAccessToken(token);
    var res = await send(activeToken);
    if (res.statusCode == 401) {
      final renewed = await AuthService.refresh();
      if (renewed != null && renewed.isNotEmpty) {
        activeToken = renewed;
        res = await send(activeToken);
      }
    }
    return res;
  }

  static Future<List<dynamic>> _getList(
    String token,
    String path,
    String error,
  ) async {
    final res = await _request(token, 'GET', path);
    if (res.statusCode == 200) return json.decode(res.body) as List<dynamic>;
    throw Exception(error);
  }

  static Future<Map<String, dynamic>> _getMap(
    String token,
    String path,
    String error,
  ) async {
    final res = await _request(token, 'GET', path);
    if (res.statusCode == 200) return jsonDecode(res.body);
    throw Exception(error);
  }

  static Future<Map<String, dynamic>> login(
    String email,
    String password,
  ) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (res.statusCode == 200) {
      return jsonDecode(res.body);
    }
    throw Exception('Login failed: ${res.body}');
  }

  static Future<Map<String, dynamic>> validateTicket(
    String token,
    String ticketReference, {
    String? showId,
  }) async {
    final body = <String, dynamic>{'ticketReference': ticketReference};
    if (showId != null) body['showId'] = showId;
    final res = await _request(
      token,
      'POST',
      '/staff/tickets/validate',
      body: body,
    );
    return jsonDecode(res.body);
  }

  static Future<List<dynamic>> getMovies(String token) =>
      _getList(token, '/movies', 'Failed to load movies');

  static Future<Map<String, dynamic>> getMovie(String token, String movieId) =>
      _getMap(token, '/movies/$movieId', 'Failed to load movie');

  static Future<void> updateMovie(
    String token,
    String movieId,
    Map<String, dynamic> data,
  ) async {
    final res = await _request(token, 'PATCH', '/movies/$movieId', body: data);
    if (res.statusCode != 200) {
      throw Exception('Failed to update movie: ${res.body}');
    }
  }

  static Future<Map<String, dynamic>> createMovie(
    String token,
    Map<String, dynamic> data,
  ) async {
    final res = await _request(token, 'POST', '/movies', body: data);
    if (res.statusCode == 201) return jsonDecode(res.body);
    throw Exception('Failed to create movie: ${res.body}');
  }

  static Future<List<dynamic>> getShows(String token) =>
      _getList(token, '/shows', 'Failed to load shows');

  static Future<List<dynamic>> getBookings(String token) =>
      _getList(token, '/bookings', 'Failed to load bookings');

  static Future<List<dynamic>> getTheatres(String token) =>
      _getList(token, '/theatres', 'Failed to load theatres');

  static Future<Map<String, dynamic>> createTheatre(
    String token,
    String name,
    String? address,
  ) async {
    final res = await _request(
      token,
      'POST',
      '/admin/theatres',
      body: {'name': name, 'address': address},
    );
    if (res.statusCode == 201) return jsonDecode(res.body);
    throw Exception('Failed to create theatre: ${res.body}');
  }

  static Future<void> updateTheatre(
    String token,
    String id,
    String name,
    String? address,
  ) async {
    final res = await _request(
      token,
      'PATCH',
      '/admin/theatres/$id',
      body: {'name': name, 'address': address},
    );
    if (res.statusCode != 200) {
      throw Exception('Failed to update theatre: ${res.body}');
    }
  }

  static Future<void> deleteTheatre(String token, String id) async {
    final res = await _request(token, 'DELETE', '/admin/theatres/$id');
    if (res.statusCode != 200) {
      throw Exception('Failed to delete theatre: ${res.body}');
    }
  }

  static Future<List<dynamic>> getAuditoriums(String token, String theatreId) =>
      _getList(
        token,
        '/theatres/$theatreId/auditoriums',
        'Failed to load auditoriums',
      );

  static Future<Map<String, dynamic>> createAuditorium(
    String token,
    String theatreId,
    String name,
  ) async {
    final res = await _request(
      token,
      'POST',
      '/admin/theatres/$theatreId/auditoriums',
      body: {'name': name},
    );
    if (res.statusCode == 201) return jsonDecode(res.body);
    throw Exception('Failed to create auditorium: ${res.body}');
  }

  static Future<List<dynamic>> getCategories(String token) =>
      _getList(token, '/theatres/categories', 'Failed to load categories');

  static Future<Map<String, dynamic>> getShowSeats(
    String token,
    String showId,
  ) => _getMap(token, '/shows/$showId/seats', 'Failed to load show seats');

  static Future<Map<String, dynamic>> getLayout(
    String token,
    String auditoriumId,
  ) => _getMap(
    token,
    '/theatres/auditoriums/$auditoriumId/layout',
    'Failed to load layout',
  );

  static Future<void> saveLayout(
    String token,
    String auditoriumId,
    int rows,
    int cols,
    List<dynamic> grid,
  ) async {
    final res = await _request(
      token,
      'POST',
      '/admin/auditoriums/$auditoriumId/layout',
      body: {'rows': rows, 'cols': cols, 'grid': grid},
    );
    if (res.statusCode != 201 && res.statusCode != 200) {
      throw Exception('Failed to save layout: ${res.body}');
    }
  }

  static Future<void> deleteShow(String token, String showId) async {
    final res = await _request(token, 'DELETE', '/shows/$showId');
    if (res.statusCode != 200) {
      throw Exception('Failed to delete show: ${res.body}');
    }
  }

  static Future<String?> uploadMedia(
    String token,
    String movieId,
    XFile file,
    String type,
  ) async {
    Future<http.StreamedResponse> send(String activeToken) async {
      final req = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/movies/$movieId/media'),
      );
      req.headers['Authorization'] = 'Bearer $activeToken';
      req.fields['type'] = type;
      req.files.add(await http.MultipartFile.fromPath('file', file.path));
      return req.send();
    }

    var activeToken = await AuthService.validAccessToken(token);
    var res = await send(activeToken);
    var body = await res.stream.bytesToString();
    if (res.statusCode == 401) {
      final renewed = await AuthService.refresh();
      if (renewed != null && renewed.isNotEmpty) {
        activeToken = renewed;
        res = await send(activeToken);
        body = await res.stream.bytesToString();
      }
    }
    if (res.statusCode == 201) {
      final j = jsonDecode(body);
      return j['url'] as String?;
    }
    throw Exception('Upload failed: $body');
  }

  static Future<void> updateShow(
    String token,
    String showId,
    Map<String, dynamic> data,
  ) async {
    final res = await _request(token, 'PATCH', '/shows/$showId', body: data);
    if (res.statusCode != 200) {
      throw Exception('Failed to update show: ${res.body}');
    }
  }

  static Future<Map<String, dynamic>> createShow(
    String token,
    Map<String, dynamic> data,
  ) async {
    final res = await _request(token, 'POST', '/shows', body: data);
    if (res.statusCode == 201) return jsonDecode(res.body);
    throw Exception('Failed to create show: ${res.body}');
  }

  static Map<String, dynamic> jsonDecode(String body) =>
      json.decode(body) as Map<String, dynamic>;
}
