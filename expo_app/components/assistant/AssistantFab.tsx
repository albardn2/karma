// The floating Karma Assistant button, shown on every signed-in screen.
//
// - Drag it anywhere to uncover what's underneath; on release it snaps to the
//   nearest side and remembers its spot (AsyncStorage), across screens and launches.
// - Tap it (a touch that barely moves) to open the assistant screen. That screen
//   is pushed on top of the current one, so going back lands exactly where you were.
//
// Built on React Native's PanResponder + Animated: no gesture-handler root view needed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, PanResponder, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { assistantEnabled, getAccess } from '@/utils/assistant';

const SIZE = 56;
const MARGIN = 12;
const TAP_SLOP = 8;
const KEY = 'assistant_fab_position'; // { side: 'left' | 'right', y: 0..1 }
// screens where the button would be in the way or pointless
const HIDDEN_ON = new Set(['login', 'signup', 'assistant']);

export function AssistantFab() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [ready, setReady] = useState(false);
  // hidden until the service says this company has the assistant switched on;
  // re-checked whenever the app comes back to the foreground
  const [switchedOn, setSwitchedOn] = useState(false);

  useEffect(() => {
    if (!assistantEnabled()) return;
    const check = () =>
      getAccess()
        .then((a) => setSwitchedOn(a.code !== 'off'))
        .catch(() => {}); // unreachable: keep whatever we knew
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);

  const minY = insets.top + MARGIN;
  const maxY = height - insets.bottom - SIZE - MARGIN;
  const xFor = (side: 'left' | 'right') => (side === 'left' ? MARGIN : width - SIZE - MARGIN);
  const pos = useRef(new Animated.ValueXY({ x: width - SIZE - MARGIN, y: height * 0.7 })).current;
  const last = useRef({ x: width - SIZE - MARGIN, y: height * 0.7 });

  // restore the remembered spot
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { side: 'left' | 'right'; y: number };
        const p = { x: xFor(saved.side), y: Math.min(maxY, Math.max(minY, minY + saved.y * (maxY - minY))) };
        pos.setValue(p);
        last.current = p;
      })
      .catch(() => {})
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          pos.setOffset(last.current);
          pos.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_e, g) => {
          pos.flattenOffset();
          const moved = Math.abs(g.dx) + Math.abs(g.dy);
          if (moved < TAP_SLOP) {
            pos.setValue(last.current);
            router.push('/assistant');
            return;
          }
          // snap to the nearer side, keep inside the safe area
          const cx = last.current.x + g.dx + SIZE / 2;
          const side: 'left' | 'right' = cx < width / 2 ? 'left' : 'right';
          const target = { x: xFor(side), y: Math.min(maxY, Math.max(minY, last.current.y + g.dy)) };
          last.current = target;
          Animated.spring(pos, { toValue: target, useNativeDriver: false, friction: 7 }).start();
          AsyncStorage.setItem(KEY, JSON.stringify({ side, y: (target.y - minY) / Math.max(1, maxY - minY) })).catch(() => {});
        },
        onPanResponderTerminate: () => {
          pos.flattenOffset();
          Animated.spring(pos, { toValue: last.current, useNativeDriver: false }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height, minY, maxY],
  );

  if (!assistantEnabled() || !switchedOn || !ready || HIDDEN_ON.has(String(segments[0] ?? ''))) return null;

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[styles.fab, { transform: pos.getTranslateTransform() }]}
      accessibilityRole="button"
      accessibilityLabel="Open Karma Assistant"
      accessibilityHint="Drag to move it out of the way"
      testID="assistant-fab"
    >
      <MaterialIcons name="auto-awesome" size={26} color="#fff" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#5469D4',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    zIndex: 1000,
  },
});
