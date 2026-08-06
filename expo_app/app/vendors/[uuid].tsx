import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';
import { apiCall, isOk } from '@/utils/api';

interface Vendor {
  uuid: string;
  company_name: string;
  full_name?: string | null;
  phone_number?: string | null;
  category?: string | null;
  email_address?: string | null;
  full_address?: string | null;
  notes?: string | null;
  /** computed per request; negative means the business owes the vendor */
  balance_per_currency?: Record<string, number> | null;
}

export default function VendorsDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t, tef } = useLanguage();
  const [reloadKey, setReloadKey] = useState(0);
  const canCreatePo = useHasEndpoint('purchase_order', 'create');

  /**
   * Balance is signed, and the sign is the whole point: negative means money is
   * owed TO the supplier. Rendered as an explicit "owed" or "in credit" phrase
   * rather than a bare negative number, because a minus in front of a supplier
   * balance gets read both ways by different people.
   */
  const balanceRows = (v: Vendor): DetailRow[] =>
    Object.entries(v.balance_per_currency ?? {}).map(([currency, amount]) => [
      t('vendors.balanceIn', { currency }),
      Number(amount) < 0
        ? t('vendors.owed', { amount: Math.abs(Number(amount)).toFixed(2) })
        : t('vendors.credit', { amount: Number(amount).toFixed(2) }),
    ]);

  const remove = async () => {
    const res = await apiCall(`/vendor/${uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) {
      router.back();
      return;
    }
    // The backend refuses to delete a vendor that still has purchase orders, notes
    // or a non-zero balance. Show its reason rather than a generic failure — the
    // reason is the actionable part.
    Alert.alert(t('detail.delete'), String(res.error ?? '').slice(0, 300) || t('form.tryAgain'));
  };

  return (
    <ModuleDetailScreen<Vendor>
      module="vendors"
      title={t('menu.vendors')}
      endpoint={`/vendor/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => x.company_name}
      rows={(x): DetailRow[] => [
        [t('vendors.contact'), x.full_name || '—'],
        [t('vendors.phone'), x.phone_number || '—'],
        [t('vendors.email'), x.email_address || '—'],
        [t('vendors.category'), x.category ? tef(x.category) : '—'],
        [t('vendors.address'), x.full_address || '—'],
        ...balanceRows(x),
      ]}
      actions={[
        {
          // raising an order is the thing you came to a supplier's page to do; the
          // create screen seeds its vendor picker from these two params
          label: t('purchaseOrders.create'),
          testID: 'vendor-new-po',
          visible: () => canCreatePo,
          onPress: (x) =>
            router.push({
              pathname: '/purchase-orders/create',
              params: { vendor_uuid: x.uuid, vendor_name: x.company_name ?? '' },
            }),
        },
        {
          label: t('detail.edit'),
          testID: 'vendor-edit',
          onPress: (x) => {
            // bump on return so the record reflects the edit without a manual pull
            setReloadKey((k) => k + 1);
            router.push({
              pathname: '/vendors/create',
              params: {
                uuid: x.uuid,
                company_name: x.company_name ?? '',
                full_name: x.full_name ?? '',
                phone_number: x.phone_number ?? '',
                email_address: x.email_address ?? '',
                category: x.category ?? '',
                full_address: x.full_address ?? '',
                notes: x.notes ?? '',
              },
            });
          },
        },
        {
          label: t('detail.delete'),
          destructive: true,
          testID: 'vendor-delete',
          onPress: remove,
        },
      ]}
    />
  );
}
