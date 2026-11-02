import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import HouseholdReportAnalytics from "./HouseholdReportAnalytics";
import records from "./householdReport.fixture.json";
let mockRecords;
let mockReadiness;
const municipal = { questionAnswers: [{ id: "household_compliance_rate", answer: "Good Standing: 1, Total: 4, Rate: 25" }, { id: "barangay_risk", answer: "OUTSIDE MUNICIPAL ESTABLISHMENT", chart_data: [{ name: "Other town", total: 999 }] }] };
jest.mock("../context/SanitationDataContext", () => ({ useSanitationData: () => ({ householdRecords: mockRecords, barangays: [{name:"Bagong Bayan"},{name:"Abo-abo"},{name:"Empty Barangay"}], loading:false, reportData:municipal, ...mockReadiness }) }));
jest.mock("react-chartjs-2", () => ({ Bar: ({data}) => <pre data-testid="chart">{JSON.stringify(data)}</pre>, Doughnut: ({data}) => <pre data-testid="chart">{JSON.stringify(data)}</pre> }));
const choose=(value)=>fireEvent.change(screen.getByLabelText(/Filter by Barangay/),{target:{value}});
const kpis=()=>[...document.querySelectorAll(".household-report-stat-card h2")].map((e)=>e.textContent);
beforeEach(()=>{mockRecords=records; mockReadiness={householdReady:true,householdStatus:"success",householdError:"",reloadHouseholds:jest.fn()};});
test("municipal and selected KPI, water, waste, toilet, roster and insight totals share coverage",()=>{
 render(<HouseholdReportAnalytics />); expect(kpis()).toEqual(["4","1","1","2"]);
 expect(screen.getByText("OUTSIDE MUNICIPAL ESTABLISHMENT")).toBeInTheDocument(); choose("Bagong Bayan");
 expect(kpis()).toEqual(["3","1","1","1"]); expect(screen.getByText("Synthetic Ana")).toBeInTheDocument();
 expect(screen.queryByText("Synthetic Other Barangay")).toBeNull(); expect(screen.queryByText("OUTSIDE MUNICIPAL ESTABLISHMENT")).toBeNull();
 expect(screen.getByText("33.3%")).toBeInTheDocument(); expect(screen.getByText(/Bagong Bayan: 2 of 3 households have a recorded toilet/)).toBeInTheDocument();
 const charts=screen.getAllByTestId("chart").map((e)=>JSON.parse(e.textContent));
 expect(charts[0].datasets[0].data).toEqual([1,1,1]); expect(charts[1].datasets[0].data).toEqual([1,1,1,0]);
 expect(JSON.stringify(charts)).not.toMatch(/Abo-abo|Other town|999/);
 expect(charts.slice(2).map((c)=>c.datasets[0].data)).toEqual([[2],[2],[1],[1,1,1,0],[1,1,1]]);
 choose("all"); expect(kpis()).toEqual(["4","1","1","2"]); expect(screen.getByText("OUTSIDE MUNICIPAL ESTABLISHMENT")).toBeInTheDocument();
});
test("table drilldown and switching barangays recompute priorities",()=>{
 render(<HouseholdReportAnalytics />); fireEvent.click(screen.getByRole("button",{name:/Abo-abo/})); expect(kpis()).toEqual(["1","0","0","1"]);
 expect(screen.getByText("Synthetic Other Barangay", {selector:"strong"})).toBeInTheDocument(); expect(screen.queryByText("Synthetic Ana")).toBeNull();
 choose("Bagong Bayan"); expect(document.querySelector(".household-insights-grid").textContent).not.toContain("Synthetic Other Barangay");
});
test("empty barangay has no charts, ranking or fabricated percentage",()=>{
 render(<HouseholdReportAnalytics />); choose("Empty Barangay"); expect(kpis()).toEqual(["0","0","0","0"]);
 expect(screen.getByRole("status")).toHaveTextContent("compliance cannot be assessed"); expect(screen.queryAllByTestId("chart")).toHaveLength(0);
 expect(screen.queryByText(/100%|0%/)).toBeNull(); expect(screen.getByText(/No household records found in Brgy/)).toBeInTheDocument();
});
test("unknown toilet/status never becomes a recorded facility or good standing",()=>{
 mockRecords=[{id:8,barangay:"Bagong Bayan",household_head:"Unknown fields"}]; render(<HouseholdReportAnalytics />);
 expect(screen.getAllByText("0 (0%)")).toHaveLength(3); choose("Bagong Bayan"); expect(screen.getByText("Not recorded")).toBeInTheDocument(); expect(kpis()).toEqual(["1","0","0","0"]);
});
test("selected CSV and print retain exact coverage",async()=>{
 let blob; URL.createObjectURL=jest.fn((b)=>{blob=b;return "blob:test";}); URL.revokeObjectURL=jest.fn();
 const click=jest.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{}); window.print=jest.fn();
 render(<HouseholdReportAnalytics />); choose("Bagong Bayan"); fireEvent.click(screen.getByRole("button",{name:"Export CSV"}));
 const csv=await new Promise((resolve)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsText(blob);});
 expect(csv.split("\n")).toHaveLength(4); expect(csv).toContain("BB-3"); expect(csv).not.toMatch(/AB-1|Abo-abo/);
 fireEvent.click(screen.getByRole("button",{name:/Print Brgy/})); expect(window.print).toHaveBeenCalledTimes(1);
 expect(document.querySelector(".print-header-meta")).toHaveTextContent("Barangay Bagong Bayan"); click.mockRestore();
});
test("refresh removing last record retains selected coverage and never falls back to other barangays",()=>{
 const view=render(<HouseholdReportAnalytics />); choose("Bagong Bayan"); mockRecords=records.filter((r)=>r.barangay!=="Bagong Bayan"); view.rerender(<HouseholdReportAnalytics />);
 expect(screen.getByLabelText(/Filter by Barangay/)).toHaveValue("Bagong Bayan"); expect(kpis()).toEqual(["0","0","0","0"]); expect(screen.queryByText("Synthetic Other Barangay")).toBeNull();
});

test("empty municipal report suppresses stale completed answers",()=>{
 mockRecords=[]; render(<HouseholdReportAnalytics />);
 expect(screen.queryByText("25%")).toBeNull(); expect(screen.queryByText("OUTSIDE MUNICIPAL ESTABLISHMENT")).toBeNull();
 expect(screen.getByRole("status")).toHaveTextContent("compliance cannot be assessed");
});

test.each(["idle", "loading", "error", "success"])("%s without readiness cannot render retained data or allow exports", (status) => {
 mockReadiness={householdReady:false,householdStatus:status,householdError:"Synthetic household failure",reloadHouseholds:jest.fn()};
 render(<HouseholdReportAnalytics />);
 expect(document.querySelector(".household-report-stat-card")).toBeNull();
 expect(screen.queryAllByTestId("chart")).toHaveLength(0);
 expect(screen.queryByText(/No household records available/)).toBeNull();
 expect(screen.getByRole("button",{name:"Print Report"})).toBeDisabled();
 expect(screen.getByRole("button",{name:"Export CSV"})).toBeDisabled();
 if(status==="error") expect(screen.getByRole("alert")).toHaveTextContent("Synthetic household failure");
});
test.each([undefined, "true", 1])("readiness must be boolean true, received %s", (ready) => {
 mockReadiness={...mockReadiness,householdReady:ready}; render(<HouseholdReportAnalytics />);
 expect(document.querySelector(".household-report-stat-card")).toBeNull();
 expect(screen.getByRole("button",{name:"Export CSV"})).toBeDisabled();
});
