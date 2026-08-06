import React, { useMemo } from 'react';
import { I18nManager, StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate, parseTs } from '@/utils/date';
import { formatKm2, parseWktPolygons, ringAreaM2, ringVertexCount } from '@/utils/wkt';
import { AREA_NO_SHAPE, areaColour } from '@/utils/areaColour';
import { thumbPath } from '@/utils/areaThumb';

export interface ServiceAreaRow {
  uuid: string;
  name: string;
  description?: string | null;
  /** WKT POLYGON, "lon lat" pairs. Already on every list row — see below. */
  geometry?: string | null;
  created_at: string;
}

const THUMB = 56;
const THUMB_PAD = 4;

/**
 * What one service area looks like in a list.
 *
 * THE ROW DRAWS THE BOUNDARY because nothing else on the record distinguishes one area
 * from another. On the live corpus of 13: 11 names are a case variant of
 * "Distribution <n>", 12 have no description at all, and 10 share one creation date.
 * The old row rendered exactly those three fields, so ten consecutive rows differed
 * only in a trailing digit. The shapes are wildly different — a diagonal dumbbell, a
 * flat wedge, a notched blob — and a 56pt thumbnail separates them without reading a
 * word. 56pt was chosen by rendering 40/56/72 at true 1x: at 40 the notch on
 * Distribution 2 goes mushy, at 72 the card grows for nothing.
 *
 * IT COSTS NO EXTRA REQUEST. `geometry` is already on every row of GET /service-area/
 * (row keys are exactly created_at, created_by_uuid, description, geometry, is_deleted,
 * name, uuid), which is how the map screen builds itself from the same call. Measured
 * parse + project + area + vertex count for a full 20-row page: ~0.2 ms.
 *
 * IT IS AN SVG, NOT A MAP. A <MapView> per row mounts a real MKMapView/GoogleMap with
 * its own render thread and tile fetches; `liteMode` is Android-only and `cacheEnabled`
 * still renders once per instance. This is one Path in one flat view, needs no network,
 * and renders in the browser build too — where a native map cannot.
 *
 * SIZE IS TEXT, NOT SCALE. Every thumbnail is normalised to its own box, so shape
 * survives and scale does not: two areas 93x apart (the corpus spans 4.3 to 405 km²)
 * can draw the same path. The km² figure is what carries that, so it sits on the meta
 * line in full-contrast near-black and must never be demoted to decoration.
 *
 * COLOUR IS A HINT, NEVER AN IDENTIFIER. Ten colours over 13 areas already collide;
 * over 100 it is a coarse grouping. It exists so a row and its polygon on the map read
 * as the same thing, which is why utils/areaColour is shared with map.tsx.
 *
 * EVERY TEXT COLOUR IS AN EXPLICIT HEX, not an opacity. The card hardcodes a white
 * background while app.json sets userInterfaceStyle "automatic", so anything styled by
 * opacity alone would go near-white on white in dark mode.
 *
 * `parseTs`, not `new Date`: created_at arrives without a zone
 * ("2025-10-11T11:17:19.474224") and is naive UTC, so a bare parse can name the wrong
 * day for any viewer west of UTC — the old row had that bug.
 */
export const ServiceAreaCard = React.memo(function ServiceAreaCard({
  area,
  onPress,
}: {
  area: ServiceAreaRow;
  onPress: () => void;
}) {
  const { t } = useLanguage();

  // one parse per geometry string, not one per render: a 20-row page re-renders on
  // every keystroke in the search box
  const shape = useMemo(() => {
    const polys = parseWktPolygons(area.geometry ?? '');
    const outer = polys[0]?.coordinates ?? [];
    return {
      d: thumbPath(polys, THUMB, THUMB_PAD),
      km2: outer.length ? ringAreaM2(outer) / 1e6 : null,
      points: outer.length ? ringVertexCount(outer) : null,
      parts: polys.length,
    };
  }, [area.geometry]);

  const colour = shape.d ? areaColour(area.uuid) : AREA_NO_SHAPE;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={onPress}
      testID={`service-area-${area.uuid}`}
    >
      <View style={[styles.thumb, { backgroundColor: `${colour}14`, borderColor: `${colour}33` }]}>
        {shape.d ? (
          <Svg width={THUMB} height={THUMB} testID={`service-area-shape-${area.uuid}`}>
            <Path
              d={shape.d}
              fill={`${colour}3D`}
              stroke={colour}
              strokeWidth={1.5}
              strokeLinejoin="round"
              // holes are extra subpaths in the same `d`, so they must subtract
              fillRule="evenodd"
            />
          </Svg>
        ) : (
          // Never a blank tile — blank reads as "this area covers nowhere" rather than
          // "we could not draw it". Drawn, not typed: the obvious placeholder glyphs
          // (U+20DE, U+2B1A) are a combining mark and a rarely-shipped dingbat, and
          // both come out as nothing or tofu.
          <Svg width={THUMB} height={THUMB}>
            <Rect
              x={14} y={14} width={THUMB - 28} height={THUMB - 28} rx={3}
              fill="none" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray={[3, 3]}
            />
          </Svg>
        )}
      </View>

      <View style={styles.body}>
        <ThemedText style={styles.name} numberOfLines={1}>
          {area.name}
        </ThemedText>

        {/* separate Text siblings rather than one "a · b" string: a concatenated line
            of Latin digits, units and separators reorders unpredictably under bidi,
            while flex children just mirror as a whole */}
        <View style={styles.metaRow}>
          {shape.km2 != null ? (
            <>
              <ThemedText style={styles.size} testID={`service-area-size-${area.uuid}`}>
                {t('serviceAreas.areaSize', { km2: formatKm2(shape.km2) })}
              </ThemedText>
              <ThemedText style={styles.points}>
                {t('serviceAreas.pointCount', { points: String(shape.points ?? 0) })}
              </ThemedText>
            </>
          ) : (
            // the grey tile already says "not on the map"; this says why. The map drops
            // an area it cannot parse, so without this the row promises a shape that is
            // not there.
            <ThemedText style={styles.noShape}>{t('serviceAreas.noShape')}</ThemedText>
          )}
          {shape.parts > 1 && (
            <ThemedText style={styles.badge}>
              {t('serviceAreas.parts', { count: String(shape.parts) })}
            </ThemedText>
          )}
          {/* the date joins the meta line when there is no description to carry it.
              12 of the 13 real areas have none, so giving it a row of its own left an
              empty line and a date floating against the far edge of every card. */}
          {!area.description && !!area.created_at && (
            <ThemedText style={[styles.when, styles.whenInline]}>
              {formatNumericDate(parseTs(area.created_at))}
            </ThemedText>
          )}
        </View>

        {!!area.description && (
          <View style={styles.footRow}>
            <ThemedText style={styles.desc} numberOfLines={1}>
              {area.description}
            </ThemedText>
            <ThemedText style={styles.when}>
              {area.created_at ? formatNumericDate(parseTs(area.created_at)) : ''}
            </ThemedText>
          </View>
        )}
      </View>

      {/* last child, so forceRTL lands it on the trailing edge; the glyph itself does
          not mirror, so it is picked the way ScrollingChipRow picks its overflow arrow */}
      <ThemedText style={styles.chevron}>{I18nManager.isRTL ? '‹' : '›'}</ThemedText>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  // the app's one card: white, radius 12, padding 16, 12 below, the same shadow tuple
  // as inventory.tsx and purchase-orders.tsx, so this module does not read as a
  // different app
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  thumb: {
    width: THUMB, height: THUMB, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    // the drawing must not mirror in Arabic — geography has no reading direction
    overflow: 'hidden',
  },
  body: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: '700', lineHeight: 21, color: '#111827' },
  // flexWrap on purpose: an Arabic size string plus a parts badge may need a second
  // line, and wrapping is better than clipping. It also means the card height is NOT
  // constant — do not add getItemLayout on the assumption that it is.
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  // tabular figures so the sizes line up down the page; a silent no-op where the
  // platform font lacks them
  size: { fontSize: 13, fontWeight: '700', lineHeight: 18, color: '#111827', fontVariant: ['tabular-nums'] },
  points: { fontSize: 12, lineHeight: 18, color: '#6B7280' },
  noShape: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#B45309' },
  badge: {
    fontSize: 10, fontWeight: '600', lineHeight: 14, color: '#4B5563',
    backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 999, overflow: 'hidden',
  },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  desc: { flex: 1, fontSize: 12, lineHeight: 17, color: '#6B7280' },
  when: { fontSize: 11, lineHeight: 17, color: '#6B7280', fontVariant: ['tabular-nums'] },
  // pushed to the trailing edge of the meta line, so it lands where the eye already
  // expects a date without claiming a row of its own
  whenInline: { marginLeft: 'auto' },
  chevron: { fontSize: 22, lineHeight: 24, fontWeight: '600', color: '#9CA3AF' },
});
