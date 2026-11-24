import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/log_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/status_screen.dart';
import 'screens/test_send_sheet.dart';
import 'state/app_state.dart';
import 'theme/app_theme.dart';
import 'package:tabler_icons_plus/tabler_icons_plus.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppColors.bgSoft,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  final state = AppState();
  runApp(SmsGatewayApp(state: state));
  state.start();
}

class SmsGatewayApp extends StatelessWidget {
  const SmsGatewayApp({super.key, required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: state,
      child: MaterialApp(
        title: 'Konkani SMS Gateway',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark,
        home: const AppShell(),
      ),
    );
  }
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  void _goTo(int index) => setState(() => _index = index);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          StatusScreen(
            onOpenLog: () => _goTo(1),
            onOpenSettings: () => _goTo(2),
            onOpenTestDialog: () => showTestSendSheet(context),
          ),
          const LogScreen(),
          const SettingsScreen(),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.bgSoft,
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: _goTo,
          destinations: const [
            NavigationDestination(
              icon: Icon(TablerIcons.accessPoint),
              selectedIcon: Icon(TablerIcons.accessPoint),
              label: 'Status',
            ),
            NavigationDestination(
              icon: Icon(TablerIcons.receipt),
              selectedIcon: Icon(TablerIcons.receipt),
              label: 'Activity',
            ),
            NavigationDestination(
              icon: Icon(TablerIcons.adjustments),
              selectedIcon: Icon(TablerIcons.adjustments),
              label: 'Settings',
            ),
          ],
        ),
      ),
    );
  }
}
