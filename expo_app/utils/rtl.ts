import { I18nManager } from 'react-native';

/**
 * Chevrons that point the way reading goes.
 *
 * A lone chevron has no strong direction of its own, so the text engine draws it
 * as written even in a right-to-left layout: a literal ‹ would point away from where
 * "back" sits in Arabic. The layout direction only changes across an app reload, so
 * these are fixed for the lifetime of the JS bundle.
 */
export const BACK_GLYPH = I18nManager.isRTL ? '›' : '‹';
export const FORWARD_GLYPH = I18nManager.isRTL ? '‹' : '›';
