import { useEffect, useRef } from "react";

// Moved here from TourismDataContext, unchanged, so that the notifications bell can use the same polling as the booking list and the feedback.
// Ignore a visibility refresh if a run finished this recently (rapid tab switching).
export const VISIBLE_REFRESH_MIN_GAP_MS = 5 * 1000;

// Runs `task` every `intervalMs`, but:
//  - never overlaps itself: the next run is scheduled only after the previous one finishes
//  - pauses completely while the browser tab is hidden
//  - refreshes once right away when the tab becomes visible again
export function useVisibleInterval(task, intervalMs) {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    let timer = null;
    let running = false;
    let stopped = false;
    let lastFinishedAt = 0;

    const isHidden = () => document.visibilityState === "hidden";

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (stopped || isHidden()) {
        return;
      }
      timer = setTimeout(run, intervalMs);
    };

    async function run() {
      timer = null;
      // If a run is in flight, its `finally` will schedule the next one.
      if (stopped || isHidden() || running) {
        return;
      }
      running = true;
      try {
        await taskRef.current();
      } catch (err) {
        // Background refresh: stay quiet on connection drops.
      } finally {
        running = false;
        lastFinishedAt = Date.now();
        schedule();
      }
    }

    function handleVisibilityChange() {
      clearTimer();
      if (isHidden()) {
        return;
      }
      if (Date.now() - lastFinishedAt < VISIBLE_REFRESH_MIN_GAP_MS) {
        schedule();
        return;
      }
      run();
    }

    schedule();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs]);
}
