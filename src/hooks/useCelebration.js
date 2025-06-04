import { useState, useCallback } from 'react';

export const useCelebration = () => {
  const [isShowingCelebration, setIsShowingCelebration] = useState(false);

  const triggerCelebration = useCallback(() => {
    setIsShowingCelebration(true);
  }, []);

  const handleCelebrationComplete = useCallback(() => {
    setIsShowingCelebration(false);
  }, []);

  return {
    isShowingCelebration,
    triggerCelebration,
    handleCelebrationComplete
  };
};