import React from 'react';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/** Today, as the naive YYYY-MM-DD the API wants — no zone suffix. */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Record a rate by hand.
 *
 * Worth having because the scraper is not always right and not always up: a wrong
 * USD→SYP rate silently mis-prices everything quoted against it, and an accountant who
 * knows the real number should be able to say so from a phone.
 *
 * THIS IS AN UPSERT, not an insert. One rate exists per (from, to, date), so posting
 * again for a date that already has one REPLACES it — the API answers 201 when it
 * inserted and 200 when it replaced, which is why the form does not pretend to be
 * "create only" or warn about duplicates. Nothing here needs to check first.
 *
 * A manual row also OUTRANKS the scraper: the upsert refuses to overwrite
 * source='manual' with source='sp-today'. So a correction entered here sticks rather
 * than being undone by the next scrape, which is the behaviour that makes this screen
 * worth offering at all — and also means a wrong manual entry has to be corrected by
 * another manual entry.
 *
 * from and to must differ, so both are offered rather than one being assumed; a rate
 * from a currency to itself is refused by the server.
 */
export default function ExchangeRateCreateScreen() {
  const { t, tef } = useLanguage();

  const fields: FormField[] = [
    {
      name: 'from_currency',
      label: t('exchangeRates.from'),
      required: true,
      kind: 'select',
      options: ['USD', 'SYP'].map((v) => ({ value: v, label: tef(v) })),
    },
    {
      name: 'to_currency',
      label: t('exchangeRates.to'),
      required: true,
      kind: 'select',
      options: ['USD', 'SYP'].map((v) => ({ value: v, label: tef(v) })),
    },
    { name: 'rate', label: t('exchangeRates.rate'), required: true, kind: 'number' },
    { name: 'rate_date', label: t('exchangeRates.date'), required: true },
    { name: 'buy_rate', label: t('exchangeRates.buy'), kind: 'number' },
    { name: 'sell_rate', label: t('exchangeRates.sell'), kind: 'number' },
    { name: 'notes', label: t('exchangeRates.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="exchange-rates"
      title={t('exchangeRates.record')}
      note={t('exchangeRates.upsertNote')}
      fields={fields}
      // a manual entry is the point of this screen, and the server stamps the source
      initial={{ from_currency: 'USD', to_currency: 'SYP', rate_date: today() }}
      method="POST"
      endpoint="/exchange-rate/"
    />
  );
}
