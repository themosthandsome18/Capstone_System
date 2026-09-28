import { useLayoutEffect, useMemo, useState } from "react";
import { deriveTourismTheme } from "./deriveTourismTheme";

/**
 * Applies the admin-chosen tourism theme to the tourism shell element.
 *
 * Returns a callback ref for the shell's root element. The derived --th-*
 * properties are set as inline styles on THAT element only, never on :root or
 * document.documentElement: Tourism_index.css also reaches Sanitation pages,
 * so the theme must stay scoped to the tourism shell (THEME_TOKENS.md §1).
 *
 * useLayoutEffect applies the colours before the browser paints, so the shell
 * never shows the default green first. Properties are removed on unmount.
 *
 * @param {{ primary_color?: string } | null | undefined} theme - the "theme"
 *   object from the /bootstrap/ payload. Missing or malformed values fall
 *   back to the original green.
 */
export function useTourismTheme(theme) {
  const [element, setElement] = useState(null);
  const primaryColor = theme && typeof theme === "object" ? theme.primary_color : undefined;
  const vars = useMemo(() => deriveTourismTheme(primaryColor), [primaryColor]);

  useLayoutEffect(() => {
    if (!element) return undefined;

    Object.entries(vars).forEach(([name, value]) => {
      element.style.setProperty(name, value);
    });

    return () => {
      Object.keys(vars).forEach((name) => {
        element.style.removeProperty(name);
      });
    };
  }, [element, vars]);

  return setElement;
}

export default useTourismTheme;
