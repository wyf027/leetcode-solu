import { getCurrentWindow } from "@tauri-apps/api/window";
import { useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";

const DRAG_THRESHOLD_PX = 6;

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  dragged: boolean;
} | null;

export function usePetDrag() {
  const gesture = useRef<Gesture>(null);
  const ignoreNextClick = useRef(false);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const activeGesture = gesture.current;
    if (
      activeGesture === null ||
      activeGesture.pointerId !== event.pointerId ||
      activeGesture.dragged
    ) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - activeGesture.startX,
      event.clientY - activeGesture.startY,
    );
    if (distance < DRAG_THRESHOLD_PX) {
      return;
    }

    activeGesture.dragged = true;
    ignoreNextClick.current = true;
    void getCurrentWindow()
      .startDragging()
      .catch(() => undefined);
  }

  function onPointerCancel() {
    gesture.current = null;
  }

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    if (gesture.current?.dragged || ignoreNextClick.current) {
      event.preventDefault();
      event.stopPropagation();
      gesture.current = null;
      ignoreNextClick.current = false;
      return;
    }

    gesture.current = null;
  }

  return {
    onClick,
    onPointerCancel,
    onPointerDown,
    onPointerMove,
  };
}
