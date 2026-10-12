import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
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
  // by its raw value rather than showing an active filter as "Everyone"
  const labelFor = (list: Option[], value: string, allLabel: string) =>
    !value ? allLabel : list.find((o) => o.value === value)?.label ?? value;

  const openSheet = (sheet: Which) => {
    setWhich(sheet);
    setOpen(true);
    load();
  };
  const isVehicle = which === 'vehicle';

  return (
    <View style={styles.row}>
      <DropdownButton
        title={t('trips.filterAssignee')}
        value={labelFor(assigneeOptions, assignee, t('trips.allAssignees'))}
        active={!!assignee}
        onPress={() => openSheet('assignee')}
        testID="trips-filter-assignee"
      />
      <DropdownButton
        title={t('trips.filterVehicle')}
        value={labelFor(vehicleOptions, vehicle, t('trips.allVehicles'))}
        active={!!vehicle}
        onPress={() => openSheet('vehicle')}
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

function DropdownButton({
  title,
  value,
  active,
  onPress,
  testID,
}: {
  title: string;
  value: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, active && styles.buttonActive]}
      onPress={onPress}
      activeOpacity={0.75}
      testID={testID}
    >
      <View style={styles.buttonText}>
        <ThemedText style={[styles.buttonTitle, active && styles.buttonTitleActive]} numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText
          style={[styles.buttonValue, active && styles.buttonValueActive]}
          numberOfLines={1}
          testID={`${testID}-value`}
        >
          {value}
        </ThemedText>
      </View>
      <ThemedText style={[styles.chevron, active && styles.buttonValueActive]}>⌄</ThemedText>
    </TouchableOpacity>
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
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="trips-filter-sheet-close">
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
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  buttonActive: { backgroundColor: '#EEF2FF', borderColor: '#5469D4' },
  buttonText: { flex: 1, alignItems: 'flex-start' },
  buttonTitle: { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  buttonTitleActive: { color: '#5469D4' },
  buttonValue: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 1 },
  buttonValueActive: { color: '#3B4CB8' },
  chevron: { fontSize: 14, color: '#6B7280', marginStart: 6 },
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
  closeBtn: { paddingHorizontal: 8, paddingVertical: 2 },
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
