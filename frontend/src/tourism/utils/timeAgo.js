// How long ago something was, in the words the notifications list uses: "just now", "5 min ago", "2 hours ago", "3 days ago", and after a week the date.
// `now` is a parameter so that a test can fix the clock. An unreadable date is "" (nothing is shown), never "NaN".
export function timeAgo(iso, now = Date.now()) {
  if (iso === null || iso === undefined || iso === "") return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  return new Date(then).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
