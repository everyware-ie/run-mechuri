import { Tabs, useFocusEffect, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUTE_SYMBOL } from '@/constants/icons';
import { Colors, Fonts } from '@/constants/theme';
import { runStatus } from '@/lib/tracking-display';
import { HomeTabsContext, type HomeRunStatus } from '@/state/home-tabs';
import { Tracking, trackingEnabled } from '../../modules/run-tracking/src/RunTracking';

function RunTabIcon({ color, active }: { color: ColorValue; active: boolean }) {
  return <View><SymbolView name={ROUTE_SYMBOL} size={23} tintColor={color} />{active ? <View style={styles.dot} /> : null}</View>;
}

export function HomeTabs() {
  const insets = useSafeAreaInsets();
  const runSelected = usePathname() === '/internal-run';
  const runSelectedRef = useRef(runSelected);
  useLayoutEffect(() => { runSelectedRef.current = runSelected; }, [runSelected]);
  // Unknown state keeps the run screen full size until its first native reply.
  const [status, setStatus] = useState<HomeRunStatus | undefined>(undefined);
  const reportRunStatus = useCallback((next: HomeRunStatus) => {
    if (runSelectedRef.current) setStatus(next);
  }, []);
  const context = useMemo(() => ({ reportRunStatus }), [reportRunStatus]);

  useFocusEffect(useCallback(() => {
    if (!trackingEnabled || runSelected) return;
    let alive = true, epoch = 0, request = 0;
    const update = async () => {
      if (!alive || AppState.currentState !== 'active') return;
      const current = ++request, generation = epoch;
      try {
        const snapshot = await Tracking!.state();
        if (alive && generation === epoch && current === request && AppState.currentState === 'active') setStatus(snapshot.summary?.status ?? null);
      } catch { /* Keep the last known state and retry in the foreground. */ }
    };
    void update();
    const timer = setInterval(update, 5000);
    const subscription = AppState.addEventListener('change', value => { epoch++; if (value === 'active') void update(); });
    return () => { alive = false; clearInterval(timer); subscription.remove(); };
  }, [runSelected]));

  const active = status != null && status !== 'completed';
  const label = active ? runStatus[status] : '러닝';
  const visible = trackingEnabled && (!runSelected || status === null);
  return <HomeTabsContext.Provider value={context}>
    <Tabs initialRouteName="index" backBehavior="initialRoute" screenOptions={{
      headerShown: false,
      lazy: true,
      sceneStyle: { backgroundColor: Colors.bg },
      tabBarStyle: [styles.bar, { height: 58 + insets.bottom, display: visible ? 'flex' : 'none' }],
      tabBarActiveTintColor: Colors.accent,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarLabelPosition: 'below-icon',
      tabBarLabelStyle: styles.label,
      tabBarItemStyle: styles.item,
      animation: 'none',
    }}>
      <Tabs.Screen name="index" options={{ title: '보관함', tabBarAccessibilityLabel: '보관함', tabBarIcon: ({ color }) => <SymbolView name="square.grid.2x2" size={22} tintColor={color} /> }} />
      <Tabs.Screen name="internal-run" options={{ title: '러닝', href: trackingEnabled ? '/internal-run' : null, tabBarLabel: label, tabBarAccessibilityLabel: active ? `러닝, ${label}` : '러닝', tabBarIcon: ({ color }) => <RunTabIcon color={color} active={active} /> }} />
      <Tabs.Screen name="diary" options={{ title: '다이어리', href: trackingEnabled ? '/diary' : null, tabBarAccessibilityLabel: '다이어리', tabBarIcon: ({ color }) => <SymbolView name="calendar" size={22} tintColor={color} /> }} />
    </Tabs>
  </HomeTabsContext.Provider>;
}

const styles = StyleSheet.create({
  bar: { backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 5 },
  item: { minHeight: 48, paddingVertical: 2 },
  label: { fontFamily: Fonts.sans, fontSize: 11, marginBottom: 3 },
  dot: { position: 'absolute', top: -1, right: -5, width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent },
});
