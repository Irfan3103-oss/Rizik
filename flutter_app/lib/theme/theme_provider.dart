import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'palettes.dart';

class ThemeProvider extends ChangeNotifier {
  static const _themeModeKey = 'aharforall_theme';
  static const _paletteKey = 'aharforall_palette';

  bool _isDark = false;
  PaletteId _paletteId = PaletteId.freshGreen;

  ThemeProvider() {
    _load();
  }

  bool get isDark => _isDark;
  PaletteId get paletteId => _paletteId;
  PaletteTokens get tokens => resolvePaletteTokens(_paletteId, _isDark);
  ThemeData get themeData => buildAppTheme(tokens, _isDark);

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedTheme = prefs.getString(_themeModeKey);
      if (savedTheme == 'dark') _isDark = true;
      final savedPal = prefs.getString(_paletteKey);
      if (savedPal != null) {
        _paletteId = PaletteId.values.firstWhere(
          (p) => p.name == savedPal,
          orElse: () => PaletteId.freshGreen,
        );
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<void> toggleDarkMode([bool? value]) async {
    _isDark = value ?? !_isDark;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_themeModeKey, _isDark ? 'dark' : 'light');
    } catch (_) {}
  }

  Future<void> setPalette(PaletteId id) async {
    _paletteId = id;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_paletteKey, id.name);
    } catch (_) {}
  }
}
