import { RefObject, useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView, TextInputProps } from 'react-native';

type FocusEvent = Parameters<NonNullable<TextInputProps['onFocus']>>[0];

const MARGIN = 12;

/**
 * Scrolls a focused field fully into view when its top edge sits above the scroll
 * view's visible area.
 *
 * iOS (automaticallyAdjustKeyboardInsets) only scrolls up a field the keyboard would
 * cover from below; a field already scrolled partly past the top stays clipped there,
 * caret included. Pass `onScroll` to the ScrollView and `onFocus` to its inputs.
 */
export function useRevealOnFocus(scrollRef: RefObject<ScrollView | null>) {
  const offsetY = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y;
  }, []);

  const onFocus = useCallback(
    (e: FocusEvent) => {
      const scroll = scrollRef.current;
      // getInnerViewRef is on the instance but missing from the published types
      const content = (scroll as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
      const field = e.currentTarget as unknown as {
        measureLayout?: (rel: unknown, onSuccess: (x: number, y: number) => void) => void;
      };
      if (!scroll || !content || !field?.measureLayout) return;
      field.measureLayout(content, (_x, y) => {
        if (y - MARGIN >= offsetY.current) return;
        scroll.scrollTo({ y: Math.max(0, y - MARGIN), animated: true });
      });
    },
    [scrollRef],
  );

  return { onScroll, onFocus };
}
