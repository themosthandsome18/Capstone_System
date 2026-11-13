import { useCallback, useEffect, useRef, useState } from "react";
import { FiBell, FiCheck, FiX } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { tourismApi } from "../../services/tourismApi";
import { timeAgo } from "../../utils/timeAgo";
import { useVisibleInterval } from "../../utils/useVisibleInterval";

// How often the bell asks the server. The same polling the booking list and the feedback use (useVisibleInterval): it stops while the browser tab is
// hidden, never overlaps itself, and asks again at once when the tab comes back. A minute is enough for "a visit was registered, a review came in":
// the booking list (people being scanned in) is the data that moves faster, and it asks every 30 seconds. The list is also asked when the bell is opened.
export const BELL_POLL_INTERVAL_MS = 60 * 1000;
export const BELL_LIST_LIMIT = 30;

// The bell of the admin and the Tourism Office: this person's own Tourism notifications. Each person who is told has a row of their own, so the X
// takes a notice off THIS list only. Everything the person does is shown at once and put right if the server refuses.
function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [problem, setProblem] = useState("");
  const rootRef = useRef(null);
  const mounted = useRef(true);
  // Bumped by everything the person does to the list: an answer to a request made BEFORE that must not put back what they just did.
  const changes = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const startedAt = changes.current;
    try {
      const answer = await tourismApi.getTourismNotifications(BELL_LIST_LIMIT);
      if (!mounted.current || startedAt !== changes.current) return;
      setItems(Array.isArray(answer?.results) ? answer.results : []);
      setUnread(Number(answer?.module_unread_count) || 0);
      setLoaded(true);
      setLoadFailed(false);
    } catch (error) {
      if (!mounted.current) return;
      setLoadFailed(true);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useVisibleInterval(load, BELL_POLL_INTERVAL_MS);

  // It closes on a press outside it, and on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    setProblem("");
    if (next) load();
  }

  function put(item, patch) {
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, ...patch } : entry)));
  }

  async function openItem(item) {
    setOpen(false);
    if (!item.is_read) {
      changes.current += 1;
      put(item, { is_read: true });
      setUnread((count) => Math.max(0, count - 1));
      tourismApi.markNotificationRead(item.id).catch(() => {
        if (!mounted.current) return;
        put(item, { is_read: false }); // the server did not take it: it is unread again
        setUnread((count) => count + 1);
      });
    }
    if (item.action_url && String(item.action_url).startsWith("/")) navigate(item.action_url);
  }

  async function remove(item) {
    changes.current += 1;
    setProblem("");
    const index = items.findIndex((entry) => entry.id === item.id);
    setItems((current) => current.filter((entry) => entry.id !== item.id)); // gone at once
    if (!item.is_read) setUnread((count) => Math.max(0, count - 1));
    try {
      await tourismApi.deleteNotification(item.id);
    } catch (error) {
      if (!mounted.current) return;
      if (error?.status === 404) return; // it was not there any more: that is what was asked for
      setItems((current) => {
        const back = [...current];
        back.splice(Math.min(Math.max(index, 0), back.length), 0, item);
        return back;
      });
      if (!item.is_read) setUnread((count) => count + 1);
      setProblem("That notification could not be removed. Try again.");
    }
  }

  async function markAllRead() {
    const before = items;
    const unreadBefore = unread;
    changes.current += 1;
    setProblem("");
    setItems((current) => current.map((entry) => ({ ...entry, is_read: true })));
    setUnread(0);
    try {
      await tourismApi.markAllTourismNotificationsRead();
    } catch (error) {
      if (!mounted.current) return;
      setItems(before);
      setUnread(unreadBefore);
      setProblem("The notifications could not be marked as read. Try again.");
    }
  }

  const now = Date.now();
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        type="button"
        className="icon-pill notification-bell-button"
        title="Notifications"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <FiBell />
        {unread > 0 ? <span className="notification-bell-dot" data-testid="bell-dot" /> : null}
      </button>

      {open ? (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel-head">
            <h3>Notifications</h3>
            <button type="button" className="notification-mark-all" onClick={markAllRead} disabled={unread === 0}>
              <FiCheck size={14} aria-hidden="true" /> Mark all as read
            </button>
          </div>

          {problem ? (
            <p className="notification-problem" role="alert">
              {problem}
            </p>
          ) : null}

          {!loaded ? (
            <p className="notification-empty">Loading…</p>
          ) : loadFailed && !items.length ? (
            <div className="notification-empty">
              <p>The notifications could not be loaded.</p>
              <button type="button" className="notification-retry" onClick={load}>
                Try again
              </button>
            </div>
          ) : items.length ? (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id} className={`notification-item${item.is_read ? "" : " unread"}`}>
                  <button type="button" className="notification-item-main" onClick={() => openItem(item)}>
                    <strong>{item.title}</strong>
                    <span className="notification-item-message">{item.message}</span>
                    <small>{timeAgo(item.created_at, now)}</small>
                  </button>
                  <button
                    type="button"
                    className="notification-item-x"
                    onClick={() => remove(item)}
                    aria-label={`Remove notification: ${item.title}`}
                    title="Remove"
                  >
                    <FiX size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="notification-empty">
              <FiBell size={22} aria-hidden="true" />
              <p>No notifications</p>
              <small>New registrations and reviews will show here.</small>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default NotificationBell;
