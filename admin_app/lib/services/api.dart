import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'dart:convert';

class Api {
  // static const baseUrl = 'http://192.168.0.150:4000/api/v1';
  static const baseUrl = 'https://movie-booking-roan-nine.vercel.app/api/v1';

  static Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}));
    if (res.statusCode == 200) {
      return jsonDecode(res.body);
    }
    throw Exception('Login failed: ${res.body}');
  }

  static Future<Map<String, dynamic>> validateTicket(String token, String ticketReference, {String? showId}) async {
    final body = <String, dynamic>{'ticketReference': ticketReference};
    if (showId != null) body['showId'] = showId;
    final res = await http.post(Uri.parse('$baseUrl/staff/tickets/validate'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode(body));
    return jsonDecode(res.body);
  }

  static Future<List<dynamic>> getMovies(String token) async {
    final res = await http.get(Uri.parse('$baseUrl/movies'), headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode == 200) return json.decode(res.body) as List<dynamic>;
    throw Exception('Failed to load movies');
  }

  static Future<Map<String, dynamic>> createMovie(String token, Map<String, dynamic> data) async {
    final res = await http.post(Uri.parse('$baseUrl/movies'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode(data));
    if (res.statusCode == 201) return jsonDecode(res.body);
    throw Exception('Failed to create movie: ${res.body}');
  }

  static Future<List<dynamic>> getShows(String token) async {
    final res = await http.get(Uri.parse('$baseUrl/shows'), headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode == 200) return json.decode(res.body) as List<dynamic>;
    throw Exception('Failed to load shows');
  }

  static Future<List<dynamic>> getBookings(String token) async {
    final res = await http.get(Uri.parse('$baseUrl/bookings'), headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode == 200) return json.decode(res.body) as List<dynamic>;
    throw Exception('Failed to load bookings');
  }

  static Future<List<dynamic>> getTheatres(String token) async {
    final res = await http.get(Uri.parse('$baseUrl/theatres'), headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode == 200) return json.decode(res.body) as List<dynamic>;
    throw Exception('Failed to load theatres');
  }

  static Future<Map<String, dynamic>> createTheatre(String token, String name, String? address) async {
    final res = await http.post(Uri.parse('$baseUrl/admin/theatres'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode({'name': name, 'address': address}));
    if (res.statusCode == 201) return jsonDecode(res.body);
    throw Exception('Failed to create theatre: ${res.body}');
  }

  static Future<void> updateTheatre(String token, String id, String name, String? address) async {
    final res = await http.patch(Uri.parse('$baseUrl/admin/theatres/$id'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode({'name': name, 'address': address}));
    if (res.statusCode != 200) throw Exception('Failed to update theatre: ${res.body}');
  }

  static Future<void> deleteTheatre(String token, String id) async {
    final res = await http.delete(Uri.parse('$baseUrl/admin/theatres/$id'), headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode != 200) throw Exception('Failed to delete theatre: ${res.body}');
  }

  static Future<List<dynamic>> getAuditoriums(String token, String theatreId) async {
    final res = await http.get(Uri.parse('$baseUrl/theatres/$theatreId/auditoriums'), headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode == 200) return json.decode(res.body) as List<dynamic>;
    throw Exception('Failed to load auditoriums');
  }

  static Future<Map<String, dynamic>> createAuditorium(String token, String theatreId, String name) async {
    final res = await http.post(Uri.parse('$baseUrl/admin/theatres/$theatreId/auditoriums'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode({'name': name}));
    if (res.statusCode == 201) return jsonDecode(res.body);
    throw Exception('Failed to create auditorium: ${res.body}');
  }

  static Future<List<dynamic>> getCategories(String token) async {
    final res = await http.get(Uri.parse('$baseUrl/theatres/categories'), headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode == 200) return json.decode(res.body) as List<dynamic>;
    throw Exception('Failed to load categories');
  }

  static Future<Map<String, dynamic>> getShowSeats(String token, String showId) async {
    final res = await http.get(Uri.parse('$baseUrl/shows/$showId/seats'), headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode == 200) return jsonDecode(res.body);
    throw Exception('Failed to load show seats');
  }

  static Future<Map<String, dynamic>> getLayout(String token, String auditoriumId) async {
    final res = await http.get(Uri.parse('$baseUrl/theatres/auditoriums/$auditoriumId/layout'), headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode == 200) return jsonDecode(res.body);
    throw Exception('Failed to load layout');
  }

  static Future<void> saveLayout(String token, String auditoriumId, int rows, int cols, List<dynamic> grid) async {
    final res = await http.post(Uri.parse('$baseUrl/admin/auditoriums/$auditoriumId/layout'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode({'rows': rows, 'cols': cols, 'grid': grid}));
    if (res.statusCode != 201 && res.statusCode != 200) throw Exception('Failed to save layout: ${res.body}');
  }

  static Future<void> deleteShow(String token, String showId) async {
    final res = await http.delete(Uri.parse('$baseUrl/shows/$showId'), headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode != 200) throw Exception('Failed to delete show: ${res.body}');
  }

  static Future<String?> uploadMedia(String token, String movieId, XFile file, String type) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/movies/$movieId/media'));
    req.headers['Authorization'] = 'Bearer $token';
    req.fields['type'] = type;
    req.files.add(await http.MultipartFile.fromPath('file', file.path));
    final res = await req.send();
    final body = await res.stream.bytesToString();
    if (res.statusCode == 201) {
      final j = jsonDecode(body);
      return j['url'] as String?;
    }
    throw Exception('Upload failed: $body');
  }

  static Future<void> updateShow(String token, String showId, Map<String, dynamic> data) async {
    final res = await http.patch(Uri.parse('$baseUrl/shows/$showId'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode(data));
    if (res.statusCode != 200) throw Exception('Failed to update show: ${res.body}');
  }

  static Future<Map<String, dynamic>> createShow(String token, Map<String, dynamic> data) async {
    final res = await http.post(Uri.parse('$baseUrl/shows'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode(data));
    if (res.statusCode == 201) return jsonDecode(res.body);
    throw Exception('Failed to create show: ${res.body}');
  }

  static Map<String, dynamic> jsonDecode(String body) => json.decode(body) as Map<String, dynamic>;
}