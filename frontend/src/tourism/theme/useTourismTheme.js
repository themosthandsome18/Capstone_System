import { useLayoutEffect, useMemo, useState } from "react";
import { readChartPalette } from "./chartPalette";
import { deriveTourismTheme } from "./deriveTourismTheme";

/**
 * Applies the admin-chosen tourism theme to the tourism shell element.
 *
 * Returns { shellRef, chartPalette }. shellRef is a callback ref for the
 * shell's root element. The derived --th-* properties are set as inline styles
 * on THAT element only, never on :root or document.documentElement:
 * Tourism_index.css also reaches Sanitation pages, so the theme must stay
 * scoped to the tourism shell (THEME_TOKENS.md §1).
 *
 * useLayoutEffect applies the colours before the browser paints, so the shell
 * never shows the default green first. Properties are removed on unmount.
 *
 * chartPalette is read back from the shell with getComputedStyle in the same
 * effect, straight after the properties are set, so it always matches them.
 * It is null until that first read; the state update inside the layout effect
 * re-renders before paint, so the null pass is never seen. Charts get it
 * through TourismChartPaletteContext and redraw whenever the theme changes.
 *
 * @param {{ primary_color?: string } | null | undefined} theme - the "theme"
 *   object from the /bootstrap/ payload. Missing or malformed values fall
 *   back to the original green.
 */
export function useTourismTheme(theme) {
  const [element, setElement] = useState(null);
  const [chartPalette, setChartPalette] = useState(null);
  const primaryColor = theme && typeof theme === "object" ? theme.primary_color : undefined;
  const vars = useMemo(() => deriveTourismTheme(primaryColor), [primaryColor]);

  useLayoutEffect(() => {
    if (!element) return undefined;

    Object.entries(vars).forEach(([name, value]) => {
      element.style.setProperty(name, value);
    });
    setChartPalette(readChartPalette(element));

    return () => {
      Object.keys(vars).forEach((name) => {
        element.style.removeProperty(name);
      });
    };
  }, [element, vars]);

  return { shellRef: setElement, chartPalette };
}

export default useTourismTheme;
