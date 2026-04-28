import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTourismData } from "../context/TourismDataContext";

function Settings() {
  const { settings, updateSettings } = useTourismData();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await updateSettings(form);
      setMessage("Settings saved.");
    } catch (saveError) {
      setError("Unable to save settings. Please check the fields.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-top">
        <div className="settings-breadcrumb">
          <Link to="/" className="settings-home-link">
            Home
          </Link>
          <span>&gt;</span>
          <strong>Settings</strong>
        </div>
      </div>

      <h1 className="settings-title">Settings</h1>

      <form className="settings-container" onSubmit={saveSettings}>
        <section className="settings-card">
          <h2>General Settings</h2>

          <FormField
            label="Municipality name"
            value={form.municipality_name || ""}
            onChange={(value) => updateField("municipality_name", value)}
          />
          <FormField
            label="Province"
            value={form.province || ""}
            onChange={(value) => updateField("province", value)}
          />
          <FormField
            label="Tourism Office Contact"
            value={form.tourism_office_contact || ""}
            onChange={(value) => updateField("tourism_office_contact", value)}
          />
          <FormField
            label="Tourism Office Email"
            type="email"
            value={form.tourism_office_email || ""}
            onChange={(value) => updateField("tourism_office_email", value)}
          />
        </section>

        <section className="settings-card api-card">
          <h2>API Configuration</h2>

          <FormField
            label="API Base URL"
            type="url"
            value={form.api_base_url || ""}
            onChange={(value) => updateField("api_base_url", value)}
          />
        </section>

        {message ? <p className="settings-message success">{message}</p> : null}
        {error ? <p className="settings-message error">{error}</p> : null}

        <button type="submit" className="settings-save-btn" disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text" }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export default Settings;
