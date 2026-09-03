import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    // CLDR treats SYP as a zero-decimal currency, which rounds a 0.07/pc
    // unit price to "SYP 0". The new pound (2026-07) has real piastres and
    // the API stores them, so every currency gets the same two digits here.
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
