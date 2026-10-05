import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';
import { DEFAULT_BACKGROUNDS } from '@/constants/default-backgrounds';
import { ROUTE_COLORS, resolveRouteStyle } from '@/lib/editor-style';
import type { EditSnapshot } from '@/lib/edit-history';
import { captureMyStyle, deleteMyStyle, listMyStyles, MAX_MY_STYLES, saveMyStyle, type MyStyle } from '@/lib/my-style-store';

export function MyStyleSheet({ snapshot, onApply }: { snapshot: EditSnapshot; onApply: (style: MyStyle) => Promise<boolean> }) {
  const [styles, setStyles] = useState<MyStyle[]>([]), [name, setName] = useState(''), [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false), [message, setMessage] = useState('');
  const mounted = useRef(true), pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void listMyStyles().then(items => { if (mounted.current) { setStyles(items); setLoaded(true); } })
      .catch(() => { if (mounted.current) { setFailed(true); setLoaded(true); } });
    return () => { mounted.current = false; };
  }, []);
  const operation = async (run: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage('');
    try { await run(); }
    catch (error) {
      if (mounted.current) Alert.alert(error instanceof Error && error.message === 'style-limit' ? '내 스타일은 20개까지 저장해요' : '스타일을 처리하지 못했어요', '다시 시도하거나 저장한 스타일을 정리해 주세요.');
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const save = () => operation(async () => {
    const next = await saveMyStyle(captureMyStyle(snapshot, name || `내 스타일 ${styles.length + 1}`));
    if (mounted.current) { setStyles(next); setName(''); setMessage('지금 스타일을 저장했어요'); }
  });
  const remove = (style: MyStyle) => Alert.alert('스타일 삭제', `‘${style.name}’을 삭제할까요? 현재 편집한 내용은 유지돼요.`, [
    { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => { void operation(async () => {
      const next = await deleteMyStyle(style.id); if (mounted.current) setStyles(next);
    }); } },
  ]);
  return <View style={ui.root}>
    <Text style={ui.hint}>배경·경로·러닝 데이터와 다듬기를 한 번에 저장해요.</Text>
    <View style={ui.saveRow}>
      <TextInput value={name} onChangeText={setName} maxLength={20} placeholder={`내 스타일 ${styles.length + 1}`}
        placeholderTextColor={Colors.textMuted} style={ui.input} accessibilityLabel="스타일 이름" editable={!busy && !failed} returnKeyType="done"
        onSubmitEditing={() => { if (loaded && !failed && styles.length < MAX_MY_STYLES) void save(); }} />
      <Pressable onPress={() => { void save(); }} disabled={!loaded || busy || failed || styles.length >= MAX_MY_STYLES}
        style={[ui.save, (!loaded || busy || failed || styles.length >= MAX_MY_STYLES) && ui.disabled]} accessibilityRole="button" accessibilityLabel="지금 스타일 저장">
        {busy ? <ActivityIndicator color={Colors.accentText} size="small" /> : <Text style={ui.saveText}>저장</Text>}
      </Pressable>
    </View>
    <Text style={ui.hint}>내 사진·영상은 저장하지 않고 적용할 때 현재 배경을 유지해요.</Text>
    {!!message && <Text style={ui.message} accessibilityLiveRegion="polite">{message}</Text>}
    {!loaded ? <ActivityIndicator color={Colors.accent} /> : failed ? <Text style={ui.hint}>스타일을 불러오지 못했어요. 닫았다 다시 열어 주세요.</Text> :
      !styles.length ? <Text style={ui.empty}>자주 쓰는 조합을 내 스타일로 남겨 보세요.</Text> : <>
        <Text style={ui.count}>저장한 스타일 {styles.length}/{MAX_MY_STYLES}</Text>
        {styles.map(style => {
          const bg = DEFAULT_BACKGROUNDS.find(b => b.id === style.backgroundId), line = resolveRouteStyle(style.routeStyle);
          return <View key={style.id} style={ui.card}>
            <Pressable onPress={() => { void operation(async () => { const applied = await onApply(style); if (applied && mounted.current) setMessage(`‘${style.name}’을 적용했어요`); }); }}
              disabled={busy} style={ui.apply} accessibilityRole="button" accessibilityLabel={`${style.name} 적용`}>
              <View style={ui.sample}>{bg && <Image source={bg.source} style={StyleSheet.absoluteFill} />}
                <Text style={{ color: line.color, fontSize: 24 }}>⌁</Text>
              </View>
              <View style={ui.info}><Text style={ui.name} numberOfLines={1}>{style.name}</Text>
                <Text style={ui.detail}>{bg?.label ?? '현재 배경 유지'} · {ROUTE_COLORS.find(c => c.id === (style.routeStyle.color ?? 'warm'))?.label ?? '직접 고른 색'} · {Math.round(line.widthScale * 100)}%</Text>
                <Text style={ui.detail}>다듬기 {style.smoothOptions.smooth}/{style.smoothOptions.corner}</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => remove(style)} disabled={busy} style={ui.delete} accessibilityRole="button" accessibilityLabel={`${style.name} 삭제`}>
              <SymbolView name="trash" size={15} tintColor={Colors.textMuted} />
            </Pressable>
          </View>;
        })}
      </>}
    <Text style={ui.hint}>이 기기에 저장돼요. 앱을 삭제하면 함께 사라져요.</Text>
  </View>;
}
const ui = StyleSheet.create({
  root: { gap: 12 }, hint: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 17 },
  saveRow: { flexDirection: 'row', gap: 10 }, input: { flex: 1, color: Colors.text, backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontFamily: Fonts.sans, fontSize: 13 },
  save: { minHeight: 44, minWidth: 64, borderRadius: 22, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' }, saveText: { color: Colors.accentText, fontFamily: Fonts.sansBold, fontSize: 13 },
  disabled: { opacity: .4 }, empty: { color: Colors.textMuted, textAlign: 'center', paddingVertical: 22, fontFamily: Fonts.sans, fontSize: 12 },
  count: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11 }, card: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: Colors.bg },
  apply: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10, minHeight: 70 }, sample: { width: 42, height: 52, overflow: 'hidden', borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgCard },
  info: { flex: 1, gap: 3 }, name: { fontFamily: Fonts.sansBold, fontSize: 13, color: Colors.text }, detail: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 10 },
  delete: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, message: { color: Colors.accent, fontFamily: Fonts.sans, fontSize: 12 },
});
