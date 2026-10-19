/* Reporting metadata only: no storage, requests, submission or worker behavior. */
(function () {
  var script = document.currentScript;
  var base = (script.getAttribute("data-public-url") || "").replace(/\/$/, "");
  var defaults = {
    title: document.title,
    description: document.querySelector('meta[name="description"]').content,
    theme: document.querySelector('meta[name="theme-color"]').content
  };
  var initialized = false;
  var wasReporting = false;

  function link(rel, href) {
    var element = document.querySelector('link[rel="' + rel + '"]');
    if (!element) {
      element = document.createElement("link");
      element.rel = rel;
      document.head.appendChild(element);
    }
    element.setAttribute("href", base + href);
  }

  function apply(pathname) {
    var reporting = pathname === "/report-sanitation" || pathname === "/report-sanitation/";
    // Other module shells own their titles/favicons. Do not reset those during
    // navigation between non-reporting routes (including trailing-slash changes).
    if (!reporting && initialized && !wasReporting) return;
    initialized = true;
    wasReporting = reporting;
    link("manifest", reporting ? "/report-sanitation.webmanifest" : "/manifest.json");
    link("apple-touch-icon", reporting ? "/report-sanitation/icon-192.png" : "/logo192.png");
    document.title = reporting ? "Mauban Sanitation Reporting" : defaults.title;
    document.querySelector('meta[name="description"]').content = reporting
      ? "Submit a sanitation concern to the Mauban Sanitary Section. No account or installation required. Internet connection required."
      : defaults.description;
    document.querySelector('meta[name="theme-color"]').content = reporting ? "#07613B" : defaults.theme;
    var appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (reporting) {
      if (!appleTitle) {
        appleTitle = document.createElement("meta");
        appleTitle.name = "apple-mobile-web-app-title";
        document.head.appendChild(appleTitle);
      }
      appleTitle.content = "Report Sanitation";
    } else if (appleTitle) {
      appleTitle.remove();
    }
  }

  window.capstoneReportingMetadata = { apply: apply };
  apply(window.location.pathname);
})();
