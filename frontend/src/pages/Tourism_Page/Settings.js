import { FiBell, FiSearch, FiUser } from "react-icons/fi";
import { Link } from "react-router-dom";

function Settings() {
  return (
    <div className="settings-page">
      <div className="settings-top">
        <div className="settings-breadcrumb">
          <Link to="/" className="settings-home-link">Home</Link>
          <span>›</span>
          <strong>Settings</strong>
        </div>
      </div>

      <h1 className="settings-title">Settings</h1>

      <div className="settings-container">
        <section className="settings-card">
          <h2>General Settings</h2>

          <FormField label="Municipality name" value="Municipality of Mauban" />
          <FormField label="Province" value="Quezon" />
          <FormField label="Tourism Office Contact" value="+63 42 XXX XXXX" />
          <FormField label="Tourism Office Email" value="tourism@mauban.gov.ph" />
        </section>

        <section className="settings-card api-card">
          <h2>API Configuration</h2>

          <FormField
            label="API Base URL"
            value="https://api.mauban-tourism.gov.ph/v1"
          />
        </section>

        <button type="button" className="settings-save-btn">
          Save Changes
        </button>
      </div>
    </div>
  );
}

function FormField({ label, value }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input type="text" defaultValue={value} />
    </label>
  );
}

export default Settings;