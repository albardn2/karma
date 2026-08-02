import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';

interface Vendor {
  uuid: string;
  company_name: string;
  full_name?: string | null;
  phone_number?: string | null;
  category?: string | null;
  email_address?: string | null;
  full_address?: string | null;
}

export default function VendorsDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();

  return (
    <ModuleDetailScreen<Vendor>
      module="vendors"
      title={t('menu.vendors')}
      endpoint={`/vendor/${uuid}`}
      heading={(x) => x.company_name}
      rows={(x): DetailRow[] => [
        [t('vendors.contact'), x.full_name || '—'],
        [t('vendors.phone'), x.phone_number || '—'],
        [t('vendors.email'), x.email_address || '—'],
        [t('vendors.category'), x.category ? tef(x.category) : '—'],
        [t('vendors.address'), x.full_address || '—'],
      ]}
    />
  );
}
