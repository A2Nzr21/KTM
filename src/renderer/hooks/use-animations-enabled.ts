import { AnimationLevel, useAnimationLevel } from '/@/renderer/store/settings.store';

/**
 * True when the "All animations" level is active. Components using motion/react
 * consult this so the Minimal tier actually removes JS-driven motion too, not
 * just the CSS layer.
 */
export const useAnimationsEnabled = (): boolean => useAnimationLevel() === AnimationLevel.ALL;
