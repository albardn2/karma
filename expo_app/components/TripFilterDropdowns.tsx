import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

/** GET /trip/filter-options: the people and vehicles on at least one trip. */
interface FilterOptions {
  assignees: { uuid: string; username: string; name: string }[];
  vehicles: { uuid: string; plate_number: string }[];
}

type Which = 'assignee' | 'vehicle';

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  /** user uuid, or '' for everyone */
  assignee: string;
  /** vehicle uuid, or '' for all vehicles */
  vehicle: string;
  onAssigneeChange: (uuid: string) => void;
  onVehicleChange: (uuid: string) => void;
}

/**
 * The trip list's "assigned to" and vehicle filters, as two dropdowns side by
 * side: the same pair the web's filter menu has.
 *
 * The choices come from the trip endpoint rather than the user and vehicle lists:
 * they are exactly the people and plates that appear on some trip, so every
 * choice finds something, and the user list is not the trip reader's to call.
 * They are re-read each time a sheet opens, so a trip created since shows up.
 */
export function TripFilterDropdowns({ assignee, vehicle, onAssigneeChange, onVehicleChange }: Props) {
  const { t } = useLanguage();
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  // Which sheet is showing, kept apart from whether it is open and NOT reset on
  // close: on iOS the Modal keeps rendering its content while it slides away, so
  // deriving the content from a value cleared on close turned the closing
  // vehicle sheet into the people sheet for the length of the animation.
  const [which, setWhich] = useState<Which>('assignee');

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const res = await apiCall<FilterOptions>('/trip/filter-options');
    if (isOk(res.status) && res.data) setOptions(res.data);
    else setFailed(true);
    setLoading(false);
  }, []);

  // once up front, so the buttons can name an already-chosen person or plate
  useEffect(() => {
    load();
  }, [load]);

  const assigneeOptions: Option[] = useMemo(
    () =>
      (options?.assignees ?? []).map((a) => ({
        value: a.uuid,
        label: a.name,
        sublabel: a.name !== a.username ? a.username : undefined,
      })),
    [options]
  );
  const vehicleOptions: Option[] = useMemo(
    () => (options?.vehicles ?? []).map((v) => ({ value: v.uuid, label: v.plate_number })),
    [options]
  );

  // a chosen value can outlive its option (its last trip deleted since); name it
  // by its raw value rather than showing an active filter as if nothing were set
  const labelFor = (list: Option[], value: string) =>
    list.find((o) => o.value === value)?.label ?? value;

  const openSheet = (sheet: Which) => {
    setWhich(sheet);
    setOpen(true);
    load();
  };
  const isVehicle = which === 'vehicle';
  // With a large system text size, half the screen is too narrow for a label,
  // so the pills take a row each instead of truncating to one or two letters.
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;

  return (
    <View style={[styles.row, stacked && styles.rowStacked]}>
      <FilterPill
        icon="person.fill"
        title={t('trips.filterAssignee')}
        value={assignee ? labelFor(assigneeOptions, assignee) : null}
        onPress={() => openSheet('assignee')}
        onClear={() => onAssigneeChange('')}
        stacked={stacked}
        testID="trips-filter-assignee"
      />
      <FilterPill
        icon={VEHICLE_ICON}
        title={t('trips.filterVehicle')}
        value={vehicle ? labelFor(vehicleOptions, vehicle) : null}
        onPress={() => openSheet('vehicle')}
        onClear={() => onVehicleChange('')}
        stacked={stacked}
        testID="trips-filter-vehicle"
      />

      <OptionSheet
        visible={open}
        title={isVehicle ? t('trips.filterVehicle') : t('trips.filterAssignee')}
        allLabel={isVehicle ? t('trips.allVehicles') : t('trips.allAssignees')}
        options={isVehicle ? vehicleOptions : assigneeOptions}
        selected={isVehicle ? vehicle : assignee}
        // the cached list stays on screen while it refreshes; the spinner is only
        // for the very first load
        loading={loading && !options}
        failed={failed && !options}
        onRetry={load}
        onPick={(value) => {
          if (isVehicle) onVehicleChange(value);
          else onAssigneeChange(value);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        testID={`trips-filter-${which}-sheet`}
      />
    </View>
  );
}

/**
 * One filter as a pill, the usual filter-bar pattern: at rest it names the
 * filter ("Assigned to", "Vehicle") with a chevron; once set it turns indigo,
 * shows the choice instead, and the chevron becomes a clear button, so undoing
 * a filter is one tap rather than open, scroll to the top, pick "Everyone".
 */
// box.truck.fill only exists from iOS 16 (SF Symbols 4); the app still installs
// on iOS 15.1, where it would leave the circle empty
const VEHICLE_ICON: 'box.truck.fill' | 'car.fill' =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) < 16 ? 'car.fill' : 'box.truck.fill';

function FilterPill({
  icon,
  title,
  value,
  onPress,
  onClear,
  stacked,
  testID,
}: {
  icon: 'person.fill' | 'box.truck.fill' | 'car.fill';
  title: string;
  /** the chosen option's label, or null when the filter is off */
  value: string | null;
  onPress: () => void;
  onClear: () => void;
  /** a row of its own (large text sizes) rather than half of one */
  stacked: boolean;
  testID: string;
}) {
  const { t } = useLanguage();
  const active = value !== null;
  return (
    <View style={[styles.pill, stacked && styles.pillStacked, active && styles.pillActive]}>
      <TouchableOpacity
        style={[styles.pillMain, active && styles.pillMainActive]}
        onPress={onPress}
        activeOpacity={0.7}
        // the row's top padding and the gap to the chips below take the target
        // past 44pt without making the pill itself any taller
        hitSlop={{ top: 8, bottom: 2 }}
        accessibilityRole="button"
        accessibilityLabel={active ? `${title}: ${value}` : title}
        accessibilityHint={t('trips.filterHint')}
        testID={testID}
      >
        <View style={[styles.pillIcon, active && styles.pillIconActive]}>
          <IconSymbol name={icon} size={15} color={active ? '#FFFFFF' : '#5469D4'} />
        </View>
        {/* Truncates rather than shrinking to fit: under the new architecture
            minimumFontScale is ignored on both platforms, so a long name would
            shrink to a 4pt floor. A size cap keeps the label inside the pill at
            the largest accessibility sizes. */}
        <ThemedText
          style={[styles.pillLabel, active && styles.pillLabelActive]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
          testID={`${testID}-value`}
        >
          {active ? value : title}
        </ThemedText>
        {!active && <IconSymbol name="chevron.down" size={14} color="#6B7280" weight="semibold" />}
      </TouchableOpacity>
      {active && (
        <TouchableOpacity
          style={styles.pillClear}
          onPress={onClear}
          // 32 wide plus 8 either side = a 48pt target without spending the
          // label's width on it; symmetric, because hitSlop is physical and the
          // x changes sides in RTL
          hitSlop={{ top: 8, bottom: 2, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('trips.clearFilter', { name: title })}
          testID={`${testID}-clear`}
        >
          <IconSymbol name="xmark.circle.fill" size={18} color="#5469D4" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function OptionSheet({
  visible,
  title,
  allLabel,
  options,
  selected,
  loading,
  failed,
  onRetry,
  onPick,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  allLabel: string;
  options: Option[];
  selected: string;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onPick: (value: string) => void;
  onClose: () => void;
  testID?: string;
}) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The search box sits at the top of a bottom sheet, so the keyboard would
          otherwise cover the very list being searched. 'padding' on Android too:
          the app is edge-to-edge (app.json), which stops a Modal's window from
          resizing for the keyboard, so nothing else makes room for it there. */}
      <KeyboardAvoidingView style={styles.backdropWrap} behavior="padding">
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} testID={testID}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>{title}</ThemedText>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={t('trips.filterClose')}
              testID="trips-filter-sheet-close"
            >
              <ThemedText style={styles.closeText}>✕</ThemedText>
            </TouchableOpacity>
          </View>

          <SheetBody
            allLabel={allLabel}
            options={options}
            selected={selected}
            loading={loading}
            failed={failed}
            onRetry={onRetry}
            onPick={onPick}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * The search and the list. A component of its own so the search lives and dies
 * with the Modal's content: the Modal stops rendering it once the sheet is gone
 * (after the slide-out on iOS, at once on Android), so the query and the input
 * reset together, and only between openings, never while the sheet is closing.
 */
function SheetBody({
  allLabel,
  options,
  selected,
  loading,
  failed,
  onRetry,
  onPick,
}: {
  allLabel: string;
  options: Option[];
  selected: string;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onPick: (value: string) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || (o.sublabel ?? '').toLowerCase().includes(q)
      )
    : options;
  // "everyone" stays at the top whatever the search, so clearing is one tap
  const rows: Option[] = [{ value: '', label: allLabel }, ...shown];

  return (
    <>
      {/* uncontrolled (no `value`): each keystroke re-filters the list, and a
          controlled input under that re-render drops fast keystrokes */}
      <TextInput
        style={styles.search}
        defaultValue=""
        onChangeText={setQuery}
        placeholder={t('moduleList.search')}
        placeholderTextColor="#9CA3AF"
        autoCorrect={false}
        autoCapitalize="none"
        testID="trips-filter-sheet-search"
      />

      {loading ? (
        <ActivityIndicator style={styles.spinner} color="#5469D4" />
      ) : failed ? (
        <View style={styles.centered}>
          <ThemedText style={styles.errorText}>{t('trips.filterOptionsFailed')}</ThemedText>
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
            <ThemedText style={styles.retryText}>{t('trips.summaryRetry')}</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(o) => o.value || '__all__'}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          style={styles.list}
          renderItem={({ item }) => {
            const on = item.value === selected;
            return (
              <TouchableOpacity
                style={[styles.option, on && styles.optionOn]}
                onPress={() => onPick(item.value)}
                accessibilityRole="button"
                // the tick is only drawn, so say it too
                accessibilityState={{ selected: on }}
                testID={`trips-filter-option-${item.value || 'all'}`}
              >
                <View style={styles.optionText}>
                  <ThemedText style={[styles.optionLabel, on && styles.optionLabelOn]} numberOfLines={1}>
                    {item.label}
                  </ThemedText>
                  {!!item.sublabel && (
                    <ThemedText style={styles.optionSub} numberOfLines={1}>
                      {item.sublabel}
                    </ThemedText>
                  )}
                </View>
                {on && <ThemedText style={styles.tick}>✓</ThemedText>}
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={
            !options.length ? (
              <ThemedText style={styles.note}>{t('trips.filterNoOptions')}</ThemedText>
            ) : q && !shown.length ? (
              <ThemedText style={styles.note}>{t('moduleList.noMatches')}</ThemedText>
            ) : null
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // flexDirection 'row' flips itself under RTL, so "assigned to" stays first
  // gap 8, the same as between the chips below
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
  rowStacked: { flexDirection: 'column' },
  // white with a soft lift, so the pills read as controls above the flat grey
  // status chips rather than as two more of them
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    // a minimum rather than a height, so a larger system text size can grow it
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pillStacked: { flex: 0 },
  // flat once set; elevation as well as the shadow, or Android keeps its lift
  pillActive: { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC', shadowOpacity: 0, elevation: 0 },
  pillMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 6,
    paddingEnd: 12,
    paddingVertical: 4,
    gap: 6,
  },
  // the clear button carries its own spacing, so the label gets this back
  pillMainActive: { paddingEnd: 0 },
  pillIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  pillIconActive: { backgroundColor: '#5469D4' },
  // 13pt: a step above the chips' 12 so the pills still read as the main
  // controls, and room for a full name or plate in half a phone's width. One
  // weight in both states, so choosing a value does not make it wider; an
  // explicit lineHeight, or ThemedText's 24 would be scaled into the label.
  pillLabel: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#374151', textAlign: 'left' },
  pillLabelActive: { color: '#3B4CB8' },
  pillClear: { width: 32, alignItems: 'center', justifyContent: 'center' },
  backdropWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  // a fixed height, so the sheet does not jump as the search narrows the list;
  // a percentage of the space above the keyboard once one is up
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#111827' },
  // a 44pt target; the negative margins keep the glyph and the header height
  // where they were
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: -10,
    marginVertical: -8,
  },
  closeText: { fontSize: 18, color: '#6B7280' },
  search: {
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1F2937',
    // an iOS text field does not follow the layout direction by itself: under
    // Arabic the placeholder and typing would otherwise start on the left
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  spinner: { paddingVertical: 32 },
  centered: { paddingVertical: 28, alignItems: 'center' },
  errorText: { fontSize: 13, color: '#DC2626', textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: {
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#5469D4',
  },
  retryText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  list: { flex: 1 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  optionOn: { backgroundColor: '#EEF2FF' },
  optionText: { flex: 1, alignItems: 'flex-start' },
  optionLabel: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  optionLabelOn: { color: '#3B4CB8' },
  optionSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  tick: { fontSize: 15, fontWeight: '800', color: '#5469D4', marginStart: 8 },
  note: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingVertical: 16, paddingHorizontal: 24 },
});
