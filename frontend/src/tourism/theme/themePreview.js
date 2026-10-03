import { createContext, useContext, useMemo, useState } from "react";
import useTourismTheme from "./useTourismTheme";

// A colour being tried on the Settings page, applied to the whole shell before
// it is saved. It lives only in the shell's React state: it is never written to
// the server or to storage, so a reload, a logout or leaving the shell drops it.
// The Settings page clears it when it unmounts, so navigating away without
// saving returns the shell to the saved colour.
export const TourismThemePreviewContext = createContext({
  previewColor: null,
  setPreviewColor: () => {},
});

export function useTourismThemePreview() {
  return useContext(TourismThemePreviewContext);
}

/**
 * The shell's theme wiring: the saved theme, overridden by a preview colour
 * while one is set. Returns what AppShell puts on the shell element and
 * provides to its pages.
 */
export function useTourismShellTheme(theme) {
  const [previewColor, setPreviewColor] = useState(null);
  const appliedTheme = useMemo(
    () => (previewColor ? { ...(theme && typeof theme === "object" ? theme : {}), primary_color: previewColor } : theme),
    [theme, previewColor]
  );
  const { shellRef, chartPalette } = useTourismTheme(appliedTheme);
  const preview = useMemo(() => ({ previewColor, setPreviewColor }), [previewColor]);
  return { shellRef, chartPalette, preview };
}
