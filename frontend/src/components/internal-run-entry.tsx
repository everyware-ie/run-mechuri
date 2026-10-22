import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';
import { SymbolView } from 'expo-symbols';
import { Tracking, trackingEnabled } from '../../modules/run-tracking/src/RunTracking';
import { runStatus } from '@/lib/tracking-display';

export function InternalRunEntry() {
  const [state, setState] = useState('');
  useFocusEffect(useCallback(() => {
    if (!trackingEnabled) return;
    let alive = true, request = 0;
    const update = async () => {
      if (!alive || AppState.currentState !== 'active') return;
      const current = ++request;
      try {
        const snapshot = await Tracking!.state();
        if (alive && current === request && AppState.currentState === 'active') setState(snapshot.summary ? runStatus[snapshot.summary.status] : '');
      } catch { /* Retain the last known status until the next foreground check. */ }
    };
    void update();
    // Watch controls and permission changes can alter native state while the
    // home screen stays mounted. This reads state; it never starts GPS.
    const timer = setInterval(update, 5000);
    const subscription = AppState.addEventListener('change', status => { request++; if (status === 'active') void update(); });
    return () => { alive = false; clearInterval(timer); subscription.remove(); };
  }, []));
  if (!trackingEnabled) return null;
  return <View><Pressable accessibilityRole="button" onPress={() => router.push('/internal-run')} style={styles.entry}>
    <View style={styles.icon}><SymbolView name="figure.run" size={24} tintColor={Colors.accent} /></View>
    <View style={styles.content}><View style={styles.titleRow}><Text style={styles.title}>{state ? '러닝으로 돌아가기' : '러닝 시작'}</Text><Text style={styles.badge}>팀 테스트</Text></View><Text style={styles.text}>{state || '한 걸음씩, 나만의 경로를 기록해요.'}</Text></View>
    <SymbolView name="chevron.right" size={15} tintColor={Colors.textMuted} />
  </Pressable><AppPermissionsLink /></View>;
}
export function AppPermissionsLink() {
  if (!trackingEnabled) return null;
  return <Pressable accessibilityRole="button" onPress={() => router.push('/app-permissions')} style={styles.link}><Text style={styles.text}>앱 권한 확인</Text></Pressable>;
}
const styles = StyleSheet.create({
  entry: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 22, padding: 18, marginTop: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,90,43,0.09)', justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, gap: 7 }, titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  title: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 16 }, badge: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 9, borderRadius: 6, borderWidth: 1, borderColor: Colors.borderStrong, paddingVertical: 3, paddingHorizontal: 5 },
  link: { paddingVertical: 16, alignItems: 'center' }, text: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.textMuted } });
