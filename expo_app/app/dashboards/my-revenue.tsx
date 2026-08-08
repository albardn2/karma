import React from 'react';
import { RevenueOverTimeScreenImpl } from './revenue-over-time';

/** The signed-in user's own revenue — the same screen, self-scoped endpoint. */
export default function MyRevenueScreen() {
  return <RevenueOverTimeScreenImpl mine />;
}
