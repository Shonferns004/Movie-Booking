import 'package:flutter/material.dart';

/// Design tokens lifted from the Konkani Samudai web client so the observer
/// console reads as the same product.
class AppColors {
  const AppColors._();

  static const bg = Color(0xFF050816);
  static const bgSoft = Color(0xFF0B1020);
  static const text = Color(0xFFF1F5F9);
  static const muted = Color(0xFF94A3B8);
  static const faint = Color(0xFF64748B);

  static const border = Color(0x1FFFFFFF); // white @ 12%
  static const surface = Color(0x0DFFFFFF); // white @ 5%
  static const surfaceStrong = Color(0x14FFFFFF); // white @ 8%

  static const accent = Color(0xFF8B5CF6);
  static const accent2 = Color(0xFF22D3EE);
  static const accent3 = Color(0xFFF472B6);

  static const success = Color(0xFF34D399);
  static const danger = Color(0xFFFB7185);
  static const warning = Color(0xFFFBBF24);
}

class AppTheme {
  const AppTheme._();

  static const radius = 18.0;

  static ThemeData get dark {
    const scheme = ColorScheme.dark(
      primary: AppColors.accent,
      onPrimary: Colors.white,
      primaryContainer: Color(0xFF3B1D8F),
      onPrimaryContainer: Colors.white,
      secondary: AppColors.accent2,
      onSecondary: Color(0xFF04121A),
      surface: AppColors.bgSoft,
      onSurface: AppColors.text,
      surfaceContainerHighest: Color(0xFF161B2E),
      error: AppColors.danger,
      onError: Colors.white,
      outline: AppColors.faint,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.bg,
      canvasColor: AppColors.bg,
      dividerColor: AppColors.border,
      fontFamily: 'Roboto',
      textTheme: const TextTheme(
        displaySmall: TextStyle(
          fontSize: 30,
          height: 1.1,
          fontWeight: FontWeight.w800,
          color: AppColors.text,
          letterSpacing: -0.6,
        ),
        headlineSmall: TextStyle(
          fontSize: 21,
          height: 1.2,
          fontWeight: FontWeight.w700,
          color: AppColors.text,
          letterSpacing: -0.3,
        ),
        titleMedium: TextStyle(
          fontSize: 15,
          height: 1.3,
          fontWeight: FontWeight.w600,
          color: AppColors.text,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          height: 1.45,
          color: AppColors.text,
        ),
        bodySmall: TextStyle(
          fontSize: 12.5,
          height: 1.4,
          color: AppColors.muted,
        ),
        labelLarge: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
          color: AppColors.text,
        ),
        labelSmall: TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.1,
          color: AppColors.muted,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        hintStyle: const TextStyle(color: AppColors.faint, fontSize: 13.5),
        labelStyle: const TextStyle(color: AppColors.muted, fontSize: 12.5),
        floatingLabelStyle: const TextStyle(color: AppColors.accent2, fontSize: 12.5),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.accent, width: 1.4),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.danger, width: 1.2),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.danger, width: 1.4),
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? Colors.white
              : AppColors.muted,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.accent
              : AppColors.surfaceStrong,
        ),
        trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.text,
          minimumSize: const Size(0, 46),
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.accent2,
          textStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: const Color(0xFF141A2C),
        contentTextStyle: const TextStyle(color: AppColors.text, fontSize: 13.5),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: const Color(0xF20B1020),
        indicatorColor: AppColors.accent.withValues(alpha: 0.22),
        height: 66,
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
            color: states.contains(WidgetState.selected)
                ? AppColors.text
                : AppColors.faint,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 22,
            color: states.contains(WidgetState.selected)
                ? AppColors.accent2
                : AppColors.faint,
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: const Color(0xFF0E1424),
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        titleTextStyle: const TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w700,
          color: AppColors.text,
        ),
        contentTextStyle: const TextStyle(
          fontSize: 13.5,
          height: 1.45,
          color: AppColors.muted,
        ),
      ),
    );
  }
}
