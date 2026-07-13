import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { apiCall } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMonthDayTime } from '@/utils/date';

const TRIP_WORKFLOW_NAME = 'simple_trip_workflow';

interface TaskExecutionSummary {
  uuid: string;
  name?: string | null;
  status: string;
}

interface WorkflowExecution {
  uuid: string;
  workflow_uuid: string;
  name?: string | null;
  status: string;
  created_at: string;
  start_time?: string | null;
  end_time?: string | null;
  task_executions?: TaskExecutionSummary[];
}

interface WorkflowExecutionPage {
  workflow_executions: WorkflowExecution[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

type StatusFilter = 'all' | 'in_progress' | 'completed' | 'cancelled';

const STATUS_FILTERS: { value: StatusFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'dist.statusAll' },
  { value: 'in_progress', labelKey: 'dist.statusInProgress' },
  { value: 'completed', labelKey: 'dist.statusCompleted' },
  { value: 'cancelled', labelKey: 'dist.statusCancelled' },
];

const STATUS_STYLES: Record<string, { bg: string; fg: string; labelKey: string }> = {
  in_progress: { bg: '#FEF3C7', fg: '#B45309', labelKey: 'dist.statusInProgress' },
  completed: { bg: '#D1FAE5', fg: '#047857', labelKey: 'dist.statusCompleted' },
  cancelled: { bg: '#FEE2E2', fg: '#B91C1C', labelKey: 'dist.statusCancelled' },
  failed: { bg: '#FEE2E2', fg: '#B91C1C', labelKey: 'dist.statusFailed' },
  not_started: { bg: '#E5E7EB', fg: '#4B5563', labelKey: 'dist.statusNotStarted' },
};

// backend timestamps are naive UTC; parse them as UTC
const toDate = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
  return isNaN(d.getTime()) ? null : d;
};

const formatDateTime = (s?: string | null) => {
  const d = toDate(s);
  if (!d) return '—';
  return formatMonthDayTime(d);
};

export default function DistributionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  // admins see every trip; everyone else only their own (created or assigned)
  const scopes: string[] = (user?.permission_scope || '').split(',').map((s: string) => s.trim());
  const isAdmin = scopes.includes('admin') || scopes.includes('superuser');
  const [workflowUuid, setWorkflowUuid] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('in_progress');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  // admin-only: filter trips by assigned user
  const [users, setUsers] = useState<{ uuid: string; username: string; first_name?: string; last_name?: string }[]>([]);
  const [assignedUsername, setAssignedUsername] = useState<string | null>(null);
  const [userPickerOpen, setUserPickerOpen] = useState(false);

  // the workflow uuid differs per environment, so resolve it by name once
  useEffect(() => {
    (async () => {
      const response = await apiCall<{ workflows: { uuid: string }[] }>(
        `/workflow/?name=${TRIP_WORKFLOW_NAME}&per_page=1`
      );
      const found = response.data?.workflows?.[0];
      if (found) {
        setWorkflowUuid(found.uuid);
      } else {
        setWorkflowError(response.error || t('dist.workflowNotFound', { name: TRIP_WORKFLOW_NAME }));
        setLoading(false);
      }
    })();
  }, []);

  // admins get a "filter by assigned user" control — load the user list
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const res = await apiCall<{ users: any[] }>('/auth/users?per_page=100');
      setUsers(res.data?.users || []);
    })();
  }, [isAdmin]);

  const fetchExecutions = async (showSpinner = true) => {
    if (!workflowUuid) return;
    try {
      if (showSpinner) setLoading(true);
      const params = new URLSearchParams({
        workflow_uuid: workflowUuid,
        page: page.toString(),
        per_page: '20',
      });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      // non-admins are restricted server-side regardless; sending mine is a no-op safety net.
      if (!isAdmin) params.append('mine', 'true');
      // admin-only assigned-user filter
      if (isAdmin && assignedUsername) params.append('assigned_user_uuid', assignedUsername);

      const response = await apiCall<WorkflowExecutionPage>(`/workflow-execution/?${params.toString()}`);
      if (response.data) {
        setExecutions(response.data.workflow_executions);
        setTotalPages(response.data.pages);
        setTotalCount(response.data.total_count);
      } else if (response.error) {
        Alert.alert(t('dist.errorTitle'), t('dist.loadExecutionsFailed', { error: response.error }));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowUuid, page, statusFilter, isAdmin, assignedUsername]);

  const userLabel = (u: { username: string; first_name?: string; last_name?: string }) => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
    return name ? `${name} (${u.username})` : u.username;
  };
  const assignedLabel = assignedUsername
    ? userLabel(users.find((u) => u.username === assignedUsername) || { username: assignedUsername })
    : t('dist.allUsers');

  const onRefresh = () => {
    setRefreshing(true);
    fetchExecutions(false);
  };

  const handleStartTrip = () => {
    router.push('/distribution/start');
  };

  const handleExecutionPress = (execution: WorkflowExecution) => {
    router.push(`/distribution/${execution.uuid}`);
  };

  const taskProgress = (execution: WorkflowExecution) => {
    const tasks = execution.task_executions || [];
    if (tasks.length === 0) return null;
    const done = tasks.filter((t) => t.status === 'completed').length;
    return { done, total: tasks.length };
  };

  const statusBadge = (status: string) => {
    const s = STATUS_STYLES[status] || { bg: '#E5E7EB', fg: '#4B5563', labelKey: null };
    return (
      <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
        <ThemedText style={[styles.statusBadgeText, { color: s.fg }]}>{s.labelKey ? t(s.labelKey) : status}</ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Hide the auto-generated route header; we render our own */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header with back button + Start Trip */}
      <NativeHeader
        title={t('dist.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        rightButton={isAdmin ? { label: t('dist.startTripButton'), onPress: handleStartTrip } : undefined}
      />

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]}
            onPress={() => {
              setStatusFilter(f.value);
              setPage(1);
            }}
            testID={`filter-${f.value}`}
          >
            <ThemedText
              style={[styles.filterChipText, statusFilter === f.value && styles.filterChipTextActive]}
            >
              {t(f.labelKey)}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Admin-only: filter by assigned user */}
      {isAdmin && (
        <View style={styles.assignedRow}>
          <ThemedText style={styles.assignedLabel}>{t('dist.assigned')}</ThemedText>
          <TouchableOpacity
            style={styles.assignedDropdown}
            onPress={() => setUserPickerOpen(true)}
            testID="filter-assigned-user"
          >
            <ThemedText style={styles.assignedDropdownText} numberOfLines={1}>{assignedLabel}</ThemedText>
            <ThemedText style={styles.assignedCaret}>▾</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#5469D4" />
        </View>
      ) : workflowError ? (
        <View style={styles.centered}>
          <ThemedText style={styles.emptyTitle}>{t('dist.workflowLoadErrorTitle')}</ThemedText>
          <ThemedText style={styles.emptyText}>{workflowError}</ThemedText>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.listContainer, { paddingBottom: 72 + Math.max(insets.bottom, 6) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {executions.length === 0 ? (
            <View style={styles.centered}>
              <ThemedText style={styles.emptyIcon}>🚚</ThemedText>
              <ThemedText style={styles.emptyTitle}>{t('dist.emptyTitle')}</ThemedText>
              <ThemedText style={styles.emptyText}>
                {statusFilter === 'all'
                  ? t('dist.emptyAllHint')
                  : t('dist.emptyStatusHint')}
              </ThemedText>
            </View>
          ) : (
            executions.map((execution) => {
              const progress = taskProgress(execution);
              return (
                <TouchableOpacity
                  key={execution.uuid}
                  style={styles.card}
                  onPress={() => handleExecutionPress(execution)}
                  activeOpacity={0.7}
                  testID={`execution-${execution.uuid}`}
                >
                  <View style={styles.cardHeader}>
                    <ThemedText style={styles.cardTitle}>
                      {t('dist.tripCardTitle', { date: formatDateTime(execution.start_time || execution.created_at) })}
                    </ThemedText>
                    {statusBadge(execution.status)}
                  </View>
                  <View style={styles.cardMeta}>
                    <ThemedText style={styles.cardMetaText}>
                      {progress ? t('dist.tasksDone', { done: progress.done, total: progress.total }) : t('dist.noTasksYet')}
                    </ThemedText>
                    {execution.end_time && (
                      <ThemedText style={styles.cardMetaText}>
                        {t('dist.ended', { time: formatDateTime(execution.end_time) })}
                      </ThemedText>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageButton, page <= 1 && styles.pageButtonDisabled]}
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                testID="button-prev-page"
              >
                <ThemedText style={styles.pageButtonText}>{t('dist.prevPage')}</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.pageInfo}>
                {t('dist.pageInfo', { page, pages: totalPages, count: totalCount })}
              </ThemedText>
              <TouchableOpacity
                style={[styles.pageButton, page >= totalPages && styles.pageButtonDisabled]}
                disabled={page >= totalPages}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                testID="button-next-page"
              >
                <ThemedText style={styles.pageButtonText}>{t('dist.nextPage')}</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Fixed bottom navigation */}
      <BottomNavigation
        activeTab="menu"
        onTabPress={(t) => router.replace(t === 'home' ? '/' : '/?tab=menu')}
      />

      {/* Assigned-user picker (admin) */}
      <Modal visible={userPickerOpen} transparent animationType="slide" onRequestClose={() => setUserPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{t('dist.filterByAssignedUser')}</ThemedText>
              <TouchableOpacity onPress={() => setUserPickerOpen(false)}><ThemedText style={styles.modalClose}>✕</ThemedText></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList}>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => { setAssignedUsername(null); setPage(1); setUserPickerOpen(false); }}
                testID="assigned-opt-all"
              >
                <ThemedText style={[styles.modalOptionText, !assignedUsername && styles.modalOptionActive]}>
                  {!assignedUsername ? '✓ ' : ''}{t('dist.allUsers')}
                </ThemedText>
              </TouchableOpacity>
              {users.map((u) => (
                <TouchableOpacity
                  key={u.uuid}
                  style={styles.modalOption}
                  onPress={() => { setAssignedUsername(u.username); setPage(1); setUserPickerOpen(false); }}
                  testID={`assigned-opt-${u.username}`}
                >
                  <ThemedText style={[styles.modalOptionText, assignedUsername === u.username && styles.modalOptionActive]}>
                    {assignedUsername === u.username ? '✓ ' : ''}{userLabel(u)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  assignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  assignedLabel: { fontSize: 13, opacity: 0.6 },
  assignedDropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  assignedDropdownText: { fontSize: 14, color: '#111827', flex: 1, marginRight: 8 },
  assignedCaret: { fontSize: 12, color: '#6b7280' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%', paddingBottom: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalClose: { fontSize: 18, color: '#6b7280' },
  modalList: { paddingHorizontal: 8 },
  modalOption: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' },
  modalOptionText: { fontSize: 15, color: '#111827' },
  modalOptionActive: { fontWeight: '700', color: '#5469D4' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(84, 105, 212, 0.08)',
  },
  filterChipActive: {
    backgroundColor: '#5469D4',
  },
  filterChipText: {
    fontSize: 13,
    color: '#5469D4',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardMetaText: {
    fontSize: 13,
    opacity: 0.6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  pageButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(84, 105, 212, 0.1)',
  },
  pageButtonDisabled: {
    opacity: 0.4,
  },
  pageButtonText: {
    color: '#5469D4',
    fontWeight: '600',
    fontSize: 13,
  },
  pageInfo: {
    fontSize: 12,
    opacity: 0.6,
  },
});
