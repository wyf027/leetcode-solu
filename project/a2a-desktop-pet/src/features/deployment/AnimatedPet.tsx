import { useEffect, useState } from "react";
import {
  idlePetAnimation,
  petAnimationByState,
  statePresentation,
} from "./presentation";
import type { DeploymentState } from "./types";

const FALLBACK_IMAGE = "/pet/unknown-fallback.png";
export const SUCCESS_CELEBRATION_DURATION_MS = 9_000;

export function AnimatedPet({ state }: { state: DeploymentState }) {
  const [showIdleAnimation, setShowIdleAnimation] = useState(false);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const animationSource =
    state === "deployed" && showIdleAnimation
      ? idlePetAnimation
      : petAnimationByState[state];

  useEffect(() => {
    if (state !== "deployed") {
      return undefined;
    }

    const timer = window.setTimeout(
      () => setShowIdleAnimation(true),
      SUCCESS_CELEBRATION_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <img
      alt={`星际水滴精灵：${statePresentation[state].label}`}
      className="animate-pet-swap h-full w-full object-contain"
      draggable={false}
      onError={() => setFailedSource(animationSource)}
      src={failedSource === animationSource ? FALLBACK_IMAGE : animationSource}
    />
  );
}
