import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { PickerField } from '@/components/PickerField';
import { FilterChip, ScrollingChipRow } from '@/components/FilterChips';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';
import { apiCall, isOk } from '@/utils/api';
import {
  availableOf,
  fifoPlan,
  mergeByMaterial,
  num,
  round6,
  EPS,
  Lot,
} from '@/utils/fifo';

interface InLine {
  /** from a counter, never the array index — removing a card must not re-key the rest */
  key: string;
  material_uuid: string;
  material_name: string;
  unit: string;
  /** RAW TEXT: '' and NaN must stay distinguishable, so this is never a number */
  quantity: string;
  lots: Lot[];
  lotsFailed: boolean;
  lotsTruncated: boolean;
  loading: boolean;
}

interface OutLine {
  key: string;
  material_uuid: string;
  material_name: string;
  unit: string;
  quantity: string;
}

let seq = 0;
const nextKey = () => `k${++seq}`;
const blankIn = (): InLine => ({
  key: nextKey(),
  material_uuid: '',
  material_name: '',
  unit: '',
  quantity: '',
  lots: [],
  lotsFailed: false,
  lotsTruncated: false,
  loading: false,
});
const blankOut = (): OutLine => ({
  key: nextKey(),
  material_uuid: '',
  material_name: '',
  unit: '',
  quantity: '',
});


/** A prefill source, already normalised — nothing downstream ever touches a raw blob. */
interface Recipe {
  /** the uuid. Never the name: duplicate names are permitted and there is no index. */
  key: string;
  source: 'template' | 'run';
  name: string;
  /** RAW AND UNTRUSTED: `type` is a free varchar on a template, not the closed enum */
  type: string;
  createdAt: string;
  notes: string;
  inputs: { material_uuid: string; quantity: number }[];
  outputs: { material_uuid: string; quantity: number }[];
  warehouse: string;
  /** rows the merge collapsed — reported, never applied silently */
  collapsed: number;
  /** rows dropped for having no material or no positive amount */
  skipped: number;
}

/**
 * Whitelist every row down to the two fields a preset may contribute, then collapse
 * repeats.
 *
 * A WHITELIST, NOT A BLACKLIST, and that is the load-bearing decision. `data` is a
 * free-form dict the API does not validate, but ProcessData is extra="forbid" while
 * still declaring inventory_uuid, cost_per_unit, total_cost and inputs_used as
 * Optional — so a stored run's blob replayed verbatim PASSES validation and then does
 * the wrong thing. The worst of those is an output's inventory_uuid: the domain mints a
 * lot only when it is absent, so replaying it appends this run's output onto the
 * ORIGINAL run's lot, ignores the chosen warehouse, and leaves both runs sharing a lot
 * that a delete would soft-delete underneath the other.
 *
 * The Array.isArray guard is not decoration: `data.inputs` can legally be the string
 * "nope", and .map would throw inside a render path.
 */
const cleanRows = (raw: unknown) => {
  const src = Array.isArray(raw) ? raw : [];
  const kept = src
    .map((r: any) => ({
      material_uuid: typeof r?.material_uuid === 'string' ? r.material_uuid.trim() : '',
      quantity: num(String(r?.quantity ?? '')),
    }))
    .filter((r) => r.material_uuid && Number.isFinite(r.quantity) && r.quantity > 0);
  const merged = mergeByMaterial(kept).map((m) => ({
    material_uuid: m.material_uuid,
    quantity: round6(m.quantity),
  }));
  return { rows: merged, dropped: src.length - kept.length, collapsed: kept.length - merged.length };
};

/**
 * One normaliser for both sources, so a saved recipe and a cloned run cannot diverge.
 *
 * MERGING IS MANDATORY FOR A CLONED RUN. The server rewrites data.inputs with one row
 * per lot it drew from — a single 443.13 line comes back as 433.13 + 10.0 — so an
 * unmerged clone would show two cards for one material and ask for a multiple of what
 * was intended. Nothing server-side catches that: the duplicate-input validator is
 * commented out. Outputs are merged too, because a duplicate output IS rejected, with a
 * 400 the user could otherwise not act on.
 *
 * Returns null for anything that could not produce a runnable form. Not tidiness:
 * POST /process/ with inputs: [] answers 201 and mints stock out of nothing, and most
 * templates here carry an empty data blob — offering one would hand the user a
 * permanently blocked form with no explanation.
 */
const toRecipe = (src: any, source: 'template' | 'run'): Recipe | null => {
  const d = src?.data && typeof src.data === 'object' && !Array.isArray(src.data) ? src.data : {};
  const i = cleanRows(d.inputs);
  const o = cleanRows(d.outputs);
  if (!i.rows.length || !o.rows.length) return null;
  return {
    key: String(src?.uuid ?? ''),
    source,
    name: source === 'template' ? String(src?.name ?? '') : '',
    type: typeof src?.type === 'string' ? src.type : '',
    createdAt: String(src?.created_at ?? ''),
    // a recipe's note is part of the recipe; a run's note is about that Tuesday
    notes: source === 'template' ? String(src?.notes ?? '') : '',
    inputs: i.rows,
    outputs: o.rows,
    warehouse: typeof d.output_warehouse_uuid === 'string' ? d.output_warehouse_uuid.trim() : '',
    collapsed: i.collapsed + o.collapsed,
    skipped: i.dropped + o.dropped,
  };
};

/** The list DTO caps per_page at 100; 101 is a 422 rather than a clamp. */
const PER_PAGE = 100;
/** Bound the oldest-first walk for a material with a very long lot history. */
const MAX_LOT_PAGES = 5;

/**
 * Record a production run: what it consumes, and what it produces.
 *
 * THE USER DOES NOT CHOOSE LOTS, AND THAT IS THE WHOLE REASON THIS SCREEN IS PRACTICAL.
 * An earlier version of this module was left read-only on the belief that the form meant
 * "two variable-length material grids with no on-hand figures to check against". That
 * was wrong about the API. The client sends a material and an amount; the server picks
 * the lots itself, oldest first, and rewrites the request with what it actually drew —
 * verified by sending one input line of 443.13 and getting back two rows, 433.13 from
 * the 2025 lot and 10.0 from the 2026 one. So this is an ordinary two-column form, and
 * the lot arithmetic is a preview rather than an input.
 *
 * THIS WRITE MOVES REAL STOCK, so three things are non-negotiable:
 *
 *  - ON-HAND IS AUTHORITATIVE, NOT ADVISORY. Each picked material triggers one
 *    lot fetch, and the shortfall is shown while the amount is still being typed. The
 *    server's own refusal is a 404 whose text carries a bare uuid and float noise
 *    ("available 508.13000000000466"), which is not a sentence anyone should read.
 *  - AN EMPTY INPUT LIST IS REFUSED HERE, because it is not refused there: posting
 *    `inputs: []` returns 201 and mints stock out of nothing at zero cost. There is no
 *    server guard, so this is the only one.
 *  - THE CONFIRM NAMES THE LOTS AND THE NUMBERS. A generic "are you sure" in front of an
 *    irreversible-ish stock movement is decoration; this one states what leaves which
 *    lot and what is created, and says that deleting the run puts the stock back only
 *    until something else consumes the new lot.
 *
 * WHAT IS DELIBERATELY NEVER SENT: an input `inventory_uuid` (discarded and re-derived),
 * `cost_per_unit` / `total_cost` / `inputs_used` / `cost_currency` (all computed
 * server-side and silently overwritten), and above all an OUTPUT `inventory_uuid` —
 * pointing an output at an existing lot is accepted and makes the run permanently
 * undeletable, because delete then trips the "inventory has events" guard.
 */
export default function ProcessCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, tef } = useLanguage();

  const [types, setTypes] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [warehouseName, setWarehouseName] = useState('');
  const [notes, setNotes] = useState('');
  const [inputs, setInputs] = useState<InLine[]>([blankIn()]);
  const [outputs, setOutputs] = useState<OutLine[]>([blankOut()]);
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  // prefill
  const canReadTpl = useHasEndpoint('process_template', 'read');
  const canWriteTpl = useHasEndpoint('process_template', 'create');
  const canDeleteTpl = useHasEndpoint('process_template', 'delete');
  const [openStart, setOpenStart] = useState(false);
  const [recipes, setRecipes] = useState<{ tpl: Recipe[]; runs: Recipe[] } | null>(null);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const [recipeName, setRecipeName] = useState('');
  const [savingRecipe, setSavingRecipe] = useState(false);
  /** synchronous latch: the server sleeps a second per output, so a double tap is easy */
  const busy = useRef(false);

  useEffect(() => {
    apiCall<string[]>('/process/types').then((res) => {
      if (isOk(res.status) && Array.isArray(res.data)) setTypes(res.data);
    });
  }, []);

  const setIn = (key: string, patch: Partial<InLine>) =>
    setInputs((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setOut = (key: string, patch: Partial<OutLine>) =>
    setOutputs((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /**
   * Every live lot of one material, oldest first.
   *
   * Walked DOWNWARD from the last page because the list is ordered created_at DESC, so
   * page 1 is the newest 100 — the wrong end entirely for a FIFO preview on a material
   * with a long history.
   */
  const fetchLots = useCallback(async (materialUuid: string) => {
    const url = (page: number) =>
      `/inventory/?material_uuid=${materialUuid}&per_page=${PER_PAGE}&page=${page}`;
    const first = await apiCall<{ inventories?: Lot[]; pages?: number }>(url(1));
    if (!isOk(first.status)) return { lots: [] as Lot[], failed: true, truncated: false };
    const pages = Number(first.data?.pages ?? 1);
    const all: Lot[] = [...(first.data?.inventories ?? [])];
    let truncated = false;
    if (pages > 1) {
      const wanted: number[] = [];
      for (let p = pages; p >= 2 && wanted.length < MAX_LOT_PAGES - 1; p--) wanted.push(p);
      truncated = pages - 1 > wanted.length;
      const rest = await Promise.all(wanted.map((p) => apiCall<{ inventories?: Lot[] }>(url(p))));
      for (const r of rest) if (isOk(r.status)) all.push(...(r.data?.inventories ?? []));
    }
    return { lots: all, failed: false, truncated };
  }, []);

  const pickInputMaterial = useCallback(
    async (key: string, uuid: string, label: string) => {
      setIn(key, {
        material_uuid: uuid,
        material_name: label,
        lots: [],
        lotsFailed: false,
        lotsTruncated: false,
        loading: true,
      });
      const [{ lots, failed, truncated }, mat] = await Promise.all([
        fetchLots(uuid),
        apiCall<{ measure_unit?: string | null }>(`/material/${uuid}`),
      ]);
      setIn(key, {
        lots,
        lotsFailed: failed,
        lotsTruncated: truncated,
        loading: false,
        unit: isOk(mat.status) ? (mat.data?.measure_unit ?? '') : '',
      });
    },
    [fetchLots],
  );

  const pickOutputMaterial = useCallback(async (key: string, uuid: string, label: string) => {
    setOut(key, { material_uuid: uuid, material_name: label, unit: '' });
    const res = await apiCall<{ measure_unit?: string | null }>(`/material/${uuid}`);
    if (isOk(res.status)) setOut(key, { unit: res.data?.measure_unit ?? '' });
  }, []);

  // ---- derived, recomputed every render; nothing derived is ever stored ----

  const completeIn = inputs.filter(
    (l) => l.material_uuid && Number.isFinite(num(l.quantity)) && num(l.quantity) > 0,
  );
  const completeOut = outputs.filter(
    (l) => l.material_uuid && Number.isFinite(num(l.quantity)) && num(l.quantity) > 0,
  );

  /** one row per material: a cloned run lists the same material once per lot it spanned */
  const merged = useMemo(
    () =>
      mergeByMaterial(
        completeIn.map((l) => ({ ...l, quantity: round6(num(l.quantity)) })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(completeIn.map((l) => [l.material_uuid, l.quantity]))],
  );

  const shortfalls = useMemo(
    () =>
      merged
        .map((m) => {
          const line = m.from[0] as unknown as InLine;
          const have = availableOf(line.lots);
          return { m, line, have, short: m.quantity - have };
        })
        .filter((x) => x.short > EPS),
    [merged],
  );

  const blockers: string[] = [];
  if (!type || !types.includes(type)) blockers.push(t('processes.needType'));
  if (!warehouse) blockers.push(t('processes.needWarehouse'));
  inputs.forEach((l, i) => {
    const touched = l.material_uuid || l.quantity.trim();
    if (touched && !completeIn.includes(l)) {
      blockers.push(t('processes.lineIncomplete', { n: String(i + 1) }));
    }
  });
  outputs.forEach((l, i) => {
    const touched = l.material_uuid || l.quantity.trim();
    if (touched && !completeOut.includes(l)) {
      blockers.push(t('processes.lineIncomplete', { n: String(i + 1) }));
    }
  });
  if (!merged.length) blockers.push(t('processes.needAnInput'));
  if (!completeOut.length) blockers.push(t('processes.needAnOutput'));
  if (new Set(completeOut.map((o) => o.material_uuid)).size !== completeOut.length) {
    blockers.push(t('processes.duplicateOutput'));
  }
  if (completeIn.some((l) => l.lotsFailed)) blockers.push(t('processes.stockUnavailable'));
  for (const s of shortfalls) {
    blockers.push(
      t('processes.insufficient', {
        material: s.line.material_name,
        need: String(round6(s.m.quantity)),
        have: String(round6(s.have)),
      }),
    );
  }

  /** the same sentences the confirm will carry, shown on screen before it is opened */
  const consequence = useMemo(() => {
    const lines: string[] = [];
    for (const m of merged) {
      const line = m.from[0] as unknown as InLine;
      const { draws } = fifoPlan(line.lots, m.quantity);
      for (const d of draws) {
        const left = round6(Number(d.lot.current_quantity) - d.take);
        lines.push(
          `· ${t('processes.drawFrom', {
            qty: String(d.take),
            unit: line.unit || '',
            lot: d.lot.lot_id || String(d.lot.uuid).slice(0, 8),
          })} — ${t('processes.leaves', { qty: String(left) })}`,
        );
      }
    }
    const made = completeOut.map(
      (o) => `· ${round6(num(o.quantity))} ${o.unit || ''} ${o.material_name}`.trim(),
    );
    return { taken: lines, made };
  }, [merged, completeOut, t]);

  const consequenceText = [
    t('processes.consumes') + ':',
    ...consequence.taken,
    '',
    t('processes.produces', { warehouse: warehouseName || '' }) + ':',
    ...consequence.made,
    '',
    t('processes.undoNote'),
  ].join('\n');

  /** re-read the authoritative lots for every picked material, just before writing */
  const refreshPicked = useCallback(async () => {
    const ids = [...new Set(completeIn.map((l) => l.material_uuid))];
    const results = await Promise.all(ids.map((id) => fetchLots(id)));
    let changed = false;
    setInputs((prev) =>
      prev.map((l) => {
        const i = ids.indexOf(l.material_uuid);
        if (i < 0) return l;
        const r = results[i];
        if (!r.failed && Math.abs(availableOf(r.lots) - availableOf(l.lots)) > EPS) changed = true;
        return { ...l, lots: r.lots, lotsFailed: r.failed, lotsTruncated: r.truncated };
      }),
    );
    return changed;
  }, [completeIn, fetchLots]);

  const doPost = async () => {
    // synchronous, set before any await: the server sleeps ~1s per output line, which
    // leaves a wide window for a second tap to start its own request
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        type,
        data: {
          inputs: merged.map((m) => ({
            material_uuid: m.material_uuid,
            quantity: round6(m.quantity),
          })),
          outputs: completeOut.map((o) => ({
            material_uuid: o.material_uuid,
            quantity: round6(num(o.quantity)),
          })),
          output_warehouse_uuid: warehouse,
        },
      };
      if (notes.trim()) body.notes = notes.trim();

      const res = await apiCall<{ uuid?: string }>('/process/', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (isOk(res.status)) {
        // never render this response — the cost fields are computed in-request and a
        // later notes-only PUT re-stamps them; the detail screen refetches
        if (res.data?.uuid) router.replace(`/processes/${res.data.uuid}`);
        else router.back();
        return;
      }
      // raw response TEXT, never JSON.parse: a 500 here is an HTML page
      const raw = String(res.error ?? '').slice(0, 300);
      let msg = raw || t('form.tryAgain');
      if (res.status === 403) msg = t('processes.forbiddenCreate');
      else if (res.status === 409) msg = t('processes.warehouseMissing');
      else if (res.status === 404 && /Insufficient inventory/i.test(raw)) {
        // a race, not a user error — someone drew the stock between check and write
        msg = t('processes.raceLost');
        await refreshPicked();
      } else if (res.status === 404 && /not found/i.test(raw)) {
        msg = t('processes.materialMissing');
      } else if (/Duplicate material uuids/i.test(raw)) msg = t('processes.duplicateOutput');
      else if (/No outputs defined/i.test(raw)) msg = t('processes.needAnOutput');
      Alert.alert(t('form.saveFailed'), msg);
    } catch {
      Alert.alert(t('form.saveFailed'), t('form.tryAgain'));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };


  /**
   * Fetched only when the row is opened, never at mount.
   *
   * A single run item is about 3 KB with its data blob and 251 bytes without, and there
   * is no way to ask for the list without it — so a mount-time fetch would tax every
   * open of this screen to serve a minority. Production currently has zero templates,
   * which makes that trade worse still.
   */
  const loadRecipes = useCallback(async () => {
    setLoadingRecipes(true);
    const [tplRes, runRes] = await Promise.all([
      // a driver is 403 here but 200 on /process/, so the two are fetched independently
      // and a refusal drops that section rather than the whole row
      canReadTpl
        ? apiCall<{ items?: unknown[] }>('/process-template/?per_page=100')
        : Promise.resolve({ status: 403, data: undefined, error: undefined }),
      apiCall<{ items?: unknown[] }>('/process/?per_page=8'),
    ]);
    const norm = (rows: unknown[] | undefined, src: 'template' | 'run'): Recipe[] =>
      (rows ?? []).map((r) => toRecipe(r, src)).filter((r): r is Recipe => r !== null);
    setRecipes({
      tpl: isOk(tplRes.status) ? norm(tplRes.data?.items, 'template') : [],
      runs: isOk(runRes.status) ? norm(runRes.data?.items, 'run') : [],
    });
    setLoadingRecipes(false);
  }, [canReadTpl]);

  /**
   * Fill the form from a normalised recipe.
   *
   * `type` is TESTED for membership rather than assigned: it is a free string on a
   * template, so a recipe can name a process the enum no longer contains, and assigning
   * it would show a chip row with nothing selected and a 422 at the end.
   *
   * The warehouse is likewise verified rather than trusted — the one real template here
   * stores a blank one, which is a 409 at create.
   *
   * Every prefilled input then fetches its own lots, because a recipe records what was
   * once possible, not what is in stock today. That is the whole reason the amounts are
   * left editable and the user is told to check them.
   */
  const applyRecipe = useCallback(
    (r: Recipe) => {
      const notes: string[] = [];
      if (r.type && types.includes(r.type)) setType(r.type);
      else if (r.type) notes.push(t('processes.typeNotUsable'));

      if (r.warehouse) setWarehouse(r.warehouse);
      else notes.push(t('processes.warehouseNotUsable'));

      const ins = r.inputs.map((row) => ({
        ...blankIn(),
        material_uuid: row.material_uuid,
        quantity: String(row.quantity),
      }));
      const outs = r.outputs.map((row) => ({
        ...blankOut(),
        material_uuid: row.material_uuid,
        quantity: String(row.quantity),
      }));
      setInputs(ins);
      setOutputs(outs);
      if (r.notes) setNotes(r.notes);
      if (r.name) setRecipeName(r.name);

      if (r.collapsed) notes.push(t('processes.mergedRows', { count: String(r.collapsed) }));
      if (r.skipped) notes.push(t('processes.skippedRows', { count: String(r.skipped) }));
      notes.unshift(
        r.source === 'template' ? t('processes.applied', { name: r.name }) : t('processes.appliedRun'),
      );
      notes.push(t('processes.checkAmounts'));
      setApplied(notes);
      setOpenStart(false);
      setShowProblems(false);

      // resolve names, units and on-hand for everything just filled in
      ins.forEach((l) => pickInputMaterial(l.key, l.material_uuid, ''));
      outs.forEach((l) => pickOutputMaterial(l.key, l.material_uuid, ''));
    },
    [types, t, pickInputMaterial, pickOutputMaterial],
  );

  const saveRecipe = async () => {
    const name = recipeName.trim();
    if (!name) return Alert.alert(t('processes.saveAsTemplate'), t('processes.recipeNameRequired'));
    if (!merged.length || !completeOut.length) {
      return Alert.alert(t('processes.saveAsTemplate'), t('processes.recipeNeedsRows'));
    }
    setSavingRecipe(true);
    try {
      // exactly what a recipe is allowed to carry — no lot, no cost, no currency
      const res = await apiCall('/process-template/', {
        method: 'POST',
        body: JSON.stringify({
          name,
          type,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          data: {
            inputs: merged.map((m) => ({
              material_uuid: m.material_uuid,
              quantity: round6(m.quantity),
            })),
            outputs: completeOut.map((o) => ({
              material_uuid: o.material_uuid,
              quantity: round6(num(o.quantity)),
            })),
            ...(warehouse ? { output_warehouse_uuid: warehouse } : {}),
          },
        }),
      });
      if (isOk(res.status)) {
        Alert.alert(t('processes.recipeSaved', { name }));
        setRecipes(null);
        return;
      }
      Alert.alert(
        t('processes.recipeSaveFailed'),
        String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
      );
    } finally {
      setSavingRecipe(false);
    }
  };

  const deleteRecipe = (r: Recipe) =>
    Alert.alert(
      t('processes.deleteRecipe'),
      t('processes.deleteRecipeConfirm', { name: r.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('detail.delete'),
          style: 'destructive',
          onPress: async () => {
            const res = await apiCall(`/process-template/${r.key}`, { method: 'DELETE' });
            if (isOk(res.status)) {
              setRecipes((p) => (p ? { ...p, tpl: p.tpl.filter((x) => x.key !== r.key) } : p));
            } else {
              Alert.alert(t('processes.recipeDeleteFailed'));
            }
          },
        },
      ],
    );

  const submit = async () => {
    setShowProblems(true);
    if (blockers.length) return;
    const changed = await refreshPicked();
    if (changed) {
      Alert.alert(t('processes.confirmTitle'), t('processes.stockChanged'));
      return;
    }
    Alert.alert(t('processes.confirmTitle'), `${consequenceText}\n\n${t('processes.confirmMove')}`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('processes.runIt'), onPress: doPost },
    ]);
  };

  const materialPicker = {
    endpoint: '/material/',
    itemsKey: 'materials',
    searchParam: 'name',
    params: { per_page: '100' },
    label: (m: any) => m.name ?? '—',
    value: (m: any) => m.uuid,
    sublabel: (m: any) => [m.sku, m.measure_unit].filter(Boolean).join(' · ') || undefined,
  };

  return (
    <ModuleGuard module="processes">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="form-cancel">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('processes.create')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top + 50}
        >
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText style={styles.note}>{t('processes.createNote')}</ThemedText>

            {/* collapsed by default and fetching nothing until opened: production has
                zero saved recipes today, so a mount-time list would tax every open of
                this screen to serve a minority and still show an empty box */}
            <TouchableOpacity
              style={styles.startRow}
              onPress={() => {
                const next = !openStart;
                setOpenStart(next);
                if (next && !recipes && !loadingRecipes) loadRecipes();
              }}
              testID="proc-start-from"
            >
              <ThemedText style={styles.startText}>{t('processes.startFrom')}</ThemedText>
              <ThemedText style={styles.startChevron}>{openStart ? '⌃' : '⌄'}</ThemedText>
            </TouchableOpacity>

            {openStart && (
              <View style={styles.startPanel}>
                {loadingRecipes ? (
                  <ThemedText style={styles.hint}>{t('processes.loadingRecipes')}</ThemedText>
                ) : !recipes || (!recipes.tpl.length && !recipes.runs.length) ? (
                  <ThemedText style={styles.hint}>{t('processes.noRecipes')}</ThemedText>
                ) : (
                  <>
                    {!!recipes.tpl.length && (
                      <>
                        <ThemedText style={styles.startHead}>
                          {t('processes.savedRecipes')}
                        </ThemedText>
                        {recipes.tpl.map((r) => (
                          <View key={r.key} style={styles.recipeRow}>
                            <TouchableOpacity
                              style={styles.recipeMain}
                              onPress={() => applyRecipe(r)}
                              testID={`proc-recipe-${r.key}`}
                            >
                              <ThemedText style={styles.recipeName} numberOfLines={1}>
                                {r.name || tef(r.type)}
                              </ThemedText>
                              <ThemedText style={styles.recipeMeta}>
                                {`${tef(r.type)} · ${t('processes.recipeSummary', {
                                  inputs: String(r.inputs.length),
                                  outputs: String(r.outputs.length),
                                })}`}
                              </ThemedText>
                            </TouchableOpacity>
                            {/* delete lives on the row, not behind applying it first —
                                DELETE is the only cleanup this API has, since there is
                                no update and no get-by-uuid */}
                            {canDeleteTpl && (
                              <TouchableOpacity
                                onPress={() => deleteRecipe(r)}
                                hitSlop={10}
                                testID={`proc-recipe-del-${r.key}`}
                              >
                                <ThemedText style={styles.remove}>✕</ThemedText>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </>
                    )}
                    {!!recipes.runs.length && (
                      <>
                        <ThemedText style={styles.startHead}>
                          {t('processes.recentRuns')}
                        </ThemedText>
                        {recipes.runs.map((r) => (
                          <TouchableOpacity
                            key={r.key}
                            style={styles.recipeMain}
                            onPress={() => applyRecipe(r)}
                            testID={`proc-run-${r.key}`}
                          >
                            <ThemedText style={styles.recipeName} numberOfLines={1}>
                              {tef(r.type)}
                            </ThemedText>
                            <ThemedText style={styles.recipeMeta}>
                              {t('processes.recipeSummary', {
                                inputs: String(r.inputs.length),
                                outputs: String(r.outputs.length),
                              })}
                            </ThemedText>
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                  </>
                )}
              </View>
            )}

            {!!applied.length && (
              <View style={styles.appliedBox} testID="proc-applied">
                {applied.map((line, i) => (
                  <ThemedText key={i} style={styles.appliedLine}>
                    {line}
                  </ThemedText>
                ))}
              </View>
            )}

            <ThemedText style={styles.label}>{t('processes.type')} *</ThemedText>
            <ScrollingChipRow>
              {types.map((ty) => (
                <FilterChip
                  key={ty}
                  label={tef(ty)}
                  active={type === ty}
                  onPress={() => setType(ty)}
                  testID={`proc-type-${ty}`}
                />
              ))}
            </ScrollingChipRow>

            <ThemedText style={[styles.label, styles.spaced]}>
              {t('processes.outputWarehouse')} *
            </ThemedText>
            <PickerField
              spec={{
                endpoint: '/warehouse/',
                itemsKey: 'warehouses',
                searchParam: 'name',
                label: (w) => w.name ?? '—',
                value: (w) => w.uuid,
              }}
              value={warehouse}
              onChange={(v, label) => {
                setWarehouse(v);
                setWarehouseName(label);
              }}
              testID="proc-warehouse"
            />
            <ThemedText style={styles.hint}>{t('processes.warehouseHint')}</ThemedText>

            <ThemedText style={styles.sectionTitle}>{t('processes.inputs')}</ThemedText>
            <ThemedText style={styles.hint}>{t('processes.lotsNotChosen')}</ThemedText>
            {inputs.map((l, i) => {
              const q = num(l.quantity);
              const have = availableOf(l.lots);
              const plan = l.material_uuid && q > 0 ? fifoPlan(l.lots, q) : null;
              return (
                <View key={l.key} style={styles.card} testID={`proc-in-${i}`}>
                  <View style={styles.cardHead}>
                    <ThemedText style={styles.cardIndex}>{i + 1}</ThemedText>
                    <TouchableOpacity
                      onPress={() => setInputs((p) => p.filter((x) => x.key !== l.key))}
                      disabled={inputs.length === 1}
                      hitSlop={10}
                      testID={`proc-in-remove-${i}`}
                    >
                      <ThemedText style={[styles.remove, inputs.length === 1 && styles.removeOff]}>
                        ✕
                      </ThemedText>
                    </TouchableOpacity>
                  </View>

                  <PickerField
                    spec={materialPicker}
                    value={l.material_uuid}
                    onChange={(uuid, label) => pickInputMaterial(l.key, uuid, label)}
                    testID={`proc-in-material-${i}`}
                  />

                  {!!l.material_uuid && (
                    <ThemedText style={styles.stock}>
                      {l.loading
                        ? '…'
                        : l.lotsFailed
                          ? t('processes.onHandUnknown')
                          : have <= 0
                            ? t('processes.onHandNone')
                            : t('processes.onHand', {
                                qty: String(round6(have)),
                                unit: l.unit || '',
                                lots: String(l.lots.filter((x) => x.current_quantity > 0).length),
                              })}
                    </ThemedText>
                  )}

                  <View style={styles.qtyRow}>
                    <TextInput
                      style={styles.input}
                      value={l.quantity}
                      onChangeText={(v) => setIn(l.key, { quantity: v })}
                      placeholder={t('processes.quantity')}
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                      testID={`proc-in-qty-${i}`}
                    />
                    {!!l.unit && <ThemedText style={styles.unit}>{tef(l.unit)}</ThemedText>}
                  </View>

                  {/* the preview: which lots this would draw from, oldest first */}
                  {plan?.draws.map((d) => (
                    <ThemedText key={d.lot.uuid} style={styles.draw}>
                      →{' '}
                      {t('processes.drawFrom', {
                        qty: String(d.take),
                        unit: l.unit || '',
                        lot: d.lot.lot_id || String(d.lot.uuid).slice(0, 8),
                      })}
                    </ThemedText>
                  ))}
                  {!!l.lotsTruncated && (
                    <ThemedText style={styles.hint}>{t('processes.manyLots')}</ThemedText>
                  )}
                </View>
              );
            })}
            <TouchableOpacity
              style={styles.addRow}
              onPress={() => setInputs((p) => [...p, blankIn()])}
              testID="proc-add-input"
            >
              <ThemedText style={styles.addText}>+ {t('processes.addInput')}</ThemedText>
            </TouchableOpacity>

            <ThemedText style={styles.sectionTitle}>{t('processes.outputs')}</ThemedText>
            <ThemedText style={styles.hint}>{t('processes.outputNewLotNote')}</ThemedText>
            {outputs.map((l, i) => (
              <View key={l.key} style={styles.card} testID={`proc-out-${i}`}>
                <View style={styles.cardHead}>
                  <ThemedText style={styles.cardIndex}>{i + 1}</ThemedText>
                  <TouchableOpacity
                    onPress={() => setOutputs((p) => p.filter((x) => x.key !== l.key))}
                    disabled={outputs.length === 1}
                    hitSlop={10}
                    testID={`proc-out-remove-${i}`}
                  >
                    <ThemedText style={[styles.remove, outputs.length === 1 && styles.removeOff]}>
                      ✕
                    </ThemedText>
                  </TouchableOpacity>
                </View>
                <PickerField
                  spec={materialPicker}
                  value={l.material_uuid}
                  onChange={(uuid, label) => pickOutputMaterial(l.key, uuid, label)}
                  testID={`proc-out-material-${i}`}
                />
                <View style={styles.qtyRow}>
                  <TextInput
                    style={styles.input}
                    value={l.quantity}
                    onChangeText={(v) => setOut(l.key, { quantity: v })}
                    placeholder={t('processes.quantity')}
                    placeholderTextColor="#9ca3af"
                    keyboardType="decimal-pad"
                    testID={`proc-out-qty-${i}`}
                  />
                  {!!l.unit && <ThemedText style={styles.unit}>{tef(l.unit)}</ThemedText>}
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={styles.addRow}
              onPress={() => setOutputs((p) => [...p, blankOut()])}
              testID="proc-add-output"
            >
              <ThemedText style={styles.addText}>+ {t('processes.addOutput')}</ThemedText>
            </TouchableOpacity>

            {/* the consequence, on screen before the confirm rather than only inside it */}
            {!!consequence.taken.length && (
              <View style={styles.consequence} testID="proc-consequence">
                <ThemedText style={styles.consTitle}>{t('processes.consumes')}</ThemedText>
                {consequence.taken.map((l, i) => (
                  <ThemedText key={i} style={styles.consLine}>
                    {l}
                  </ThemedText>
                ))}
                {!!consequence.made.length && (
                  <>
                    <ThemedText style={[styles.consTitle, styles.spaced]}>
                      {t('processes.produces', { warehouse: warehouseName || '' })}
                    </ThemedText>
                    {consequence.made.map((l, i) => (
                      <ThemedText key={i} style={styles.consLine}>
                        {l}
                      </ThemedText>
                    ))}
                  </>
                )}
                <ThemedText style={styles.undo}>{t('processes.undoNote')}</ThemedText>
              </View>
            )}

            <ThemedText style={[styles.label, styles.spaced]}>
              {t('processes.notesLabel')}
            </ThemedText>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={notes}
              onChangeText={setNotes}
              multiline
              testID="proc-notes"
            />

            {canWriteTpl && (
              <View style={styles.saveTpl}>
                <ThemedText style={styles.label}>{t('processes.saveAsTemplate')}</ThemedText>
                <View style={styles.qtyRow}>
                  <TextInput
                    style={styles.input}
                    value={recipeName}
                    onChangeText={setRecipeName}
                    placeholder={t('processes.recipeNamePlaceholder')}
                    placeholderTextColor="#9ca3af"
                    maxLength={255}
                    testID="proc-recipe-name"
                  />
                  <TouchableOpacity
                    style={styles.saveTplBtn}
                    onPress={saveRecipe}
                    disabled={savingRecipe}
                    testID="proc-save-recipe"
                  >
                    <ThemedText style={styles.saveTplText}>
                      {t('processes.saveAsTemplate')}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* if the button is disabled, the reason is on screen — the web's create
                button silently does nothing on an invalid row */}
            {showProblems && blockers.length > 0 && (
              <View style={styles.blockers} testID="proc-blockers">
                {blockers.map((b, i) => (
                  <ThemedText key={i} style={styles.blocker}>
                    {b}
                  </ThemedText>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.submit, (saving || (showProblems && !!blockers.length)) && styles.submitOff]}
              onPress={submit}
              disabled={saving}
              testID="form-submit"
            >
              {saving ? (
                <View style={styles.savingRow}>
                  <ActivityIndicator color="#fff" />
                  <ThemedText style={styles.submitText}>{t('processes.saving')}</ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.submitText}>{t('processes.runIt')}</ThemedText>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  note: { fontSize: 13, color: '#6B7280', lineHeight: 19, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, opacity: 0.75 },
  spaced: { marginTop: 16 },
  hint: { fontSize: 12, color: '#6B7280', marginTop: 6, marginBottom: 8, lineHeight: 17 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 22 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardIndex: { fontSize: 12, fontWeight: '700', color: '#9CA3AF' },
  remove: { fontSize: 15, color: '#dc2626', fontWeight: '700' },
  removeOff: { opacity: 0.25 },
  stock: { fontSize: 12, fontWeight: '600', color: '#374151' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unit: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  draw: { fontSize: 11, color: '#6B7280', lineHeight: 16 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  addRow: { paddingVertical: 10, alignItems: 'center' },
  addText: { fontSize: 14, fontWeight: '700', color: '#5469D4' },
  consequence: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
    gap: 2,
  },
  consTitle: { fontSize: 13, fontWeight: '700', color: '#312E81' },
  consLine: { fontSize: 12, color: '#3730A3', lineHeight: 18 },
  undo: { fontSize: 11, color: '#4338CA', lineHeight: 16, marginTop: 8 },
  blockers: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginTop: 18,
    gap: 4,
  },
  blocker: { fontSize: 12, color: '#B91C1C', lineHeight: 17 },
  submit: {
    marginTop: 20,
    backgroundColor: '#5469D4',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitOff: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  startRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    marginBottom: 12,
  },
  startText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151' },
  startChevron: { fontSize: 14, color: '#6B7280' },
  startPanel: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    padding: 10,
    marginBottom: 12,
  },
  startHead: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 4,
  },
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recipeMain: { flex: 1, paddingVertical: 8 },
  recipeName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  recipeMeta: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  appliedBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 2,
  },
  appliedLine: { fontSize: 12, color: '#065F46', lineHeight: 17 },
  saveTpl: { marginTop: 22, gap: 6 },
  saveTplBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  saveTplText: { fontSize: 13, fontWeight: '700', color: '#4338CA' },
});
