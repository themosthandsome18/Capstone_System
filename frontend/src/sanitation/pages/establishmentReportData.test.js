import { buildEstablishmentReport, recordedDate, recordedTimestamp, validateReportResponses } from "./establishmentReportData";
import fixture from "./establishmentReport.fixture.json";
const data = () => validateReportResponses(fixture.establishments, fixture.inspections, fixture.renewals);
test("ID filtering separates duplicate business names and sorts dates with deterministic ID ties", () => {
  const before = JSON.stringify(fixture);
  const report = buildEstablishmentReport(data(), "1");
  expect(report.inspections.map((row) => row.id)).toEqual([10,11,12,13]);
  expect(report.renewals.map((row) => row.id)).toEqual([90,91,92]);
  expect(report.drafts).toBe(1); expect(report.unknownFinalization).toBe(1);
  expect(buildEstablishmentReport(data(), "2").inspections.map((r)=>r.id)).toEqual([22]);
  expect(buildEstablishmentReport(data(), "999")).toBeNull();
  expect(buildEstablishmentReport(data(), "")).toBeNull();
  expect(JSON.stringify(fixture)).toBe(before);
});
test("dates are literal and missing/invalid dates never use expiry or modification fallbacks", () => {
  expect(recordedDate("2026-01-01")).toBe("2026-01-01");
  expect(recordedDate(null)).toBe("Not recorded");
  expect(recordedDate("2026-02-30")).toMatch(/Unrecognized/);
  expect(recordedTimestamp("2026-01-01T03:00:00+08:00")).toBe("2026-01-01T03:00:00+08:00");
  expect(recordedTimestamp(undefined)).toBe("Not recorded");
  expect(recordedTimestamp("2026-02-30T03:00:00Z")).toMatch(/Unrecognized/);
});
test("all returned related records are retained without a frontend row limit", () => {
  const rows=Array.from({length:79},(_,index)=>({id:1000+index,establishment:1,is_draft:false,inspection_date:"2026-01-01"}));
  expect(buildEstablishmentReport({...data(),inspections:rows},"1").inspections).toHaveLength(79);
});
test.each([
 [{results:fixture.establishments,next:"/page2"},fixture.inspections,fixture.renewals],
 [fixture.establishments,{results:fixture.inspections,next:null},fixture.renewals],
 [fixture.establishments,fixture.inspections,{rows:fixture.renewals.rows,next:"/page2"}],
 [fixture.establishments,fixture.inspections,null],
 [fixture.establishments,fixture.inspections,"unsupported"],
 [fixture.establishments,[{id:1,establishment:null}],fixture.renewals],
 [fixture.establishments,[{id:1,establishment:1,checklist_items:{}}],fixture.renewals],
 [[fixture.establishments[0],fixture.establishments[0]],fixture.inspections,fixture.renewals],
])("incomplete or paginated response %#: rejected rather than printed as complete", (est,ins,ren)=>{
 expect(()=>validateReportResponses(est,ins,ren)).toThrow();
});
