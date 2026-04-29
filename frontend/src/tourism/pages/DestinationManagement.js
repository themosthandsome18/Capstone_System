import { useMemo, useState } from "react";
import { FiEdit2, FiMapPin, FiStar, FiTrash2 } from "react-icons/fi";
import { useTourismData } from "../context/TourismDataContext";

const initialForm = {
  resort_name: "",
  with_mayors_permit: true,
  type: "",
  location: "",
  short_description: "",
  tourism_rating: "0",
  access: "",
  itinerary_ids: "",
  image_key: "",
  monthly_arrivals: "0",
  latitude: "",
  longitude: "",
};

const emptyDestinations = [];

function DestinationManagement() {
  const {
    referenceTables,
    createResort,
    updateResort,
    deleteResort,
  } = useTourismData();

  const destinations = referenceTables.resorts || emptyDestinations;

  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const filteredDestinations = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return destinations;
    }

    return destinations.filter((destination) => {
      return [
        destination.resort_name,
        destination.type,
        destination.location,
        destination.access,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [destinations, search]);

  const averageRating = (
    destinations.reduce(
      (sum, item) => sum + Number(item.tourism_rating || 0),
      0
    ) / Math.max(destinations.length, 1)
  ).toFixed(1);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openAddDestination() {
    setEditingDestination(null);
    setForm(initialForm);
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditDestination(destination) {
    setEditingDestination(destination);
    setForm({
      resort_name: destination.resort_name || "",
      with_mayors_permit: Boolean(destination.with_mayors_permit),
      type: destination.type || "",
      location: destination.location || "",
      short_description: destination.short_description || "",
      tourism_rating: String(destination.tourism_rating || 0),
      access: destination.access || "",
      itinerary_ids: Array.isArray(destination.itinerary_ids)
        ? destination.itinerary_ids.join(", ")
        : "",
      image_key: destination.image_key || "",
      monthly_arrivals: String(destination.monthly_arrivals || 0),
      latitude: String(destination.latitude || destination.coordinates?.lat || ""),
      longitude: String(destination.longitude || destination.coordinates?.lng || ""),
    });
    setFormError("");
    setIsFormOpen(true);
  }

  function parseItineraryIds(value) {
    if (!value.trim()) {
      return [];
    }

    return value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => !Number.isNaN(item));
  }

  function buildPayload() {
    return {
      resort_name: form.resort_name.trim(),
      with_mayors_permit: Boolean(form.with_mayors_permit),
      type: form.type.trim(),
      location: form.location.trim(),
      short_description: form.short_description.trim(),
      tourism_rating: Number(form.tourism_rating || 0),
      access: form.access.trim(),
      itinerary_ids: parseItineraryIds(form.itinerary_ids),
      image_key: form.image_key.trim(),
      monthly_arrivals: Number(form.monthly_arrivals || 0),
      latitude: Number(form.latitude || 0),
      longitude: Number(form.longitude || 0),
    };
  }

  function validatePayload(payload) {
    if (!payload.resort_name) {
      return "Destination name is required.";
    }

    if (!payload.type) {
      return "Destination type is required.";
    }

    if (!payload.location) {
      return "Location is required.";
    }

    if (!payload.short_description) {
      return "Short description is required.";
    }

    if (!payload.access) {
      return "Access type is required.";
    }

    if (!payload.latitude || !payload.longitude) {
      return "Latitude and longitude are required for GIS mapping.";
    }

    return "";
  }

  function getErrorMessage(error) {
    if (error?.details?.detail) {
      return error.details.detail;
    }

    if (error?.details && typeof error.details === "object") {
      return Object.entries(error.details)
        .map(([field, messages]) => {
          const text = Array.isArray(messages) ? messages.join(" ") : messages;
          return `${field}: ${text}`;
        })
        .join(" ");
    }

    return error?.message || "Unable to save destination.";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = buildPayload();
    const errorMessage = validatePayload(payload);

    if (errorMessage) {
      setFormError(errorMessage);
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (editingDestination) {
        await updateResort(editingDestination.resort_id, payload);
      } else {
        await createResort(payload);
      }

      setIsFormOpen(false);
      setEditingDestination(null);
      setForm(initialForm);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteDestination() {
    if (!deleteTarget) {
      return;
    }

    setSaving(true);
    setDeleteError("");

    try {
      await deleteResort(deleteTarget.resort_id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="destination-page">
      <div className="destination-header">
        <div>
          <h1>Destination Management</h1>
          <p>Manage resorts and tourist spots in Mauban, Quezon</p>
        </div>

        <button
          type="button"
          className="destination-add-btn"
          onClick={openAddDestination}
        >
          <FiMapPin />
          Add Destination
        </button>
      </div>

      <div className="destination-search">
        <input
          type="search"
          placeholder="Search destinations..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="destination-grid">
        {filteredDestinations.map((destination) => (
          <div key={destination.resort_id} className="destination-card">
            <div className="destination-image">
              {destination.image ? (
                <img src={destination.image} alt={destination.resort_name} />
              ) : (
                <div className="destination-image-fallback">
                  {destination.resort_name}
                </div>
              )}

              <span className="destination-rating">
                <FiStar />
                {destination.tourism_rating}
              </span>
            </div>

            <div className="destination-body">
              <div className="destination-title-row">
                <div>
                  <h3>{destination.resort_name}</h3>
                  <p>
                    <FiMapPin />
                    {destination.location}
                  </p>
                </div>

                <span
                  className={`destination-status ${
                    destination.with_mayors_permit ? "active" : "maintenance"
                  }`}
                >
                  {destination.with_mayors_permit ? "Active" : "No Permit"}
                </span>
              </div>

              <div className="destination-card-stats">
                <div>
                  <p>VISITORS</p>
                  <h4>{Number(destination.monthly_arrivals || 0).toLocaleString()}</h4>
                  <span>this month</span>
                </div>

                <div>
                  <p>TYPE</p>
                  <h4>{destination.type}</h4>
                  <span>{destination.access}</span>
                </div>
              </div>

              <div className="destination-action-row">
                <button
                  type="button"
                  className="destination-edit-btn"
                  onClick={() => openEditDestination(destination)}
                >
                  <FiEdit2 />
                  Edit
                </button>

                <button
                  type="button"
                  className="destination-delete-btn"
                  onClick={() => {
                    setDeleteTarget(destination);
                    setDeleteError("");
                  }}
                >
                  <FiTrash2 />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="destination-footer">
        <p>
          TOTAL DESTINATION: <strong>{destinations.length}</strong>
        </p>

        <p>
          Average Ratings: <FiStar /> <strong>{averageRating}</strong>
        </p>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10">
          <form
            className="tourist-record-form w-full max-w-[720px]"
            onSubmit={handleSubmit}
          >
            <h2 className="mb-6 text-xl font-extrabold text-black">
              {editingDestination ? "Edit Destination" : "Add Destination"}
            </h2>

            <div className="tourist-record-grid">
              <TextField
                label="Destination Name"
                value={form.resort_name}
                onChange={(value) => updateField("resort_name", value)}
                required
              />

              <SelectBooleanField
                label="Mayor's Permit"
                value={form.with_mayors_permit}
                onChange={(value) => updateField("with_mayors_permit", value)}
              />

              <TextField
                label="Type"
                placeholder="Island Resort, Beach Resort, Heritage Site"
                value={form.type}
                onChange={(value) => updateField("type", value)}
                required
              />

              <TextField
                label="Access"
                placeholder="Boat Access, Road Access"
                value={form.access}
                onChange={(value) => updateField("access", value)}
                required
              />

              <TextField
                label="Location"
                value={form.location}
                onChange={(value) => updateField("location", value)}
                required
              />

              <TextField
                label="Tourism Rating"
                type="number"
                min="0"
                step="0.1"
                value={form.tourism_rating}
                onChange={(value) => updateField("tourism_rating", value)}
              />

              <TextField
                label="Monthly Arrivals"
                type="number"
                min="0"
                value={form.monthly_arrivals}
                onChange={(value) => updateField("monthly_arrivals", value)}
              />

              <TextField
                label="Image Key"
                placeholder="cagbalete, dampalitan-island"
                value={form.image_key}
                onChange={(value) => updateField("image_key", value)}
              />

              <TextField
                label="Latitude"
                type="number"
                step="any"
                value={form.latitude}
                onChange={(value) => updateField("latitude", value)}
                required
              />

              <TextField
                label="Longitude"
                type="number"
                step="any"
                value={form.longitude}
                onChange={(value) => updateField("longitude", value)}
                required
              />

              <TextField
                label="Itinerary IDs"
                placeholder="1, 2"
                value={form.itinerary_ids}
                onChange={(value) => updateField("itinerary_ids", value)}
              />

              <TextAreaField
                label="Short Description"
                value={form.short_description}
                onChange={(value) => updateField("short_description", value)}
                required
              />
            </div>

            {formError ? (
              <p className="tourist-record-error">{formError}</p>
            ) : null}

            <div className="tourist-record-actions">
              <button
                type="button"
                className="tourist-record-cancel"
                disabled={saving}
                onClick={() => setIsFormOpen(false)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="tourist-record-save"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Destination"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10">
          <div className="delete-record-confirm w-full max-w-[420px]">
            <p>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.resort_name}</strong>?
            </p>

            <p className="mt-2 text-xs text-slate-500">
              If this destination is already linked to tourist records, the backend
              will prevent deletion.
            </p>

            {deleteError ? (
              <p className="tourist-record-error">{deleteError}</p>
            ) : null}

            <div className="delete-record-actions">
              <button
                type="button"
                className="tourist-record-cancel"
                disabled={saving}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-record-confirm-btn"
                disabled={saving}
                onClick={confirmDeleteDestination}
              >
                {saving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  min,
  step,
}) {
  return (
    <label className="tourist-record-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder || label}
        required={required}
        min={min}
        step={step}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, required = false }) {
  return (
    <label className="tourist-record-field">
      <span>{label}</span>
      <textarea
        value={value}
        required={required}
        placeholder={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectBooleanField({ label, value, onChange }) {
  return (
    <label className="tourist-record-field">
      <span>{label}</span>
      <select
        value={value ? "true" : "false"}
        onChange={(event) => onChange(event.target.value === "true")}
      >
        <option value="true">With Mayor's Permit</option>
        <option value="false">No Mayor's Permit</option>
      </select>
    </label>
  );
}

export default DestinationManagement;