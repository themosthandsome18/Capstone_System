jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
import { printFieldworkActionSlip } from "./ComplaintsManagement";

const sample = `R&D <em>sample</em> "quoted" 'text'\nSecond line`;
const escaped = `R&amp;D &lt;em&gt;sample&lt;/em&gt; &quot;quoted&quot; &#39;text&#39;\nSecond line`;
let popup;
beforeEach(() => {
  popup = { document: { write: jest.fn(), close: jest.fn() }, focus: jest.fn() };
  jest.spyOn(window, "open").mockReturnValue(popup);
});
afterEach(() => jest.restoreAllMocks());

test.each([
  ["complaint_id", "title, .title-strip span", 2],
  ["barangay", ".box strong", 1],
  ["location_address", ".box small", 1],
  ["category", ".box strong", 1],
  ["assigned_inspector", ".box strong, .sig-line strong", 2],
  ["inspection_scheduled_date", ".box strong", 1],
  ["inspection_scheduled_time", ".box strong", 1],
  ["complainant_name", ".box strong", 1],
  ["contact_number", ".box strong", 1],
  ["description", ".section p", 1],
  ["action_taken", ".section p", 1],
  ["inspection_schedule_note", ".section p", 1],
])("renders %s as literal text", (field, selector, count) => {
  printFieldworkActionSlip({ complaint_id: "SYN-1", [field]: sample });
  const html = popup.document.write.mock.calls[0][0];
  expect(html).toContain(escaped);
  expect(html).not.toContain(sample);
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.querySelectorAll("em")).toHaveLength(0);
  expect([...doc.querySelectorAll(selector)].filter(el => el.textContent.includes(sample))).toHaveLength(count);
});

test.each([["high", "URGENT"], ["medium", "STANDARD"], [sample, "ROUTINE"]])(
  "uses fixed priority text for %s", (priority, label) => {
    printFieldworkActionSlip({ priority });
    const html = popup.document.write.mock.calls[0][0];
    expect(html).toContain(label);
    expect(html).not.toContain(sample);
  }
);

test("escapes the formatted timestamp too", () => {
  jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({ format: () => sample }));
  printFieldworkActionSlip({});
  expect(popup.document.write.mock.calls[0][0]).toContain(`Document Generated: ${escaped}`);
});

test("preserves normal layout, text, note precedence and popup lifecycle", () => {
  printFieldworkActionSlip({ complaint_id: "SYN-1", description: "Line one\nLine two", action_taken: "Reviewed", inspection_schedule_note: "Fallback" });
  const html = popup.document.write.mock.calls[0][0];
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.title).toBe("Fieldwork Inspection Order - SYN-1");
  expect(doc.querySelectorAll(".box")).toHaveLength(6);
  expect(doc.querySelectorAll(".sig-line")).toHaveLength(2);
  expect(doc.body.textContent).toContain("Line one\nLine two");
  expect(doc.body.textContent).toContain("Reviewed");
  expect(doc.body.textContent).not.toContain("Fallback");
  expect(html).toContain("white-space: pre-wrap");
  expect(html).toContain("@media print");
  expect(window.open).toHaveBeenCalledWith("", "_blank", "width=750,height=850");
  expect(popup.document.close).toHaveBeenCalledTimes(1);
  expect(popup.focus).toHaveBeenCalledTimes(1);
});

test("handles absent report and blocked popup", () => {
  printFieldworkActionSlip(null);
  expect(window.open).not.toHaveBeenCalled();
  window.open.mockReturnValue(null);
  expect(() => printFieldworkActionSlip({})).not.toThrow();
});
