// imported explicitly: @types/jest is not a dependency of this project
import { describe, expect, it } from '@jest/globals';
import { needsLocationDisclosure, type PermissionSnapshot } from '@/utils/locationDisclosure';

const GRANTED: PermissionSnapshot = { granted: true, canAskAgain: true };
const ASKABLE: PermissionSnapshot = { granted: false, canAskAgain: true };
const BLOCKED: PermissionSnapshot = { granted: false, canAskAgain: false };

describe('needsLocationDisclosure', () => {
  it.each([
    ['nothing granted yet', ASKABLE, ASKABLE],
    ['foreground granted, background still askable', GRANTED, ASKABLE],
  ])('shows the disclosure when %s', (_label, foreground, background) => {
    expect(needsLocationDisclosure(foreground, background, false)).toBe(true);
  });

  it.each([
    ['background already granted', GRANTED, GRANTED],
    ['foreground blocked by the OS', BLOCKED, ASKABLE],
    ['background blocked by the OS', GRANTED, BLOCKED],
  ])('skips the disclosure when %s', (_label, foreground, background) => {
    expect(needsLocationDisclosure(foreground, background, false)).toBe(false);
  });

  it('skips the disclosure once it was shown this launch', () => {
    expect(needsLocationDisclosure(ASKABLE, ASKABLE, true)).toBe(false);
  });
});
