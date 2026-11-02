import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import EstablishmentHistoryReport from "./EstablishmentHistoryReport";
import * as api from "../services/sanitationApi";
import fixture from "./establishmentReport.fixture.json";
jest.mock("../services/sanitationApi");
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const select=(id)=>fireEvent.change(screen.getByLabelText("Select establishment"),{target:{value:id}});
const printButton=()=>screen.getByRole("button",{name:"Print selected establishment"});
const loaded=()=>waitFor(()=>expect(screen.getByRole("button",{name:"Reload report data"})).toBeEnabled());
beforeEach(()=>{
 jest.resetAllMocks();
 api.fetchSanitationEstablishments.mockResolvedValue(fixture.establishments);
 api.fetchSanitationInspections.mockResolvedValue(fixture.inspections);
 api.fetchSanitationRenewals.mockResolvedValue(fixture.renewals);
 window.print=jest.fn();
});
test("recorded identification, inspection chronology, findings and renewals are factual and selected by ID",async()=>{
 render(<EstablishmentHistoryReport/>); await loaded(); expect(printButton()).toBeDisabled(); select("1");
 const body=document.querySelector(".ehr-body");
 expect(body).toHaveTextContent("Recorded permit expiry date2026-12-31");
 expect(body).not.toHaveTextContent("2099-12-31");
 expect([...body.querySelectorAll(".ehr-inspection h4")].map(e=>e.textContent)).toEqual([
  "Inspection ID 10 — 2026-01-01","Inspection ID 11 — 2026-01-01","Inspection ID 12 — 2026-02-01","Inspection ID 13 — Not recorded",
 ]);
 expect(body).toHaveTextContent("Recorded deficiency A"); expect(body).toHaveTextContent("Recorded follow-up note A");
 expect(body).toHaveTextContent("legacy_unknown_result"); expect(body).toHaveTextContent("Recorded not complied");
 expect(body).toHaveTextContent("1 draft record(s); 1 record(s) with no recorded finalization state");
 expect(body).not.toHaveTextContent(/OTHER ESTABLISHMENT FINDING|OTHER-RNW|DRAFT NOT FINAL|FINALIZATION UNKNOWN/);
 expect(body).not.toHaveTextContent(/Excellent|Delinquent|Fully Compliant|Passed|MHO Team|Payment|500\.00/);
 expect(body.querySelector("script, img")).toBeNull();
 expect(body).toHaveTextContent('Literal <img src=x onerror="window.__unsafe=2">');
 const unknown=within(screen.getByRole("article",{name:"Inspection 11"}));
 expect(unknown.getByText("Inspector (recorded name)").nextElementSibling).toHaveTextContent("Not recorded");
 expect(api.fetchSanitationRenewals).toHaveBeenCalledWith();
 select("2"); expect(document.querySelector(".ehr-body")).toHaveTextContent("OTHER ESTABLISHMENT FINDING");
 expect(document.querySelector(".ehr-body")).not.toHaveTextContent("Recorded deficiency A");
});
test("unknown findings differ from explicit negative checklist results",async()=>{
 render(<EstablishmentHistoryReport/>);await loaded();select("1");
 const inspection=screen.getByRole("article",{name:"Inspection 12"});
 const unknown=within(inspection).getByText("Unknown checklist finding").closest("tr");
 expect(within(unknown).getAllByText("Not recorded")).toHaveLength(2);
 expect(within(inspection).getByText("Recorded requirement A").closest("tr")).toHaveTextContent("Recorded not complied");
});
test("pending requests block printing and cannot appear as successful empty results",async()=>{
 const pending=deferred();api.fetchSanitationInspections.mockReturnValueOnce(pending.promise);
 render(<EstablishmentHistoryReport/>);
 expect(screen.getByRole("status")).toHaveTextContent("Loading report records");expect(printButton()).toBeDisabled();
 expect(screen.queryByText(/No finalized inspection records/)).toBeNull();
 fireEvent.click(printButton());expect(window.print).not.toHaveBeenCalled();
 await act(async()=>{pending.resolve(fixture.inspections);});await loaded();select("1");expect(printButton()).toBeEnabled();
});
test("a failed local fetch blocks all history, retry preserves the latest selection during loading",async()=>{
 render(<EstablishmentHistoryReport/>);await loaded();select("1");
 api.fetchSanitationRenewals.mockRejectedValueOnce(new Error("Synthetic renewal outage"));
 fireEvent.click(screen.getByRole("button",{name:"Reload report data"}));
 await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Synthetic renewal outage"));
 expect(printButton()).toBeDisabled();expect(document.querySelector(".ehr-body")).toBeNull();
 const pending=deferred();api.fetchSanitationInspections.mockReturnValueOnce(pending.promise);
 fireEvent.click(screen.getByRole("button",{name:"Retry report data"}));select("2");select("1");select("2");
 expect(printButton()).toBeDisabled();
 await act(async()=>{pending.resolve(fixture.inspections);});await loaded();
 expect(screen.getByLabelText("Select establishment")).toHaveValue("2");
 expect(document.querySelector(".ehr-body")).toHaveTextContent("OTHER ESTABLISHMENT FINDING");
 expect(document.querySelector(".ehr-body")).not.toHaveTextContent("Recorded deficiency A");
});
test("successful empty catalogue and successful empty selected history are distinct",async()=>{
 api.fetchSanitationEstablishments.mockResolvedValueOnce([]);
 const view=render(<EstablishmentHistoryReport/>);await loaded();
 expect(screen.getByRole("status")).toHaveTextContent("No establishment records were returned");expect(printButton()).toBeDisabled();
 view.unmount();render(<EstablishmentHistoryReport/>);await loaded();select("3");
 expect(screen.getByText("No finalized inspection records were returned for this establishment.")).toBeInTheDocument();
 expect(screen.getByText("No renewal records were returned for this establishment.")).toBeInTheDocument();expect(printButton()).toBeEnabled();
});
test("an older response after unmount cannot leak into a new selected report",async()=>{
 const old=deferred();api.fetchSanitationInspections.mockReturnValueOnce(old.promise);
 const first=render(<EstablishmentHistoryReport/>);first.unmount();
 render(<EstablishmentHistoryReport/>);await loaded();select("2");
 await act(async()=>{old.resolve(fixture.inspections.filter(r=>r.establishment===1));});
 expect(document.querySelector(".ehr-body")).toHaveTextContent("OTHER ESTABLISHMENT FINDING");
});
test("pagination is an explicit failure instead of silently printing a first page",async()=>{
 api.fetchSanitationRenewals.mockResolvedValueOnce({rows:fixture.renewals.rows,next:"/page2"});
 render(<EstablishmentHistoryReport/>);await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent(/paginated/));
 expect(printButton()).toBeDisabled();expect(document.querySelector(".ehr-body")).toBeNull();
});
test("print snapshot includes only the selected ID, is text-safe and is removed after printing",async()=>{
 render(<><div data-testid="aggregate">UNRELATED MUNICIPAL DASHBOARD</div><EstablishmentHistoryReport/></>);await loaded();select("1");
 fireEvent.click(printButton());expect(window.print).toHaveBeenCalledTimes(1);
 const print=document.querySelector("body > .establishment-history-print");
 expect(print).toHaveTextContent("Establishment ID 1");expect(print).toHaveTextContent("not a complete immutable compliance audit");
 expect(print).not.toHaveTextContent(/UNRELATED MUNICIPAL DASHBOARD|OTHER ESTABLISHMENT FINDING|OTHER-RNW/);
 expect(print.querySelector("script, img")).toBeNull();
 fireEvent(window,new Event("afterprint"));expect(document.querySelector(".establishment-history-print")).toBeNull();
});
test("print failure cleans up the snapshot; a deleted selection never falls back to another business",async()=>{
 render(<EstablishmentHistoryReport/>);await loaded();select("1");window.print.mockImplementation(()=>{throw new Error("synthetic print failure");});
 fireEvent.click(printButton());expect(screen.getByRole("alert")).toHaveTextContent("could not be printed");
 expect(document.querySelector(".establishment-history-print")).toBeNull();
 api.fetchSanitationEstablishments.mockResolvedValueOnce(fixture.establishments.filter(r=>r.id!==1));
 fireEvent.click(screen.getByRole("button",{name:"Reload report data"}));await loaded();
 expect(screen.getByLabelText("Select establishment")).toHaveValue("1");
 expect(screen.getByRole("status")).toHaveTextContent("selected establishment is not in the loaded records");expect(printButton()).toBeDisabled();
});
