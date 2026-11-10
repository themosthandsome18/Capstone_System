// The panel at the right of Resort Accounts: what a staff account can do in the app, and what it cannot. It is a picture of the app and a list; nothing
// in it is a control.

export const LIMIT_CANNOT_HEADING = "They cannot open";
export const LIMIT_CANNOT = [
  "The admin system on the web — any page",
  "Another resort's records",
  "Sanitation and its advisories",
  "A fellow staff member's account",
];
export const LIMIT_PHONE_NOTE = "Only their own resort appears. A booking made with another resort is refused.";
export const LIMIT_FOOT =
  "They can change the details of a visitor booked with them — the name, the counts, the time of arrival — because they are at the door and they can see what is true. The record remembers who changed it.";

export default function ResortStaffLimit() {
  return (
    <aside className="mobile-content-staff-limit" aria-label="The limit">
      <p className="mobile-content-eyebrow">The limit</p>
      <h2>This is all they can do</h2>
      <p className="mobile-content-staff-limit-sub">A staff account in the app</p>

      <div className="mobile-content-staff-phone" data-testid="limit-phone">
        <div className="mobile-content-staff-screen">
          <p className="mobile-content-staff-screen-title">Tourist QR Check-In</p>
          <div className="mobile-content-staff-screen-box">Search a Survey ID</div>
          <div className="mobile-content-staff-screen-box is-main">Scan QR Code</div>
          <div className="mobile-content-staff-screen-box">Tourist History Log</div>
          <p className="mobile-content-staff-screen-note">{LIMIT_PHONE_NOTE}</p>
        </div>
      </div>

      <div className="mobile-content-staff-cannot">
        <p className="mobile-content-staff-cannot-heading">{LIMIT_CANNOT_HEADING}</p>
        <ul data-testid="cannot-list">
          {LIMIT_CANNOT.map((line) => (
            <li key={line}>
              <span className="mobile-content-staff-cross" aria-hidden="true">
                ×
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>

      <p className="mobile-content-staff-limit-foot">{LIMIT_FOOT}</p>
    </aside>
  );
}
