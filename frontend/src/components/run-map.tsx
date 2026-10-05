import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SymbolView } from 'expo-symbols';
import { Colors, Fonts } from '@/constants/theme';
import { mapSegments, shortRouteRegion } from '@/lib/tracking-map';
import type { RunPoint } from '../../modules/run-tracking/src/RunTracking';

type Props = { points: RunPoint[]; position?: RunPoint | null; overview?: boolean; visible: boolean; clock?: number; height?: number; unavailable?: boolean };
export function RunMap(props: Props) {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => listener.remove();
  }, []);
  if (!props.visible || !active) return <View style={[mapUI.frame, { height: props.height ?? 260 }]} />;
  return <MapBoundary><RunMapContent {...props} /></MapBoundary>;
}
function RunMapContent({ points, position, overview = false, clock = 0, height = 260, unavailable }: Props) {
  const segments = useMemo(() => mapSegments(points), [points]);
  const start = segments[0]?.[0];
  const end = segments[segments.length - 1]?.at(-1);
  const center = overview ? start : position ?? end;
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [follow, setFollow] = useState(true);
  const fitted = useRef(false);
  const latitude = center?.latitude, longitude = center?.longitude;
  useEffect(() => {
    if (!ready || latitude == null || longitude == null) return;
    if (overview) {
      if (fitted.current) return;
      fitted.current = true;
      const coordinates = segments.flat();
      const region = shortRouteRegion(coordinates);
      if (region) map.current?.animateToRegion(region, 0);
      else if (coordinates.length > 1) map.current?.fitToCoordinates(coordinates, { edgePadding: { top: 40, bottom: 40, left: 40, right: 40 }, animated: false });
    } else if (follow) map.current?.animateCamera({ center: { latitude, longitude } }, { duration: 350 });
  }, [ready, follow, latitude, longitude, overview, segments]);
  if (!center || unavailable) return <View style={[mapUI.frame, mapUI.placeholder, { height: overview && !center ? 88 : height }]}>
    <SymbolView name="location.slash" size={25} tintColor={Colors.textMuted} />
    <Text style={mapUI.message}>{unavailable ? '개발 앱을 업데이트하면 지도를 볼 수 있어요.' : overview ? '저장된 위치가 없어요.' : 'GPS가 준비되면 현재 위치가 보여요.'}</Text>
  </View>;
  const stale = !overview && clock - center.time > 15;
  const recenter = () => {
    setFollow(true);
    map.current?.animateCamera({ center: { latitude: center.latitude, longitude: center.longitude } }, { duration: 350 });
  };
  return <View style={[mapUI.frame, { height }]}>
    <MapView ref={map} style={StyleSheet.absoluteFill} userInterfaceStyle="dark" mapType="standard"
      initialRegion={{ latitude: center.latitude, longitude: center.longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
      showsUserLocation={false} showsMyLocationButton={false} showsCompass={false} rotateEnabled={false} pitchEnabled={false}
      onMapReady={() => setReady(true)} onPanDrag={() => setFollow(false)} onTouchMove={() => setFollow(false)}
      accessibilityLabel={overview ? '저장한 러닝 경로 지도' : '현재 위치와 러닝 경로 지도'}>
      {segments.map((segment, index) => segment.length > 1 ? <Polyline key={index} coordinates={segment} strokeColor={Colors.accent} strokeWidth={4} lineCap="round" lineJoin="round" /> : null)}
      {start ? <Marker coordinate={start} title="러닝 시작" zIndex={1} pinColor={Colors.accent} /> : null}
      {!overview && position ? <Marker key={stale ? 'stale' : 'fresh'} coordinate={position} anchor={{ x: 0.5, y: 0.5 }} title={stale ? '마지막 확인 위치' : '현재 위치'} zIndex={2} tracksViewChanges={false}><View style={[mapUI.positionHalo, stale && { opacity: 0.55 }]}><View style={mapUI.positionDot} /></View></Marker> : null}
      {overview && end && end !== start ? <Marker coordinate={end} title="러닝 종료" pinColor={Colors.lineWarm} /> : null}
    </MapView>
    {!overview ? <>
      {stale ? <View style={mapUI.stale} pointerEvents="none"><Text style={mapUI.caption}>마지막 확인 위치</Text></View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="현재 위치로 돌아가기" onPress={recenter} style={mapUI.recenter}>
        <SymbolView name={follow ? 'location.fill' : 'location'} size={19} tintColor={follow ? Colors.accent : Colors.text} />
      </Pressable>
    </> : null}
  </View>;
}
class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <View style={[mapUI.frame, mapUI.placeholder, { height: 260 }]}><Text style={mapUI.message}>지도를 표시하지 못했어요.{ '\n' }러닝 측정과 저장은 계속할 수 있어요.</Text></View> : this.props.children;
  }
}
const mapUI = StyleSheet.create({
  frame: { borderRadius: 24, overflow: 'hidden', backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  placeholder: { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 14 },
  message: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  positionHalo: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,90,43,0.2)', justifyContent: 'center', alignItems: 'center' },
  positionDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.accent, borderWidth: 2, borderColor: 'white' },
  recenter: { position: 'absolute', right: 12, bottom: 14, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.borderStrong },
  stale: { position: 'absolute', top: 12, left: 12, backgroundColor: Colors.bgCard, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  caption: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11 },
});
