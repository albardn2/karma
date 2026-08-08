import React from 'react';
import { MaterialsSoldScreenImpl } from './materials-sold';

/** The signed-in user's own materials sold — the same screen, self-scoped endpoint. */
export default function MyMaterialsSoldScreen() {
  return <MaterialsSoldScreenImpl mine />;
}
