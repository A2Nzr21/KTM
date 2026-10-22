import { AnimationLevel, useAnimationLevel } from '/@/renderer/store/settings.store';

export const useAnimationsEnabled = (): boolean => useAnimationLevel() === AnimationLevel.ALL;
