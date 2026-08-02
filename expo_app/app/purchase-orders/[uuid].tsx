import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate } from '@/utils/date';
const money = (n?: number | null, c?: string | null) =>
  n == null ? '—' : `${Number(n).toFixed(2)}${c ? ` ${c}` : ''}`;

interface PurchaseOrder {
  uuid: string;
  vendor_name?: string | null;
  status?: string | null;
  currency?: string | null;
  total_adjusted_amount?: number | null;
  net_amount_due?: number | null;
  is_overdue?: boolean | null;
  created_at: string;
}

export default function PurchaseOrdersDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();

  return (
    <ModuleDetailScreen<PurchaseOrder>
      module="purchase-orders"
      title={t('menu.purchaseOrders')}
      endpoint={`/purchase-order/${uuid}`}
      heading={(x) => x.vendor_name || t('purchaseOrders.noVendor')}
      rows={(x): DetailRow[] => [
        [t('purchaseOrders.total'), money(x.total_adjusted_amount, x.currency)],
        [t('purchaseOrders.outstanding'), money(x.net_amount_due, x.currency)],
        [t('purchaseOrders.status'), x.status ? tef(x.status) : '—'],
        [t('purchaseOrders.when'), formatNumericDate(new Date(x.created_at))],
      ]}
    />
  );
}
