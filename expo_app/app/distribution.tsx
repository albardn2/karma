import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  in_progress: { bg: '#FEF3C7', fg: '#B45309', label: 'In Progress' },
  completed: { bg: '#D1FAE5', fg: '#047857', label: 'Completed' },
  cancelled: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Cancelled' },
  failed: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Failed' },
  not_started: { bg: '#E5E7EB', fg: '#4B5563', label: 'Not Started' },
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
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function DistributionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  // admins see every trip; everyone else only their own (created or assigned)
  const scopes: string[] = (user?.permission_scope || '').split(',').map((s: string) => s.trim());
  const isAdmin = scopes.includes('admin') || scopes.includes('superuser');
  const [workflowUuid, setWorkflowUuid] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

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
        setWorkflowError(response.error || `Workflow "${TRIP_WORKFLOW_NAME}" not found`);
        setLoading(false);
      }
    })();
  }, []);

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
      if (!isAdmin) params.append('mine', 'true');

      const response = await apiCall<WorkflowExecutionPage>(`/workflow-execution/?${params.toString()}`);
      if (response.data) {
        setExecutions(response.data.workflow_executions);
        setTotalPages(response.data.pages);
        setTotalCount(response.data.total_count);
      } else if (response.error) {
        Alert.alert('Error', `Failed to load trip executions: ${response.error}`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowUuid, page, statusFilter, isAdmin]);

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
    const s = STATUS_STYLES[status] || { bg: '#E5E7EB', fg: '#4B5563', label: status };
    return (
      <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
        <ThemedText style={[styles.statusBadgeText, { color: s.fg }]}>{s.label}</ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Hide the auto-generated route header; we render our own */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header with back button + Start Trip */}
      <NativeHeader
        title="Distribution"
        onBack={() => router.back()}
        rightButton={{ label: '+ Start Trip', onPress: handleStartTrip }}
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
              {f.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#5469D4" />
        </View>
      ) : workflowError ? (
        <View style={styles.centered}>
          <ThemedText style={styles.emptyTitle}>Could not load the trip workflow</ThemedText>
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
              <ThemedText style={styles.emptyTitle}>No trip executions</ThemedText>
              <ThemedText style={styles.emptyText}>
                {statusFilter === 'all'
                  ? 'Start a trip to see it here.'
                  : 'No executions with this status.'}
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
                      Trip · {formatDateTime(execution.start_time || execution.created_at)}
                    </ThemedText>
                    {statusBadge(execution.status)}
                  </View>
                  <View style={styles.cardMeta}>
                    <ThemedText style={styles.cardMetaText}>
                      {progress ? `${progress.done}/${progress.total} tasks done` : 'No tasks yet'}
                    </ThemedText>
                    {execution.end_time && (
                      <ThemedText style={styles.cardMetaText}>
                        Ended {formatDateTime(execution.end_time)}
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
                <ThemedText style={styles.pageButtonText}>‹ Prev</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.pageInfo}>
                Page {page} of {totalPages} · {totalCount} total
              </ThemedText>
              <TouchableOpacity
                style={[styles.pageButton, page >= totalPages && styles.pageButtonDisabled]}
                disabled={page >= totalPages}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                testID="button-next-page"
              >
                <ThemedText style={styles.pageButtonText}>Next ›</ThemedText>
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
