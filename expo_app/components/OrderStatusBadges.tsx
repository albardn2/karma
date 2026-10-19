import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { fulfilState, payState } from '@/utils/orderStatus';

interface Props {
  order: Parameters<typeof fulfilState>[0] & { is_overdue?: boolean | null };
  style?: StyleProp<ViewStyle>;
}

/**
 * A customer order's status as independent facts — goods, money, lateness —
 * because they are independent: an order can be fulfilled and unpaid, paid and
 * unfulfilled. One component for the list row and the detail screen, so the
 * two cannot disagree about the same order.
 */
export function OrderStatusBadges({ order, style }: Props) {
  const { t } = useLanguage();
  const goods = fulfilState(order);
  const money = payState(order);

  return (
    <View style={[styles.badges, style]}>
      {goods === 'none' ? (
        // nothing on the order: neither "fulfilled" nor "paid" means anything
        <ThemedText style={[styles.badge, styles.neutral]}>
          {t('customerOrders.noItemsBadge')}
        </ThemedText>
      ) : (
        <>
          <ThemedText
            style={[styles.badge, goods === 'fulfilled' ? styles.ok : styles.neutral]}
          >
            {goods === 'fulfilled'
              ? t('customerOrders.fulfilled')
              : t('customerOrders.unfulfilled')}
          </ThemedText>
          <ThemedText
            style={[
              styles.badge,
              money === 'paid' ? styles.ok : money === 'unpaid' ? styles.due : styles.neutral,
            ]}
          >
            {money === 'paid'
              ? t('customerOrders.paid')
              : money === 'unpaid'
                ? t('customerOrders.unpaid')
                : t('customerOrders.noCharge')}
          </ThemedText>
        </>
      )}
      {!!order.is_overdue && (
        <ThemedText style={[styles.badge, styles.overdue]}>{t('customerOrders.overdue')}</ThemedText>
      )}
    </View>
  );
}

export const badgeStyles = StyleSheet.create({
  badge: {
    fontSize: 11,
    // ThemedText's 24pt default line box made these pills twice their height
    lineHeight: 15,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  ok: { backgroundColor: '#dcfce7', color: '#166534' },
  // a shade darker than the page (#f1f5f9), which the header badges sit on
  neutral: { backgroundColor: '#e5e7eb', color: '#374151' },
  due: { backgroundColor: '#fef3c7', color: '#92400e' },
  overdue: { backgroundColor: '#fee2e2', color: '#991b1b' },
});

const layout = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});

const styles = { ...badgeStyles, ...layout };
