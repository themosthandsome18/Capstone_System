import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  DEFAULT_MOBILE_CONTENT_TAB,
  MOBILE_CONTENT_TABS,
  canManageMobileContent,
  knownTab,
} from "../mobileContentAccess";
import { EmergencyHotlinesPanel } from "./EmergencyHotlines";
import MobileContentBlockEditor from "./MobileContentBlockEditor";
import { PillarsView, usePillars } from "./MobileContentPillars";
import { BUILT_IN_BLOCKS } from "../utils/mobileContentBuiltIn";

export const NOT_READY_NOTICE =
  "Not available yet. The editor for this tab is coming in an upcoming update. The mobile app still shows its built-in text.";

// The Why Visit tab reads the pillars ONCE; the editor draws them in its preview, and the list under the editor shows them.
function WhyVisitTab() {
  const pillars = usePillars();
  return (
    <MobileContentBlockEditor
      blockKey="why_visit"
      heading="Why Visit Mauban, Quezon?"
      eyebrow="Pambungad"
      labels={{ body: "Paragraph" }}
      builtIn={BUILT_IN_BLOCKS.why_visit}
      intro="The title, the subtitle and the paragraph of the Why Visit page of the mobile app."
      hints={{ body: "Enter starts a new line. A blank line between two lines makes a new paragraph." }}
      pillars={pillars}
      below={<PillarsView state={pillars} />}
    />
  );
}

function TabPanel({ tab }) {
  if (tab.key === "hotlines") return <EmergencyHotlinesPanel />;
  if (tab.key === "welcome") {
    return (
      <MobileContentBlockEditor
        blockKey="welcome"
        heading="Welcome banner"
        eyebrow="Pambungad"
        builtIn={BUILT_IN_BLOCKS.welcome}
        banner
        intro="The greeting at the top of the Home page of the mobile app."
        labels={{ title: "Greeting", subtitle: "Paragraph" }}
        hints={{
          title: "Ang {name} ay papalitan ng app ng pangalan ng bisita. Kung aalisin ninyo ito, pare-pareho ang makikita ng lahat.",
        }}
      />
    );
  }
  if (tab.key === "why-visit") return <WhyVisitTab />;
  // A tab whose editor does not exist yet: a message, and no request to the server.
  return (
    <div className="hotlines-notices" role="note" aria-label={`${tab.label}: not available yet`}>
      <p>{NOT_READY_NOTICE}</p>
    </div>
  );
}

export default function MobileAppContent() {
  const { role } = useAuth();
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab = knownTab(asked) || DEFAULT_MOBILE_CONTENT_TAB;
  // The tabs that have been opened. A tab is mounted the first time it is opened and then stays mounted (hidden when
  // another is shown), so coming back to it shows what it showed: no second request, and what was typed is still there.
  const [opened, setOpened] = useState(() => new Set([tab]));
  const allowed = canManageMobileContent(role);

  // An address that names a tab that does not exist is put right (in place: Back does not return to it).
  useEffect(() => {
    if (allowed && asked !== null && !knownTab(asked)) {
      setParams({ tab: DEFAULT_MOBILE_CONTENT_TAB }, { replace: true });
    }
  }, [allowed, asked, setParams]);

  useEffect(() => {
    setOpened((current) => (current.has(tab) ? current : new Set([...current, tab])));
  }, [tab]);

  // The page itself refuses anyone but the admin (the route and the sidebar do too): a person who is sent here
  // by a stale link is sent away. Asked AFTER the hooks, which may not be skipped.
  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="reports-page settings-page options-page mobile-content-page">
      <div className="reports-header">
        <div>
          <p className="mobile-content-eyebrow">Mauban Tourism App</p>
          <h1>Mobile App Content</h1>
          <p className="mobile-content-lead">
            Everything a visitor reads inside the app. Change it here, and it reaches the app in its next version.
          </p>
        </div>
      </div>

      <div className="report-tabs mobile-content-tabs" role="tablist" aria-label="Mobile app content">
        {MOBILE_CONTENT_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`mobile-content-tab-${item.key}`}
            aria-selected={item.key === tab}
            aria-controls={`mobile-content-panel-${item.key}`}
            className={item.key === tab ? "active" : ""}
            // in place, not a new entry of the history: Back leaves the page instead of walking through the tabs
            onClick={() => setParams({ tab: item.key }, { replace: true })}
          >
            {item.label}
            {item.ready ? null : <span className="mobile-content-soon">Coming soon</span>}
          </button>
        ))}
      </div>

      {MOBILE_CONTENT_TABS.map((item) =>
        opened.has(item.key) || item.key === tab ? (
          <div
            key={item.key}
            role="tabpanel"
            id={`mobile-content-panel-${item.key}`}
            aria-labelledby={`mobile-content-tab-${item.key}`}
            hidden={item.key !== tab}
          >
            <TabPanel tab={item} />
          </div>
        ) : null
      )}
    </div>
  );
}
