import React from 'react';
import { NewCustomersScreenImpl } from './new-customers';

/** Customers the signed-in user created — the same screen, self-scoped endpoint. */
export default function MyNewCustomersScreen() {
  return <NewCustomersScreenImpl mine />;
}
