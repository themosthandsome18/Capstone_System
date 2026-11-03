/**
 * Activity Logs pages its table in the browser (the tourism page). The cards Created, Updated and Deleted count every log that matches the
 * filter, not the page; Sanitation, which shares the page, is not paged and shows every row as it did.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityLogsPage from "./ActivityLogsPage";
import { apiRequest } from "../apiClient";

jest.mock("../apiClient", () => ({
  ...jest.requireActual("../apiClient"),
  apiRequest: jest.fn(),
}));

// n logs: the first `create` are created, the next `update` updated, the rest deleted
function makeLogs(create, update, remove) {
  const actions = [
    ...Array(create).fill("create"),
    ...Array(update).fill("update"),
    ...Array(remove).fill("delete"),
  ];
  return actions.map((action, i) => ({
    id: i + 1, created_at: "2026-09-22T08:00:00Z", user_display: `User ${i + 1}`, username: `user${i + 1}`, action,
    action_label: action, record_type: "Resort", record_label: `Record ${i + 1}`, record_id: String(i + 1),
  }));
}

async function open(logs, module = "tourism") {
  apiRequest.mockResolvedValue(logs);
  render(<ActivityLogsPage module={module} />);
  await screen.findByText(logs.length ? "Record 1" : "No activity logs found.");
}

const rowsShown = () => document.querySelectorAll(".activity-table-card tbody tr").length;
const showing = () => document.querySelector(".booking-pagination p").textContent.replace(/\s+/g, " ").trim();
const card = (label) => screen.getByText(label, { selector: ".activity-summary-card span" }).parentElement.querySelector("strong").textContent;
const cards = () => [card("Created"), card("Updated"), card("Deleted")];
const next = () => screen.getByRole("button", { name: "Next page" });
const sizeSelect = () => screen.getByLabelText("Rows per page");

beforeEach(() => apiRequest.mockReset());

describe("the tourism table", () => {
  it("25 logs at 10 a page: 10 rows, and Showing 1-10 of 25 filtered records", async () => {
    await open(makeLogs(12, 8, 5));

    expect(rowsShown()).toBe(10);
    expect(showing()).toBe("Showing 1-10 of 25 filtered records");
    expect(sizeSelect().value).toBe("10");
    expect(Array.from(sizeSelect().options).map((o) => o.value)).toEqual(["10", "25", "50", "100"]);
  });

  it("pages through to the last five", async () => {
    await open(makeLogs(12, 8, 5));

    fireEvent.click(next());
    fireEvent.click(next());

    expect(showing()).toBe("Showing 21-25 of 25 filtered records");
    expect(rowsShown()).toBe(5);
    expect(screen.getByText("Record 25")).toBeTruthy();
  });

  it("100 a page and only 13 logs: no page buttons, and Showing 1-13 of 13 filtered records", async () => {
    await open(makeLogs(5, 5, 3));
    userEvent.selectOptions(sizeSelect(), "100");

    expect(rowsShown()).toBe(13);
    expect(showing()).toBe("Showing 1-13 of 13 filtered records");
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous page" })).toBeNull();
  });
});

describe("the cards count every log, not the page", () => {
  it("Created 12, Updated 8 and Deleted 5 on the first page, on the last, and at every size", async () => {
    await open(makeLogs(12, 8, 5)); // the first page holds ten Created only: counted from the page, the cards would read 10, 0, 0
    expect(cards()).toEqual(["12", "8", "5"]);

    fireEvent.click(next());
    expect(cards()).toEqual(["12", "8", "5"]);
    fireEvent.click(next());
    expect(cards()).toEqual(["12", "8", "5"]); // the last page holds only Deleted
    userEvent.selectOptions(sizeSelect(), "50");
    expect(cards()).toEqual(["12", "8", "5"]);
    userEvent.selectOptions(sizeSelect(), "10");
    expect(cards()).toEqual(["12", "8", "5"]);
  });
});

describe("going back to the first page", () => {
  it("when the kind of action filtered changes", async () => {
    await open(makeLogs(12, 8, 5));
    fireEvent.click(next());
    expect(showing()).toBe("Showing 11-20 of 25 filtered records");

    apiRequest.mockResolvedValue(makeLogs(22, 0, 0));
    userEvent.selectOptions(screen.getByDisplayValue("All Actions"), "create");

    await waitFor(() => expect(showing()).toBe("Showing 1-10 of 22 filtered records"));
    expect(cards()).toEqual(["22", "0", "0"]);
  });

  it("when the number of rows per page changes", async () => {
    await open(makeLogs(30, 20, 10));
    fireEvent.click(next());
    fireEvent.click(next());
    expect(showing()).toBe("Showing 21-30 of 60 filtered records");

    userEvent.selectOptions(sizeSelect(), "25");

    expect(showing()).toBe("Showing 1-25 of 60 filtered records");
  });
});

describe("with the keyboard", () => {
  it("the choice has a real label, can take the focus and be changed", async () => {
    await open(makeLogs(12, 8, 5));
    const select = sizeSelect();

    expect(document.querySelector(`label[for="${select.id}"]`).textContent).toBe("Rows per page");
    select.focus();
    expect(document.activeElement).toBe(select);
    fireEvent.change(select, { target: { value: "25" } });
    expect(showing()).toBe("Showing 1-25 of 25 filtered records");
  });

  it("Tab goes from the choice to Next (Previous is disabled on page 1) and Enter presses it", async () => {
    await open(makeLogs(12, 8, 5));
    sizeSelect().focus();

    userEvent.tab();
    expect(document.activeElement).toBe(next());
    userEvent.keyboard("{enter}");
    expect(showing()).toBe("Showing 11-20 of 25 filtered records");
  });
});

describe("Sanitation, which shares the page", () => {
  it("shows every row with no paging at all, as before", async () => {
    await open(makeLogs(12, 8, 5), "sanitation");

    expect(rowsShown()).toBe(25);
    expect(document.querySelector(".booking-pagination")).toBeNull();
    expect(screen.queryByLabelText("Rows per page")).toBeNull();
    expect(cards()).toEqual(["12", "8", "5"]);
  });
});
