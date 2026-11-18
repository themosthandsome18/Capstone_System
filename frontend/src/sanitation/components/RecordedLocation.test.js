import React from "react";
import { render, screen } from "@testing-library/react";
import RecordedLocation from "./RecordedLocation";
test("recorded metadata remains a labelled device claim including zero accuracy", () => {
  render(<RecordedLocation record={{ location_source: "device_reported", location_accuracy_m: 0,
    location_captured_at: "2026-11-13T00:00:00Z", location_reported_mock: true }} />);
  expect(screen.getByLabelText("Recorded location details").textContent).toContain("not physically verified");
  expect(screen.getByText("Reported accuracy: 0 m")).toBeTruthy();
  expect(screen.getByText(/Device reported a mocked/)).toBeTruthy();
});
test("missing recorded metadata is unknown and no editable controls exist", () => {
  render(<RecordedLocation record={{}} />);
  expect(screen.getByText("Saved location source: Unknown")).toBeTruthy();
  expect(screen.getByText("Reported capture time: Unknown")).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
});
