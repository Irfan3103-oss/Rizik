import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'firebase_options.dart';
import 'i18n/i18n_provider.dart';
import 'providers/auth_provider.dart';
import 'screens/app_shell.dart';
import 'theme/theme_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (_) {
    // Allows running against Express backend if Firebase plugin init is deferred.
  }

  runApp(const RizikApp());
}

class RizikApp extends StatefulWidget {
  const RizikApp({super.key});

  @override
  State<RizikApp> createState() => _RizikAppState();
}

class _RizikAppState extends State<RizikApp> {
  final ThemeProvider _theme = ThemeProvider();
  final I18nProvider _i18n = I18nProvider();
  final AuthProvider _auth = AuthProvider();

  @override
  void dispose() {
    _theme.dispose();
    _i18n.dispose();
    _auth.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([_theme, _i18n, _auth]),
      builder: (context, _) {
        return MaterialApp(
          title: 'Rizik',
          debugShowCheckedModeBanner: false,
          theme: _theme.themeData,
          home: AppShell(
            auth: _auth,
            i18n: _i18n,
            theme: _theme,
          ),
        );
      },
    );
  }
}
