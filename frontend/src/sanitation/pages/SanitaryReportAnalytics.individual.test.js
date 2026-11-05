import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SanitaryReportAnalytics from "./SanitaryReportAnalytics";
import * as api from "../services/sanitationApi";
import fixture from "./establishmentReport.fixture.json";
jest.mock("../services/sanitationApi");
jest.mock("../context/SanitationDataContext",()=>({useSanitationData:()=>({
 establishments:[],businessTypes:[],barangays:[],loading:false,error:"",
 reportData:{summary:{totalEstablishments:3},byType:[],questionAnswers:[]},
 // A previously filtered shared cache must not define this report's history.
 inspections:[],renewalData:{rows:[]},
})}));
jest.mock("react-chartjs-2",()=>({Bar:()=>null,Doughnut:()=>null}));
beforeEach(()=>{
 api.fetchSanitationEstablishments.mockResolvedValue(fixture.establishments);
 api.fetchSanitationInspections.mockResolvedValue(fixture.inspections);
 api.fetchSanitationRenewals.mockResolvedValue(fixture.renewals);
 window.print=jest.fn();
});
test("business analytics mounts the factual local report and removes the unsupported standing panel",async()=>{
 render(<SanitaryReportAnalytics/>);
 await waitFor(()=>expect(screen.getByRole("button",{name:"Reload report data"})).toBeEnabled());
 expect(document.querySelector(".specific-establishment-audit-card")).toBeNull();
 expect(screen.queryByText("Compliance Standing Score")).toBeNull();
 fireEvent.change(screen.getByLabelText("Select establishment"),{target:{value:"1"}});
 expect(document.querySelector(".establishment-history-report")).toHaveTextContent("Recorded deficiency A");
 expect(document.querySelector(".establishment-history-report")).toHaveTextContent("Current renewal records (3)");
 fireEvent.click(screen.getByRole("button",{name:"Print selected establishment"}));
 const print=document.querySelector("body > .establishment-history-print");
 expect(print).toHaveTextContent("Establishment ID 1");
 expect(print).not.toHaveTextContent(/Administrative & Community Insights|OTHER ESTABLISHMENT FINDING|OTHER-RNW|EXCELLENT|DELINQUENT|Fully Compliant|MHO Team/);
 fireEvent(window,new Event("afterprint"));
});
