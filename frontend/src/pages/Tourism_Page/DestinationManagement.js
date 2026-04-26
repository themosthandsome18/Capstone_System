import { useState } from "react";
import { FiEdit2, FiMapPin, FiPlus, FiStar, FiTrash2 } from "react-icons/fi";
import Modal from "../../components/ui/Modal";
import { useTourismData } from "../../context/TourismDataContext";

function createEmptyDestinationForm() {
  return {
    resort_name: "",
    type: "Beach Resort",
    location: "",
    short_description: "",
    tourism_rating: "4.0",
    access: "Road Access",
    itinerary_ids: "1",
    image_key: "",
    monthly_arrivals: "0",
    latitude: "14.0245",
    longitude: "121.7317",
    with_mayors_permit: "true",
  };
}

function createDestinationFormFromResort(resort) {
  return {
    resort_name: resort.resort_name || "",
    type: resort.type || "Beach Resort",
    location: resort.location || "",
    short_description: resort.short_description || "",
    tourism_rating: String(resort.tourism_rating ?? "4.0"),
    access: resort.access || "Road Access",
    itinerary_ids: (resort.itinerary_ids || []).join(", "),
    image_key: resort.image_key || "",
    monthly_arrivals: String(resort.monthly_arrivals ?? 0),
    latitude: String(resort.latitude ?? resort.coordinates?.lat ?? ""),
    longitude: String(resort.longitude ?? resort.coordinates?.lng ?? ""),
    with_mayors_permit: resort.with_mayors_permit ? "true" : "false",
  };
}

function DestinationManagement() {
  const { referenceTables, createResort, updateResort, deleteResort } =
    useTourismData();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState(null);
  const [destinationForm, setDestinationForm] = useState(
    createEmptyDestinationForm
  );
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [formError, setFormError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const destinations = referenceTables.resorts.filter((destination) => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [destination.resort_name, destination.location, destination.type]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  const averageRating = (
    destinations.reduce((sum, item) => sum + Number(item.tourism_rating || 0), 0) /
    Math.max(destinations.length, 1)
  ).toFixed(1);

  function openCreateModal() {
    setEditingDestination(null);
    setDestinationForm(createEmptyDestinationForm());
    setFormError("");
    setActionMessage("");
    setModalOpen(true);
  }

  function openEditModal(destination) {
    setEditingDestination(destination);
    setDestinationForm(createDestinationFormFromResort(destination));
    setFormError("");
    setActionMessage("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setEditingDestination(null);
  }

  function updateFormField(field, value) {
    setDestinationForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function submitDestination(event) {
    event.preventDefault();
    setFormError("");
    setActionMessage("");

    if (!destinationForm.resort_name.trim() || !destinationForm.location.trim()) {
      setFormError("Destination name and location are required.");
      return;
    }

    const payload = {
      resort_name: destinationForm.resort_name.trim(),
      type: destinationForm.type.trim(),
      location: destinationForm.location.trim(),
      short_description: destinationForm.short_description.trim(),
      tourism_rating: Number(destinationForm.tourism_rating || 0),
      access: destinationForm.access.trim(),
      itinerary_ids: destinationForm.itinerary_ids
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter(Boolean),
      image_key: destinationForm.image_key.trim(),
      monthly_arrivals: Number.parseInt(destinationForm.monthly_arrivals || "0", 10),
      latitude: Number.parseFloat(destinationForm.latitude || "0"),
      longitude: Number.parseFloat(destinationForm.longitude || "0"),
      with_mayors_permit: destinationForm.with_mayors_permit === "true",
    };

    setSaving(true);
    try {
      if (editingDestination) {
        await updateResort(editingDestination.resort_id, payload);
        setActionMessage("Destination updated.");
      } else {
        await createResort(payload);
        setActionMessage("Destination added.");
      }
      setModalOpen(false);
      setEditingDestination(null);
    } catch (error) {
      setFormError(formatApiErrors(error.details));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteDestination() {
    if (!deleteCandidate) {
      return;
    }

    setDeleting(true);
    setFormError("");
    setActionMessage("");
    try {
      await deleteResort(deleteCandidate.resort_id);
      setActionMessage("Destination deleted.");
      setDeleteCandidate(null);
    } catch (error) {
      setFormError(formatApiErrors(error.details));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="destination-page">
      <div className="destination-header">
        <div>
          <h1>Destination Management</h1>
          <p>Manage resorts and tourist spot in Mauban, Quezon</p>
        </div>

        <button
          type="button"
          className="destination-add-btn"
          onClick={openCreateModal}
        >
          <FiPlus />
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

      {actionMessage ? (
        <p className="tourist-record-error success-message">{actionMessage}</p>
      ) : null}
      {formError && !modalOpen ? (
        <p className="tourist-record-error">{formError}</p>
      ) : null}

      <div className="destination-grid">
        {destinations.map((destination) => (
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
                  {destination.with_mayors_permit ? "Active" : "Maintenance"}
                </span>
              </div>

              <div className="destination-card-stats">
                <div>
                  <p>VISITORS</p>
                  <h4>{destination.monthly_arrivals}</h4>
                  <span>this month</span>
                </div>

                <div>
                  <p>TREND</p>
                  <h4
                    className={
                      destination.monthly_arrivals < 400 ? "negative" : ""
                    }
                  >
                    {destination.monthly_arrivals < 400 ? "-3%" : "+18%"}
                  </h4>
                  <span>vs. last month</span>
                </div>
              </div>

              <div className="destination-action-row">
                <button
                  type="button"
                  className="destination-edit-btn"
                  onClick={() => openEditModal(destination)}
                >
                  <FiEdit2 />
                  Edit
                </button>

                <button
                  type="button"
                  className="destination-delete-btn"
                  onClick={() => setDeleteCandidate(destination)}
                  aria-label={`Delete ${destination.resort_name}`}
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

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingDestination ? "Edit Destination" : "Add Destination"}
        description="Saved destinations are stored in the Django backend."
      >
        <form className="tourist-record-form" onSubmit={submitDestination}>
          <div className="tourist-record-grid">
            <DestinationField
              label="Destination Name"
              value={destinationForm.resort_name}
              onChange={(value) => updateFormField("resort_name", value)}
            />
            <DestinationField
              label="Type"
              value={destinationForm.type}
              onChange={(value) => updateFormField("type", value)}
            />
            <DestinationField
              label="Location"
              value={destinationForm.location}
              onChange={(value) => updateFormField("location", value)}
            />
            <DestinationField
              label="Access"
              value={destinationForm.access}
              onChange={(value) => updateFormField("access", value)}
            />
            <DestinationField
              label="Tourism Rating"
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={destinationForm.tourism_rating}
              onChange={(value) => updateFormField("tourism_rating", value)}
            />
            <DestinationField
              label="Monthly Arrivals"
              type="number"
              min="0"
              value={destinationForm.monthly_arrivals}
              onChange={(value) => updateFormField("monthly_arrivals", value)}
            />
            <DestinationField
              label="Latitude"
              type="number"
              step="0.0001"
              value={destinationForm.latitude}
              onChange={(value) => updateFormField("latitude", value)}
            />
            <DestinationField
              label="Longitude"
              type="number"
              step="0.0001"
              value={destinationForm.longitude}
              onChange={(value) => updateFormField("longitude", value)}
            />
            <label className="tourist-record-field">
              <span>Permit Status</span>
              <select
                value={destinationForm.with_mayors_permit}
                onChange={(event) =>
                  updateFormField("with_mayors_permit", event.target.value)
                }
              >
                <option value="true">With mayor's permit</option>
                <option value="false">Needs permit review</option>
              </select>
            </label>
            <DestinationField
              label="Itinerary IDs"
              value={destinationForm.itinerary_ids}
              onChange={(value) => updateFormField("itinerary_ids", value)}
            />
            <DestinationField
              label="Image Key"
              value={destinationForm.image_key}
              onChange={(value) => updateFormField("image_key", value)}
            />
            <label className="tourist-record-field">
              <span>Description</span>
              <textarea
                value={destinationForm.short_description}
                onChange={(event) =>
                  updateFormField("short_description", event.target.value)
                }
                rows={4}
              />
            </label>
          </div>

          {formError ? <p className="tourist-record-error">{formError}</p> : null}

          <div className="tourist-record-actions">
            <button
              type="button"
              className="tourist-record-cancel"
              onClick={closeModal}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="tourist-record-save" disabled={saving}>
              {saving ? "Saving..." : "Save Destination"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteCandidate)}
        onClose={() => setDeleteCandidate(null)}
        title="Delete Destination"
        description="This action removes the destination when no tourist records depend on it."
      >
        <div className="delete-record-confirm">
          <p>
            Delete <strong>{deleteCandidate?.resort_name}</strong>?
          </p>

          <div className="delete-record-actions">
            <button
              type="button"
              className="tourist-record-cancel"
              onClick={() => setDeleteCandidate(null)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="delete-record-confirm-btn"
              onClick={confirmDeleteDestination}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DestinationField({ label, value, onChange, ...inputProps }) {
  return (
    <label className="tourist-record-field">
      <span>{label}</span>
      <input
        type={inputProps.type || "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
      />
    </label>
  );
}

function formatApiErrors(details) {
  if (!details) {
    return "Unable to save destination. Please check the form values.";
  }

  if (typeof details === "string") {
    return details;
  }

  if (details.detail) {
    return details.detail;
  }

  return Object.entries(details)
    .map(([field, messages]) => {
      const text = Array.isArray(messages) ? messages.join(" ") : messages;
      return `${field}: ${text}`;
    })
    .join(" ");
}

export default DestinationManagement;
