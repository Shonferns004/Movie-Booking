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

  static Future<List<dynamic>> getScanHistory(String token) =>
      _getList(token, '/staff/scan-history', 'Failed to load scan history');

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
      // MultipartFile.fromPath defaults to application/octet-stream, so the
      // real image mime type has to be supplied explicitly.
      req.files.add(await http.MultipartFile.fromPath(
        'file',
        file.path,
        filename: file.name.isEmpty ? 'upload' : file.name,
        contentType: _mediaTypeFor(file),
      ));
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

  /// Best-effort image mime type for the uploaded part.
  static http.MediaType _mediaTypeFor(XFile file) {
    final name = file.name.toLowerCase();
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
      return http.MediaType('image', 'jpeg');
    }
    if (name.endsWith('.png')) return http.MediaType('image', 'png');
    if (name.endsWith('.gif')) return http.MediaType('image', 'gif');
    if (name.endsWith('.webp')) return http.MediaType('image', 'webp');
    if (name.endsWith('.bmp')) return http.MediaType('image', 'bmp');
    if (name.endsWith('.heic')) return http.MediaType('image', 'heic');
    if (name.endsWith('.heif')) return http.MediaType('image', 'heif');
    if (name.endsWith('.avif')) return http.MediaType('image', 'avif');
    if (name.endsWith('.svg')) return http.MediaType('image', 'svg+xml');
    if (name.endsWith('.tif') || name.endsWith('.tiff')) {
      return http.MediaType('image', 'tiff');
    }
    return http.MediaType('image', 'jpeg');
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

  // --- Community content (landing page) -------------------------------------
  static Future<List<dynamic>> getCommunityEvents(String token) async {
    final data = await _getMap(token, '/community/admin/events', 'Failed to load events');
    return (data['events'] as List?) ?? const [];
  }

  static Future<void> createCommunityEvent(String token, Map<String, dynamic> data) async {
    final res = await _request(token, 'POST', '/community/admin/events', body: data);
    if (res.statusCode != 201) throw Exception('Failed to create event: ${res.body}');
  }

  static Future<void> deleteCommunityEvent(String token, String id) async {
    final res = await _request(token, 'DELETE', '/community/admin/events/$id');
    if (res.statusCode != 200) throw Exception('Failed to delete event: ${res.body}');
  }

  static Future<List<dynamic>> getCommunityNotices(String token) async {
    final data = await _getMap(token, '/community/admin/notices', 'Failed to load notices');
    return (data['notices'] as List?) ?? const [];
  }

  static Future<void> createCommunityNotice(String token, Map<String, dynamic> data) async {
    final res = await _request(token, 'POST', '/community/admin/notices', body: data);
    if (res.statusCode != 201) throw Exception('Failed to create notice: ${res.body}');
  }

  static Future<void> deleteCommunityNotice(String token, String id) async {
    final res = await _request(token, 'DELETE', '/community/admin/notices/$id');
    if (res.statusCode != 200) throw Exception('Failed to delete notice: ${res.body}');
  }

  static Future<List<dynamic>> getHeroImages(String token) async {
    final data = await _getMap(token, '/community/admin/hero', 'Failed to load hero images');
    return (data['images'] as List?) ?? const [];
  }

  static Future<void> addHeroImage(
    String token, {
    String? url,
    XFile? file,
    String? caption,
  }) async {
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/community/admin/hero'));
    request.headers['Authorization'] = 'Bearer $token';
    if (caption != null && caption.trim().isNotEmpty) request.fields['caption'] = caption.trim();
    if (url != null && url.trim().isNotEmpty) request.fields['url'] = url.trim();
    if (file != null) {
      request.files.add(await http.MultipartFile.fromPath(
        'file',
        file.path,
        filename: file.name.isEmpty ? 'hero.jpg' : file.name,
        contentType: _mediaTypeFor(file),
      ));
    }
    final res = await request.send();
    final body = await res.stream.bytesToString();
    if (res.statusCode != 201) throw Exception('Could not add image: $body');
  }

  static Future<void> deleteHeroImage(String token, String id) async {
    final res = await _request(token, 'DELETE', '/community/admin/hero/$id');
    if (res.statusCode != 200) throw Exception('Failed to delete image: ${res.body}');
  }

  static Future<Map<String, dynamic>> getEventTicketSettings(String token) async {
    final data = await _getMap(
      token,
      '/community/admin/event-ticket',
      'Failed to load event ticket settings',
    );
    return (data['settings'] as Map?)?.cast<String, dynamic>() ?? const {};
  }

  static Future<void> updateEventTicketBackground(String token, String url) async {
    final res = await _request(
      token,
      'PATCH',
      '/community/admin/event-ticket',
      body: {'backgroundUrl': url},
    );
    if (res.statusCode != 200) {
      throw Exception('Failed to update ticket background: ${res.body}');
    }
  }

  /** Uploads an image and returns its public URL (no gallery row is created). */
  static Future<String> uploadCommunityImage(String token, XFile file) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$baseUrl/community/admin/upload'),
    );
    request.headers['Authorization'] = 'Bearer $token';
    request.files.add(await http.MultipartFile.fromPath(
      'file',
      file.path,
      filename: file.name.isEmpty ? 'image.jpg' : file.name,
      contentType: _mediaTypeFor(file),
    ));
    final res = await request.send();
    final body = await res.stream.bytesToString();
    if (res.statusCode != 201) throw Exception('Upload failed: $body');
    final data = jsonDecode(body);
    return (data['url'] ?? '').toString();
  }

  static Future<List<dynamic>> getCommunityMembers(String token) async {
    final data = await _getMap(token, '/community/admin/members', 'Failed to load members');
    return (data['members'] as List?) ?? const [];
  }

  static Future<Map<String, dynamic>> getMembershipSettings(String token) async {
    final data = await _getMap(
      token,
      '/community/admin/membership',
      'Failed to load membership settings',
    );
    return (data['plan'] as Map?)?.cast<String, dynamic>() ?? const {};
  }

  static Future<Map<String, dynamic>> updateMembershipAmount(
    String token,
    int amountMinor,
  ) async {
    final res = await _request(
      token,
      'PATCH',
      '/community/admin/membership',
      body: {'amountMinor': amountMinor},
    );
    if (res.statusCode != 200) {
      throw Exception('Failed to update membership price: ${res.body}');
    }
    final data = jsonDecode(res.body);
    return (data['plan'] as Map?)?.cast<String, dynamic>() ?? const {};
  }

  static Future<void> createCommunityMember(String token, Map<String, dynamic> data) async {
    final res = await _request(token, 'POST', '/community/admin/members', body: data);
    if (res.statusCode != 201) throw Exception('Failed to add member: ${res.body}');
  }

  static Future<void> updateCommunityMember(
    String token,
    String id,
    Map<String, dynamic> data,
  ) async {
    final res = await _request(token, 'PATCH', '/community/admin/members/$id', body: data);
    if (res.statusCode != 200) throw Exception('Failed to update member: ${res.body}');
  }

  static Future<void> deleteCommunityMember(String token, String id) async {
    final res = await _request(token, 'DELETE', '/community/admin/members/$id');
    if (res.statusCode != 200) throw Exception('Failed to delete member: ${res.body}');
  }

  static Map<String, dynamic> jsonDecode(String body) =>
      json.decode(body) as Map<String, dynamic>;
}
