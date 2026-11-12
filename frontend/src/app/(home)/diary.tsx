import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DiaryMarkerIcon } from '@/components/diary-marker';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { formatKm, groupRunsByDay, monthCells, monthStats, recentWeeks, type RunsByDay } from '@/lib/diary';
import { DEFAULT_DIARY_MARKER, loadDiaryMarker, saveDiaryMarker, type DiaryMarker } from '@/lib/diary-marker-store';
import { Tracking, trackingEnabled } from '../../../modules/run-tracking/src/RunTracking';

// FRD: docs/specs/frd/diary.md. 일요일에 한 주가 시작한다.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 0번 칸이 일요일, 6번 칸이 토요일이다.
const weekendColor = (column: number) => column === 0 || column === 6 ? Colors.weekend : undefined;
const MARKER_NAMES: Record<DiaryMarker, string> = { quail: '메추리', person: '사람' };

export default function DiaryScreen() {
  const [runs, setRuns] = useState<RunsByDay>(new Map());
  const [marker, setMarker] = useState<DiaryMarker>(DEFAULT_DIARY_MARKER);
  const [draft, setDraft] = useState<DiaryMarker | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [offset, setOffset] = useState(0);

  useFocusEffect(useCallback(() => {
    let alive = true;
    setNow(new Date()); setOffset(0);
    void loadDiaryMarker().then(value => { if (alive) setMarker(value); });
    if (trackingEnabled) {
      Tracking!.records().then(result => { if (alive) setRuns(groupRunsByDay(result.records)); }).catch(() => { /* 마지막으로 읽은 기록을 유지한다. */ });
    }
    return () => { alive = false; };
  }, []));

  const shown = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = shown.getFullYear(), month = shown.getMonth();
  const cells = useMemo(() => monthCells(year, month), [year, month]);
  const stats = useMemo(() => monthStats(runs, year, month), [runs, year, month]);
  const weeks = useMemo(() => recentWeeks(runs, now), [runs, now]);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  // `완료`를 눌러야만 저장한다. 그냥 닫으면 이전 선택을 유지한다.
  const confirm = () => {
    if (draft) { setMarker(draft); void saveDiaryMarker(draft).catch(() => { /* 이번 실행에서는 선택이 유지된다. */ }); }
    setDraft(null);
  };

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">다이어리</Text>
        <Pressable onPress={() => setDraft(marker)} hitSlop={8} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="달력 아이콘 바꾸기">
          <SymbolView name="slider.horizontal.3" size={20} tintColor={Colors.textMuted} />
        </Pressable>
      </View>

      <View style={[styles.card, styles.summary]}>
        <Stat label="러닝한 날" value={`${stats.days}일`} />
        <View style={styles.divider} />
        <Stat label="총 거리" value={formatKm(stats.distance)} />
        <View style={styles.divider} />
        <Stat label="가장 길게" value={formatKm(stats.longest)} />
      </View>

      <View style={[styles.card, styles.calendar]}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => setOffset(offset - 1)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="이전 달">
            <SymbolView name="chevron.left" size={16} tintColor={Colors.textMuted} />
          </Pressable>
          <Text style={styles.month}>{year}년 {month + 1}월</Text>
          <Pressable onPress={() => setOffset(offset + 1)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="다음 달">
            <SymbolView name="chevron.right" size={16} tintColor={Colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.weekRow}>{WEEKDAYS.map((name, column) => <Text key={name} style={[styles.weekday, weekendColor(column) && { color: weekendColor(column) }]}>{name}</Text>)}</View>
        {rows.map((row, index) => <View key={index} style={styles.weekRow}>
          {Array.from({ length: 7 }, (_, column) => {
            const cell = row[column] ?? null;
            if (!cell) return <View key={column} style={styles.cellSlot} />;
            const entry = runs.get(cell.key);
            const today = cell.key === todayKey;
            const label = entry ? `${month + 1}월 ${cell.day}일, 러닝 ${formatKm(entry.distance)}` : today ? `${month + 1}월 ${cell.day}일, 오늘` : `${month + 1}월 ${cell.day}일, 쉬는 날`;
            return <View key={column} style={styles.cellSlot}><View style={[styles.cell, weekendColor(column) && styles.cellWeekend]} accessible accessibilityLabel={label}>
              <View style={today ? styles.todayCircle : styles.dayBox}>
                <Text style={[styles.dayText, entry ? styles.dayRun : styles.dayRest, today && styles.dayToday]}>{cell.day}</Text>
              </View>
              {entry ? <View style={styles.glow}><DiaryMarkerIcon marker={marker} size={24} /></View> : null}
            </View></View>;
          })}
        </View>)}
      </View>

      <View style={[styles.card, styles.weeks]}>
        <Text style={styles.cardTitle}>최근 4주</Text>
        <View style={styles.weekLine}>
          <View style={styles.weekLabel} />
          <View style={styles.weekDays}>{WEEKDAYS.map((name, column) => <Text key={name} style={[styles.weekdaySmall, weekendColor(column) && { color: weekendColor(column) }]}>{name}</Text>)}</View>
          <View style={styles.weekKm} />
        </View>
        {weeks.map(week => <View key={week.label} style={styles.weekLine}>
          <Text style={styles.weekLabel}>{week.label}</Text>
          <View style={styles.weekDays}>
            {week.days.map(day => <View key={day.key} style={styles.weekDay} accessible
              accessibilityLabel={`${day.date.getMonth() + 1}월 ${day.date.getDate()}일, ${day.state === 'run' ? '러닝' : day.state === 'today' ? '오늘' : day.state === 'future' ? '아직 오지 않음' : '쉬는 날'}`}>
              {day.state === 'run' ? <DiaryMarkerIcon marker={marker} size={22} />
                : day.state === 'today' ? <View style={styles.todayRing} />
                  : day.state === 'future' ? <View style={styles.futureDot} /> : <View style={styles.restRing} />}
            </View>)}
          </View>
          <Text style={styles.weekKm}>{formatKm(week.distance)}</Text>
        </View>)}
      </View>
    </ScrollView>

    <Modal visible={draft !== null} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
      <Pressable style={styles.backdrop} onPress={() => setDraft(null)} accessibilityLabel="닫기" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>달력 아이콘</Text>
        <Text style={styles.sheetHint}>러닝한 날에 표시될 모양을 골라 주세요</Text>
        <View style={styles.options}>
          {(['quail', 'person'] as const).map(kind => {
            const selected = draft === kind;
            return <Pressable key={kind} onPress={() => setDraft(kind)} accessibilityRole="button" accessibilityState={{ selected }}
              style={[styles.option, selected && styles.optionSelected]}>
              <DiaryMarkerIcon marker={kind} size={56} color={selected ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.optionText, !selected && { color: Colors.textMuted }]}>{MARKER_NAMES[kind]}</Text>
            </Pressable>;
          })}
        </View>
        <View style={styles.preview}>
          <Text style={styles.previewLabel}>미리보기</Text>
          <View style={styles.previewRow}>
            {[true, false, true, true, false, true, false].map((run, index) => run && draft
              ? <DiaryMarkerIcon key={index} marker={draft} size={24} />
              : <View key={index} style={styles.restRing} />)}
          </View>
        </View>
        <Pressable onPress={confirm} style={styles.done} accessibilityRole="button"><Text style={styles.doneText}>완료</Text></Pressable>
      </View>
    </Modal>
  </SafeAreaView>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

const card = { backgroundColor: Colors.bgCard, borderColor: Colors.border, borderWidth: 1, borderRadius: Radius.card } as const;
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 8 },
  title: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 26 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card,
  summary: { flexDirection: 'row', paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center' },
  divider: { width: 1, backgroundColor: Colors.border },
  statLabel: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11 },
  statValue: { color: Colors.text, fontFamily: Fonts.mono, fontSize: 20, marginTop: 4 },
  calendar: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 17 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', height: 22, lineHeight: 22, color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11 },
  cellSlot: { flex: 1, height: 58, padding: 1 },
  cell: { flex: 1, alignItems: 'center', paddingTop: 4, gap: 2, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, backgroundColor: Colors.bg },
  dayBox: { height: 20, alignItems: 'center', justifyContent: 'center' },
  todayCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: Fonts.mono, fontSize: 12 },
  dayRun: { color: Colors.text },
  dayRest: { color: Colors.textMuted },
  dayToday: { color: Colors.accentText },
  cellWeekend: { backgroundColor: Colors.weekendFill },
  glow: { shadowColor: Colors.accent, shadowOpacity: 0.6, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  weeks: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  cardTitle: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 14, marginBottom: 6 },
  weekLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  weekLabel: { width: 52, color: Colors.text, fontFamily: Fonts.sans, fontSize: 12 },
  weekDays: { flex: 1, flexDirection: 'row' },
  weekdaySmall: { flex: 1, textAlign: 'center', color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11 },
  weekDay: { flex: 1, height: 24, alignItems: 'center', justifyContent: 'center' },
  weekKm: { width: 56, textAlign: 'right', color: Colors.textMuted, fontFamily: Fonts.mono, fontSize: 12 },
  restRing: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.borderStrong },
  todayRing: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.accent },
  futureDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.bgCard, borderTopWidth: 1, borderColor: Colors.border, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: Spacing.md, paddingTop: 10, paddingBottom: 34 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong, marginBottom: 18 },
  sheetTitle: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 18 },
  sheetHint: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 13, marginTop: 4 },
  options: { flexDirection: 'row', gap: 12, marginTop: 18 },
  option: { flex: 1, height: 132, borderRadius: Radius.card, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', gap: 10 },
  optionSelected: { borderColor: Colors.accent, borderWidth: 1.5, backgroundColor: 'rgba(255,90,43,0.08)' },
  optionText: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 14 },
  preview: { marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  previewLabel: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', height: 40, marginTop: 6 },
  done: { height: 52, marginTop: 16, borderRadius: 16, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: Colors.accentText, fontFamily: Fonts.sansBold, fontSize: 16 },
});
