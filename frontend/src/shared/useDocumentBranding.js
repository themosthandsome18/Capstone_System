import { useEffect } from "react";

export const DEFAULT_TITLE = "Mauban LGU | Tourism & Sanitary Compliance Portal";
export const DEFAULT_FAVICON = `${process.env.PUBLIC_URL || ""}/favicon.png`;

export const MODULE_CONFIG = {
  tourism: {
    suffix: "| Mauban Tourism",
    defaultTitle: "Mauban Tourism & Travel Pass",
    favicon: `${process.env.PUBLIC_URL || ""}/favicon_tourism.png`,
  },
  sanitation: {
    suffix: "| Mauban Sanitation",
    defaultTitle: "Mauban Sanitation & Health Portal",
    favicon: `${process.env.PUBLIC_URL || ""}/favicon_sanitation.png`,
  },
};

/**
 * Dynamically updates the browser favicon by mutating all rel="icon" links in <head>.
 *
 * @param {string} iconUrl - The relative or absolute URL to the icon image.
 */
export function updateFavicon(iconUrl) {
  if (typeof document === "undefined") return;

  const iconLinks = document.querySelectorAll("link[rel*='icon']");
  if (iconLinks && iconLinks.length > 0) {
    iconLinks.forEach((link) => {
      link.href = iconUrl;
      if (iconUrl.endsWith(".png")) {
        link.type = "image/png";
      }
    });
  } else {
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = iconUrl.endsWith(".png") ? "image/png" : "image/x-icon";
    link.href = iconUrl;
    document.head.appendChild(link);
  }
}

/**
 * Custom React hook for dynamic, module-aware browser tab title and favicon branding.
 *
 * Sets document.title based on the active module and page title, and updates the favicon.
 * On unmount (e.g. logging out or leaving module shells), safely restores the default
 * unified LGU portal branding.
 *
 * @param {Object} options
 * @param {"tourism" | "sanitation"} options.module - The active LGU module.
 * @param {string} [options.pageTitle] - The specific page name (e.g., "Dashboard Overview").
 */
export function useDocumentBranding({ module, pageTitle } = {}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const config = MODULE_CONFIG[module];

    if (!config) {
      document.title = pageTitle
        ? `${pageTitle} | ${DEFAULT_TITLE}`
        : DEFAULT_TITLE;
      updateFavicon(DEFAULT_FAVICON);
      return;
    }

    const title = pageTitle
      ? `${pageTitle} ${config.suffix}`
      : config.defaultTitle;

    document.title = title;
    updateFavicon(config.favicon);

    return () => {
      document.title = DEFAULT_TITLE;
      updateFavicon(DEFAULT_FAVICON);
    };
  }, [module, pageTitle]);
}

export default useDocumentBranding;
