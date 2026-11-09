import { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

// A box for a password with its own eye: it shows what is typed in THIS box only, and starts hidden. (The eye of Edge is hidden by the CSS of the box.)
export default function PasswordBox({ id, value, onChange }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="mobile-content-staff-secret">
      <input id={id} type={shown ? "text" : "password"} autoComplete="new-password" value={value} onChange={onChange} />
      <button
        type="button"
        className="mobile-content-staff-eye"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        onClick={() => setShown((current) => !current)}
      >
        {shown ? <FiEyeOff size={17} aria-hidden="true" /> : <FiEye size={17} aria-hidden="true" />}
      </button>
    </div>
  );
}
