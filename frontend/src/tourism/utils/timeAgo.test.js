import { timeAgo } from "./timeAgo";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const ago = (seconds) => new Date(NOW - seconds * 1000).toISOString();

describe("how long ago", () => {
  it.each([
    [0, "just now"],
    [59, "just now"],
    [60, "1 min ago"],
    [5 * 60, "5 min ago"],
    [59 * 60 + 59, "59 min ago"],
    [60 * 60, "1 hour ago"],
    [2 * 3600, "2 hours ago"],
    [23 * 3600 + 3599, "23 hours ago"],
    [24 * 3600, "1 day ago"],
    [3 * 86400, "3 days ago"],
    [6 * 86400 + 86399, "6 days ago"],
  ])("%i seconds is %s", (seconds, expected) => {
    expect(timeAgo(ago(seconds), NOW)).toBe(expected);
  });

  it("after a week it is the date", () => {
    expect(timeAgo("2026-11-01T08:00:00Z", NOW)).toBe("1 Nov 2026");
  });

  it("a time a little in the future (the two clocks differ) is just now, not a negative number", () => {
    expect(timeAgo(new Date(NOW + 5000).toISOString(), NOW)).toBe("just now");
  });

  it("an unreadable or missing date says nothing, never NaN", () => {
    for (const bad of [undefined, null, "", "not a date"]) {
      expect(timeAgo(bad, NOW)).toBe("");
    }
  });
});
