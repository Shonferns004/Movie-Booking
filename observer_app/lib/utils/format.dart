import '../models/observer_event.dart';

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String _two(int value) => value.toString().padLeft(2, '0');

/// `14:32` in local time.
String clockTime(DateTime time) => '${_two(time.hour)}:${_two(time.minute)}';

/// `23 Oct, 14:32`
String shortDateTime(DateTime time) =>
    '${time.day} ${_months[time.month - 1]}, ${clockTime(time)}';

String relativeTime(DateTime time) {
  final delta = DateTime.now().difference(time);
  if (delta.inSeconds < 45) return 'just now';
  if (delta.inMinutes < 60) return '${delta.inMinutes}m ago';
  if (delta.inHours < 24) return '${delta.inHours}h ago';
  if (delta.inDays < 7) return '${delta.inDays}d ago';
  return shortDateTime(time);
}

/// Prefers the parsed paise value so the display always matches what the
/// gateway will compare against.
String renderAmount(String? amount, int? amountPaise) {
  if (amountPaise != null) {
    final rupees = (amountPaise / 100).toStringAsFixed(2);
    return '₹$rupees';
  }
  if (amount != null && amount.isNotEmpty) return '₹$amount';
  return '—';
}

String statusHeadline(EventStatus status, String? message) {
  switch (status) {
    case EventStatus.sent:
      if (message == null || message.isEmpty) return 'Forwarded to gateway';
      return message;
    case EventStatus.failed:
      return message == null || message.isEmpty ? 'Delivery failed' : message;
    case EventStatus.pending:
      return message == null || message.isEmpty ? 'Queued for delivery' : message;
    case EventStatus.ignored:
      return message == null || message.isEmpty ? 'Skipped' : message;
  }
}
