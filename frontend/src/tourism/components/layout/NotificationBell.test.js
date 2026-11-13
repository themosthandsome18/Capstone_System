/**
 * The bell of the admin and the Tourism Office: a red dot when something is unread, a list that opens under it (newest first, each with its title, its
 * sentence and how long ago), pressing one reads it and goes to the right place, the X takes away that person's own row at once, mark all, and an empty
 * list that says so. The server is stood in for by tourismApi, so what is asked of it is what is checked.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import NotificationBell, { BELL_LIST_LIMIT, BELL_POLL_INTERVAL_MS } from "./NotificationBell";
import { tourismApi } from "../../services/tourismApi";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock("../../services/tourismApi", () => ({
  tourismApi: {
    getTourismNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
    markAllTourismNotificationsRead: jest.fn(),
    deleteNotification: jest.fn(),
  },
}));

const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();
const NOTICES = [
  { id: 11, title: "New review", message: "A 4-star review was sent for Beach One.", is_read: false, created_at: iso(3), action_url: "/feedback?openFeedbackId=7" },
  { id: 10, title: "New tourist registration", message: "A visit to Beach One on 13 Nov 2026 was registered (survey SV-1).", is_read: false, created_at: iso(125), action_url: "/tourist-data?openSurveyId=SV-1" },
  { id: 9, title: "New review", message: "A 5-star review was sent for Cove Two.", is_read: true, created_at: iso(60 * 50), action_url: "/feedback?openFeedbackId=6" },
];

function answer(results, unread = results.filter((row) => !row.is_read).length) {
  return { unread_count: unread + 5, module_unread_count: unread, results };
}

beforeEach(() => {
  mockNavigate.mockClear();
  tourismApi.getTourismNotifications.mockResolvedValue(answer(NOTICES));
  tourismApi.markNotificationRead.mockResolvedValue({});
  tourismApi.markAllTourismNotificationsRead.mockResolvedValue({ updated_count: 2 });
  tourismApi.deleteNotification.mockResolvedValue(null);
});

const bell = () => screen.getByRole("button", { name: /^Notifications/ });
async function openBell() {
  render(<NotificationBell />);
  await waitFor(() => expect(tourismApi.getTourismNotifications).toHaveBeenCalled());
  await waitFor(() => expect(bell().getAttribute("aria-label")).toMatch(/unread|^Notifications$/));
  fireEvent.click(bell());
  return screen.findByRole("dialog", { name: "Notifications" });
}
const rows = (panel) => within(panel).queryAllByRole("listitem");

describe("the red dot", () => {
  it("is on the bell when something is unread, and says how many to a screen reader", async () => {
    render(<NotificationBell />);

    expect(await screen.findByTestId("bell-dot")).toBeTruthy();
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 2 unread");
  });

  it("is not there when everything is read, or when there are no notices", async () => {
    tourismApi.getTourismNotifications.mockResolvedValue(answer([NOTICES[2]]));
    const { unmount } = render(<NotificationBell />);
    await waitFor(() => expect(tourismApi.getTourismNotifications).toHaveBeenCalled());
    expect(screen.queryByTestId("bell-dot")).toBeNull();
    unmount();

    tourismApi.getTourismNotifications.mockResolvedValue(answer([]));
    render(<NotificationBell />);
    await waitFor(() => expect(tourismApi.getTourismNotifications).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("bell-dot")).toBeNull();
  });

  it("counts the Tourism notices the server counted, not the other modules' (it reads module_unread_count)", async () => {
    tourismApi.getTourismNotifications.mockResolvedValue({ unread_count: 9, module_unread_count: 0, results: [NOTICES[2]] });
    render(<NotificationBell />);
    await waitFor(() => expect(tourismApi.getTourismNotifications).toHaveBeenCalled());

    expect(screen.queryByTestId("bell-dot")).toBeNull();
  });
});

describe("the list", () => {
  it("opens when the bell is pressed, newest first as the server sent it, each with title, sentence and how long ago", async () => {
    const panel = await openBell();

    const items = rows(panel);
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("New review");
    expect(items[0].textContent).toContain("A 4-star review was sent for Beach One.");
    expect(items[0].textContent).toContain("3 min ago");
    expect(items[1].textContent).toContain("2 hours ago");
    expect(items[2].textContent).toContain("2 days ago");
    expect(items.map((item) => item.className.includes("unread"))).toEqual([true, true, false]);
  });

  it("asks the server for the Tourism notifications, a limited number", async () => {
    await openBell();

    expect(tourismApi.getTourismNotifications).toHaveBeenCalledWith(BELL_LIST_LIMIT);
  });

  it("closes on Escape and on a press outside it", async () => {
    await openBell();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(bell());
    await screen.findByRole("dialog");
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("with nothing in it says so clearly, not an empty box", async () => {
    tourismApi.getTourismNotifications.mockResolvedValue(answer([]));
    const panel = await openBell();

    expect(within(panel).getByText("No notifications")).toBeTruthy();
    expect(within(panel).getByText(/New registrations and reviews will show here/)).toBeTruthy();
    expect(rows(panel)).toHaveLength(0);
  });

  it("when it cannot be loaded says that, with a way to try again", async () => {
    tourismApi.getTourismNotifications.mockRejectedValue(new Error("down"));
    const panel = await openBell();

    expect(await within(panel).findByText("The notifications could not be loaded.")).toBeTruthy();
    tourismApi.getTourismNotifications.mockResolvedValue(answer(NOTICES));
    fireEvent.click(within(panel).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rows(panel)).toHaveLength(3));
  });
});

describe("pressing a notice", () => {
  it("makes it read, goes to the record or review it is about, and closes the list", async () => {
    const panel = await openBell();

    fireEvent.click(within(rows(panel)[1]).getByText("New tourist registration"));

    expect(tourismApi.markNotificationRead).toHaveBeenCalledWith(10);
    expect(mockNavigate).toHaveBeenCalledWith("/tourist-data?openSurveyId=SV-1");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 1 unread"); // 2 → 1, at once
  });

  it("a review notice goes to that review", async () => {
    const panel = await openBell();

    fireEvent.click(within(rows(panel)[0]).getByText("New review"));

    expect(mockNavigate).toHaveBeenCalledWith("/feedback?openFeedbackId=7");
    expect(tourismApi.markNotificationRead).toHaveBeenCalledWith(11);
  });

  it("one that was already read is not marked again, and still goes", async () => {
    const panel = await openBell();

    fireEvent.click(within(rows(panel)[2]).getByText("New review"));

    expect(tourismApi.markNotificationRead).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/feedback?openFeedbackId=6");
  });

  it("goes only to a place inside the app", async () => {
    tourismApi.getTourismNotifications.mockResolvedValue(answer([{ ...NOTICES[0], action_url: "https://elsewhere.test/x" }]));
    const panel = await openBell();

    fireEvent.click(within(rows(panel)[0]).getByText("New review"));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("if the server does not take the read, it is unread again", async () => {
    tourismApi.markNotificationRead.mockRejectedValue(new Error("refused"));
    const panel = await openBell();

    fireEvent.click(within(rows(panel)[0]).getByText("New review"));

    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifications, 2 unread"));
  });
});

describe("the X", () => {
  it("takes that one notice away at once, and asks the server to delete that one's id and no other", async () => {
    let finish;
    tourismApi.deleteNotification.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const panel = await openBell();

    fireEvent.click(within(panel).getByRole("button", { name: "Remove notification: New tourist registration" }));

    expect(rows(panel)).toHaveLength(2); // gone before the server has answered
    expect(within(panel).queryByText(/survey SV-1/)).toBeNull();
    expect(tourismApi.deleteNotification).toHaveBeenCalledTimes(1);
    expect(tourismApi.deleteNotification).toHaveBeenCalledWith(10);
    await act(async () => finish(null));
    expect(rows(panel)).toHaveLength(2);
  });

  it("an unread one taken away is not counted any more", async () => {
    const panel = await openBell();

    fireEvent.click(within(panel).getAllByRole("button", { name: /^Remove notification/ })[0]);

    expect(bell().getAttribute("aria-label")).toBe("Notifications, 1 unread");
  });

  it("if the server refuses, it comes back where it was, with a message", async () => {
    tourismApi.deleteNotification.mockRejectedValue(Object.assign(new Error("no"), { status: 500 }));
    const panel = await openBell();

    fireEvent.click(within(panel).getByRole("button", { name: "Remove notification: New tourist registration" }));

    expect(await within(panel).findByText("That notification could not be removed. Try again.")).toBeTruthy();
    const items = rows(panel);
    expect(items).toHaveLength(3);
    expect(items[1].textContent).toContain("survey SV-1"); // in its own place
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 2 unread");
  });

  it("if it was already gone (404) it stays gone, with no message", async () => {
    tourismApi.deleteNotification.mockRejectedValue(Object.assign(new Error("gone"), { status: 404 }));
    const panel = await openBell();

    fireEvent.click(within(panel).getByRole("button", { name: "Remove notification: New tourist registration" }));

    await waitFor(() => expect(tourismApi.deleteNotification).toHaveBeenCalled());
    expect(rows(panel)).toHaveLength(2);
    expect(within(panel).queryByRole("alert")).toBeNull();
  });

  it("taking away the last one shows the empty list", async () => {
    tourismApi.getTourismNotifications.mockResolvedValue(answer([NOTICES[2]]));
    const panel = await openBell();

    fireEvent.click(within(panel).getByRole("button", { name: /^Remove notification/ }));

    expect(await within(panel).findByText("No notifications")).toBeTruthy();
  });
});

describe("mark all as read", () => {
  it("reads every notice at once, calls the server once (for the Tourism ones), and takes the dot away", async () => {
    const panel = await openBell();

    fireEvent.click(within(panel).getByRole("button", { name: /Mark all as read/ }));

    expect(tourismApi.markAllTourismNotificationsRead).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("bell-dot")).toBeNull();
    expect(rows(panel).some((item) => item.className.includes("unread"))).toBe(false);
  });

  it("is not offered when there is nothing unread", async () => {
    tourismApi.getTourismNotifications.mockResolvedValue(answer([NOTICES[2]]));
    const panel = await openBell();

    expect(within(panel).getByRole("button", { name: /Mark all as read/ }).disabled).toBe(true);
  });

  it("if the server refuses, they are unread again, with a message", async () => {
    tourismApi.markAllTourismNotificationsRead.mockRejectedValue(new Error("refused"));
    const panel = await openBell();

    fireEvent.click(within(panel).getByRole("button", { name: /Mark all as read/ }));

    expect(await within(panel).findByText("The notifications could not be marked as read. Try again.")).toBeTruthy();
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 2 unread");
  });
});

describe("how often it asks", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("once when it appears, and then once a minute, not more often", async () => {
    render(<NotificationBell />);
    await act(async () => {});
    expect(tourismApi.getTourismNotifications).toHaveBeenCalledTimes(1);

    await act(async () => jest.advanceTimersByTime(BELL_POLL_INTERVAL_MS - 1000));
    expect(tourismApi.getTourismNotifications).toHaveBeenCalledTimes(1);

    await act(async () => jest.advanceTimersByTime(1000));
    expect(tourismApi.getTourismNotifications).toHaveBeenCalledTimes(2);
    expect(BELL_POLL_INTERVAL_MS).toBe(60000);
  });

  it("not at all while the browser tab is hidden", async () => {
    render(<NotificationBell />);
    await act(async () => {});
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    try {
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        jest.advanceTimersByTime(BELL_POLL_INTERVAL_MS * 3);
      });
      expect(tourismApi.getTourismNotifications).toHaveBeenCalledTimes(1);
    } finally {
      delete document.visibilityState;
    }
  });
});

describe("it is the bell of the admin shell", () => {
  it("AppShell draws this bell, and no longer the one that did nothing", () => {
    const shell = readFileSync(join(__dirname, "AppShell.js"), "utf8");

    expect(shell).toContain("<NotificationBell />");
    expect(shell).not.toContain("Notifications preview");
  });
});
