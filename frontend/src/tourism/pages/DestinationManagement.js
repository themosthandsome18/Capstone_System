import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiCompass,
  FiDownload,
  FiEdit2,
  FiExternalLink,
  FiImage,
  FiMapPin,
  FiMessageSquare,
  FiPlus,
  FiSearch,
  FiStar,
  FiThumbsDown,
  FiThumbsUp,
  FiTrash2,
  FiUploadCloud,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import { useLocation } from "react-router-dom";
import LocationPicker from "../../shared/LocationPicker";
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
  images: [],
  monthly_arrivals: "0",
  latitude: "",
  longitude: "",
};

const emptyDestinations = [];

const gmapsMarkerIcon = new L.DivIcon({
  className: "gmaps-custom-marker",
  html: `<div style="background:#ef4444;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.3);position:relative;"><div style="width:8px;height:8px;background:white;border-radius:50%;position:absolute;top:6px;left:6px;"></div></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getResortCoordinates(destination) {
  if (!destination) return null;
  const lat =
    parseCoordinate(destination.latitude) ??
    parseCoordinate(destination.coordinates?.lat);
  const lng =
    parseCoordinate(destination.longitude) ??
    parseCoordinate(destination.coordinates?.lng);

  if (lat !== null && lng !== null) {
    return { lat, lng };
  }
  return null;
}

/**
 * Interactive Slideshow / Carousel for Resort Images
 */
function ResortImageCarousel({
  images = [],
  resortName = "",
  height = "100%",
  showControls = true,
  autoPlay = true,
}) {
  const validImages = useMemo(() => {
    return images.filter(Boolean);
  }, [images]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    setCurrentIndex(0);
  }, [images]);

  useEffect(() => {
    if (!autoPlay || validImages.length <= 1 || isHovered) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % validImages.length);
    }, 4500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoPlay, isHovered, validImages.length]);

  function prevSlide(e) {
    e?.stopPropagation();
    setCurrentIndex((prev) =>
      prev === 0 ? validImages.length - 1 : prev - 1
    );
  }

  function nextSlide(e) {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % validImages.length);
  }

  if (validImages.length === 0) {
    return (
      <div className="destination-image-fallback" style={{ height }}>
        {resortName}
      </div>
    );
  }

  const currentImage = validImages[currentIndex];

  return (
    <div
      className="resort-carousel"
      style={{ height }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img
        key={currentImage}
        src={currentImage}
        alt={`${resortName} - slide ${currentIndex + 1}`}
        className="resort-carousel-img"
      />

      {validImages.length > 1 && showControls ? (
        <>
          <span className="resort-carousel-counter">
            <FiImage size={11} />
            {currentIndex + 1} / {validImages.length}
          </span>

          <button
            type="button"
            className="resort-carousel-btn prev"
            onClick={prevSlide}
            aria-label="Previous image"
          >
            <FiChevronLeft size={18} />
          </button>

          <button
            type="button"
            className="resort-carousel-btn next"
            onClick={nextSlide}
            aria-label="Next image"
          >
            <FiChevronRight size={18} />
          </button>

          <div className="resort-carousel-dots">
            {validImages.map((_, index) => (
              <button
                key={index}
                type="button"
                className={`resort-carousel-dot ${
                  index === currentIndex ? "active" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(index);
                }}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function DestinationManagement({ initialTab }) {
  const location = useLocation();
  const {
    referenceTables,
    createResort,
    updateResort,
    deleteResort,
    uploadResortImage,
    feedbackEntries = [],
    updateFeedbackEntry,
  } = useTourismData();

  const destinations = referenceTables.resorts || emptyDestinations;

  // Tab state: "destinations" or "feedback"
  const defaultTab =
    initialTab === "feedback" || location.pathname === "/feedback"
      ? "feedback"
      : "destinations";
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Destination Management State
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  // Google Maps Style Detail Modal State
  const [selectedResortDetail, setSelectedResortDetail] = useState(null);

  // Feedback Monitoring State
  const [feedbackSearch, setFeedbackSearch] = useState("");
  const [destinationFilter, setDestinationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const [replyError, setReplyError] = useState("");

  // Lightbox / Image Preview Modal
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);
  const [galleryActionMsg, setGalleryActionMsg] = useState("");

  useEffect(() => {
    if (initialTab === "feedback" || location.pathname === "/feedback") {
      setActiveTab("feedback");
    }
  }, [initialTab, location.pathname]);

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
    filteredDestinations.reduce(
      (sum, item) => sum + Number(item.tourism_rating || 0),
      0
    ) / Math.max(filteredDestinations.length, 1)
  ).toFixed(1);

  // Feedback calculation & filtering
  const feedbackStats = useMemo(() => {
    return {
      total: feedbackEntries.length,
      positive: feedbackEntries.filter((entry) => entry.status === "positive").length,
      neutral: feedbackEntries.filter((entry) => entry.status === "neutral").length,
      negative: feedbackEntries.filter((entry) => entry.status === "negative").length,
    };
  }, [feedbackEntries]);

  const getDestinationName = useCallback(
    (id) => {
      return (
        destinations.find((resort) => String(resort.resort_id) === String(id))
          ?.resort_name || "--"
      );
    },
    [destinations]
  );

  const filteredFeedback = useMemo(() => {
    const keyword = feedbackSearch.trim().toLowerCase();
    return feedbackEntries.filter((entry) => {
      const destinationName = getDestinationName(entry.destinationId);
      const destinationMatch =
        !destinationFilter || String(entry.destinationId) === String(destinationFilter);
      const statusMatch = !statusFilter || entry.status === statusFilter;
      const searchText = [
        entry.reviewer,
        entry.title,
        entry.message,
        entry.reply,
        entry.status,
        destinationName,
        entry.date,
      ]
        .join(" ")
        .toLowerCase();

      return destinationMatch && statusMatch && searchText.includes(keyword);
    });
  }, [destinationFilter, feedbackEntries, feedbackSearch, getDestinationName, statusFilter]);

  // Feedback for the clicked resort detail
  const selectedResortFeedback = useMemo(() => {
    if (!selectedResortDetail) return [];
    return feedbackEntries.filter(
      (entry) => String(entry.destinationId) === String(selectedResortDetail.resort_id)
    );
  }, [feedbackEntries, selectedResortDetail]);

  const selectedResortCoordinates = useMemo(() => {
    return getResortCoordinates(selectedResortDetail);
  }, [selectedResortDetail]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openAddDestination() {
    setEditingDestination(null);
    setForm({ ...initialForm, images: [] });
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditDestination(destination) {
    setEditingDestination(destination);
    const existingImages = Array.isArray(destination.images)
      ? [...destination.images]
      : destination.image
      ? [destination.image]
      : [];

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
      images: existingImages,
      monthly_arrivals: String(destination.monthly_arrivals || 0),
      latitude: String(destination.latitude || destination.coordinates?.lat || ""),
      longitude: String(destination.longitude || destination.coordinates?.lng || ""),
    });
    setFormError("");
    setIsFormOpen(true);
  }

  async function handleImageUploadChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setUploadingImages(true);
    setFormError("");

    try {
      const newUrls = [];
      for (const file of files) {
        if (uploadResortImage) {
          const res = await uploadResortImage(file);
          if (res?.urls && Array.isArray(res.urls)) {
            newUrls.push(...res.urls);
          } else if (res?.url) {
            newUrls.push(res.url);
          }
        }
      }

      if (newUrls.length) {
        setForm((prev) => ({
          ...prev,
          images: [...(prev.images || []), ...newUrls],
        }));
      }
    } catch (err) {
      setFormError("Failed to upload image. Please try again.");
    } finally {
      setUploadingImages(false);
      event.target.value = "";
    }
  }

  function removeFormImage(index) {
    setForm((prev) => ({
      ...prev,
      images: (prev.images || []).filter((_, i) => i !== index),
    }));
  }

  function parseItineraryIds(value) {
    if (!value.trim()) return [];
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
      images: form.images || [],
      monthly_arrivals: Number(form.monthly_arrivals || 0),
      latitude: Number(form.latitude || 0),
      longitude: Number(form.longitude || 0),
    };
  }

  function validatePayload(payload) {
    if (!payload.resort_name) return "Destination name is required.";
    if (!payload.type) return "Destination type is required.";
    if (!payload.location) return "Location is required.";
    if (!payload.short_description) return "Short description is required.";
    if (!payload.access) return "Access type is required.";
    if (!payload.latitude || !payload.longitude) {
      return "Latitude and longitude are required for GIS mapping.";
    }
    return "";
  }

  function getErrorMessage(error) {
    if (error?.details?.detail) return error.details.detail;
    if (error?.details && typeof error.details === "object") {
      return Object.entries(error.details)
        .map(([field, messages]) => {
          const text = Array.isArray(messages) ? messages.join(" ") : messages;
          return `${field}: ${text}`;
        })
        .join(" ");
    }
    return error?.message || "An error occurred. Please try again.";
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
        const updated = await updateResort(editingDestination.resort_id, payload);
        if (selectedResortDetail?.resort_id === editingDestination.resort_id) {
          setSelectedResortDetail(updated);
        }
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
    if (!deleteTarget) return;

    setSaving(true);
    setDeleteError("");

    try {
      await deleteResort(deleteTarget.resort_id);
      if (selectedResortDetail?.resort_id === deleteTarget.resort_id) {
        setSelectedResortDetail(null);
      }
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function openReply(entry) {
    setReplyingId(entry.id);
    setReplyText(entry.reply || "");
    setReplyError("");
  }

  function closeReply() {
    setReplyingId(null);
    setReplyText("");
    setReplyError("");
  }

  async function saveReply(entry) {
    if (!replyText.trim()) {
      setReplyError("Reply message cannot be empty.");
      return;
    }

    setSavingReply(true);
    setReplyError("");

    try {
      await updateFeedbackEntry(entry.id, { reply: replyText.trim() });
      closeReply();
    } catch (error) {
      setReplyError(getErrorMessage(error));
    } finally {
      setSavingReply(false);
    }
  }

  function downloadPhoto(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "tourist_feedback_photo.jpg";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function addPhotoToResortGallery(photoUrl, destinationId) {
    const targetResort = destinations.find(
      (d) => String(d.resort_id) === String(destinationId)
    );
    if (!targetResort) {
      alert("Destination not found.");
      return;
    }

    const existingImages = Array.isArray(targetResort.images)
      ? [...targetResort.images]
      : targetResort.image
      ? [targetResort.image]
      : [];

    if (existingImages.includes(photoUrl)) {
      setGalleryActionMsg(`Photo is already included in ${targetResort.resort_name} images.`);
      setTimeout(() => setGalleryActionMsg(""), 3500);
      return;
    }

    try {
      const updatedImages = [...existingImages, photoUrl];
      const updated = await updateResort(targetResort.resort_id, {
        ...targetResort,
        images: updatedImages,
      });

      if (selectedResortDetail?.resort_id === targetResort.resort_id) {
        setSelectedResortDetail(updated);
      }

      setGalleryActionMsg(`✓ Photo successfully added to ${targetResort.resort_name} slideshow!`);
      setTimeout(() => setGalleryActionMsg(""), 4000);
    } catch (err) {
      alert("Failed to add photo to resort: " + (err.message || "Unknown error"));
    }
  }

  return (
    <div className="destination-page">
      {/* Toast message for gallery promotion */}
      {galleryActionMsg ? (
        <div className="fixed top-5 right-5 z-[100] rounded-xl bg-green-700 px-5 py-3 text-sm font-bold text-white shadow-2xl animate-bounce">
          {galleryActionMsg}
        </div>
      ) : null}

      {/* Header & Tabs */}
      <div className="destination-header">
        <div>
          <h1>Destinations & Feedback</h1>
          <p>
            Manage resort images & mobile slideshow, explore spots, and monitor tourist reviews
          </p>
        </div>

        {activeTab === "destinations" ? (
          <button
            type="button"
            className="destination-add-btn"
            onClick={openAddDestination}
          >
            <FiMapPin />
            Add Destination
          </button>
        ) : null}
      </div>

      {/* Top Tab Switcher */}
      <div className="destination-top-tabs">
        <button
          type="button"
          className={`destination-tab-btn ${activeTab === "destinations" ? "active" : ""}`}
          onClick={() => setActiveTab("destinations")}
        >
          <FiMapPin size={16} />
          <span>Destinations ({destinations.length})</span>
        </button>

        <button
          type="button"
          className={`destination-tab-btn ${activeTab === "feedback" ? "active" : ""}`}
          onClick={() => setActiveTab("feedback")}
        >
          <FiMessageSquare size={16} />
          <span>Feedback Monitoring ({feedbackEntries.length})</span>
        </button>
      </div>

      {/* TAB 1: DESTINATIONS GRID */}
      {activeTab === "destinations" ? (
        <>
          <div className="destination-search">
            <input
              type="search"
              placeholder="Search destinations by name, type, location..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="destination-grid">
            {filteredDestinations.map((destination) => {
              const resortImages =
                destination.images && destination.images.length > 0
                  ? destination.images
                  : destination.image
                  ? [destination.image]
                  : [];

              return (
                <div
                  key={destination.resort_id}
                  className="destination-card clickable"
                  onClick={() => setSelectedResortDetail(destination)}
                  title="Click to view Google Maps style details and slideshow"
                >
                  <div className="destination-image">
                    <ResortImageCarousel
                      images={resortImages}
                      resortName={destination.resort_name}
                      height="170px"
                      showControls={resortImages.length > 1}
                    />

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
                        <p>PHOTOS</p>
                        <h4>{resortImages.length || 1}</h4>
                        <span>in slideshow</span>
                      </div>
                    </div>

                    <div className="destination-action-row" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="destination-view-btn"
                        onClick={() => setSelectedResortDetail(destination)}
                        title="View Details & Slideshow"
                      >
                        <FiExternalLink />
                        Details
                      </button>

                      <button
                        type="button"
                        className="destination-edit-btn"
                        onClick={() => openEditDestination(destination)}
                        title="Edit Destination & Images"
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
                        title="Delete Destination"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="destination-footer">
            <p>
              SHOWING: <strong>{filteredDestinations.length}</strong> /{" "}
              <strong>{destinations.length}</strong> destinations
            </p>

            <p>
              Average Ratings: <FiStar /> <strong>{averageRating}</strong>
            </p>
          </div>
        </>
      ) : null}

      {/* TAB 2: FEEDBACK MONITORING */}
      {activeTab === "feedback" ? (
        <div className="feedback-page">
          <div className="feedback-stats">
            <FeedbackStatCard title="Total Feedback" value={feedbackStats.total} />
            <FeedbackStatCard title="Positive" value={feedbackStats.positive} icon={<FiThumbsUp />} />
            <FeedbackStatCard title="Neutral" value={feedbackStats.neutral} />
            <FeedbackStatCard title="Negative" value={feedbackStats.negative} icon={<FiThumbsDown />} />
          </div>

          <div className="feedback-filters">
            <div className="feedback-search">
              <FiSearch />
              <input
                type="search"
                placeholder="Search reviewer, destination, message, or reply..."
                value={feedbackSearch}
                onChange={(event) => setFeedbackSearch(event.target.value)}
              />
            </div>

            <select
              value={destinationFilter}
              onChange={(event) => setDestinationFilter(event.target.value)}
              aria-label="Filter by destination"
            >
              <option value="">All Destinations ({destinations.length})</option>
              {destinations.map((resort) => (
                <option key={resort.resort_id} value={resort.resort_id}>
                  {resort.resort_name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by sentiment"
            >
              <option value="">All Sentiment</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </div>

          {replyError ? <p className="tourist-record-error">{replyError}</p> : null}

          <div className="feedback-list">
            {filteredFeedback.length ? (
              filteredFeedback.map((entry) => (
                <div key={entry.id} className="feedback-card">
                  <div className="feedback-left">
                    <h3>{entry.reviewer}</h3>

                    <p className="meta">
                      {getDestinationName(entry.destinationId)} | {entry.date}
                    </p>

                    <div className="stars" aria-label={`${entry.rating} of 5 stars`}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <FiStar
                          key={index}
                          className={index < Number(entry.rating || 0) ? "filled" : "muted"}
                        />
                      ))}
                    </div>

                    <p className="feedback-title">{entry.title}</p>
                    <p className="message">{entry.message}</p>

                    {/* Attached Photos from Mobile */}
                    {entry.photos && entry.photos.length > 0 ? (
                      <div className="feedback-photos-wrapper">
                        <span className="feedback-photos-label">
                          Attached Photos ({entry.photos.length}):
                        </span>
                        <div className="feedback-photo-grid">
                          {entry.photos.map((photo, idx) => (
                            <div key={idx} className="feedback-photo-item">
                              <img
                                src={photo}
                                alt={`Tourist review submission ${idx + 1}`}
                                onClick={() => setPreviewPhotoUrl(photo)}
                                title="Click to view full size"
                              />
                              <div className="feedback-photo-actions">
                                <button
                                  type="button"
                                  className="photo-action-btn download"
                                  onClick={() => downloadPhoto(photo, `review_photo_${entry.id}_${idx + 1}.jpg`)}
                                  title="Download to PC"
                                >
                                  <FiDownload size={10} />
                                  Download
                                </button>
                                <button
                                  type="button"
                                  className="photo-action-btn promote"
                                  onClick={() => addPhotoToResortGallery(photo, entry.destinationId)}
                                  title="Add to Resort Gallery & Slideshow"
                                >
                                  <FiPlus size={10} />
                                  Add to Resort
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {entry.reply ? (
                      <div className="feedback-reply">
                        <strong>Office reply</strong>
                        <p>{entry.reply}</p>
                      </div>
                    ) : null}

                    {replyingId === entry.id ? (
                      <div className="feedback-reply-form">
                        <textarea
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                          rows={3}
                          placeholder="Write an office reply..."
                        />

                        <div>
                          <button
                            type="button"
                            className="tourist-record-cancel"
                            onClick={closeReply}
                            disabled={savingReply}
                          >
                            Cancel
                          </button>

                          <button
                            type="button"
                            className="tourist-record-save"
                            onClick={() => saveReply(entry)}
                            disabled={savingReply}
                          >
                            {savingReply ? "Saving..." : "Save Reply"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="feedback-right">
                    <span className={`status ${entry.status}`}>
                      {entry.status}
                    </span>

                    <button
                      type="button"
                      className="reply-btn"
                      onClick={() => openReply(entry)}
                    >
                      <FiMessageSquare size={12} />
                      {entry.reply ? "Edit Reply" : "Reply"}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="feedback-empty">
                No feedback found for the selected filters.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* GOOGLE MAPS STYLE RESORT DETAIL MODAL */}
      {selectedResortDetail ? (
        <div
          className="gmaps-modal-backdrop"
          onClick={() => setSelectedResortDetail(null)}
        >
          <div
            className="gmaps-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Hero Cover Slideshow */}
            <div className="gmaps-modal-hero">
              <ResortImageCarousel
                images={
                  selectedResortDetail.images && selectedResortDetail.images.length > 0
                    ? selectedResortDetail.images
                    : selectedResortDetail.image
                    ? [selectedResortDetail.image]
                    : []
                }
                resortName={selectedResortDetail.resort_name}
                height="240px"
              />
              <div className="gmaps-modal-hero-overlay" />

              <button
                type="button"
                className="gmaps-close-btn"
                onClick={() => setSelectedResortDetail(null)}
                aria-label="Close details"
              >
                <FiX size={18} />
              </button>

              <div className="gmaps-hero-badges">
                <span
                  className={`gmaps-permit-badge ${
                    selectedResortDetail.with_mayors_permit ? "active" : "unverified"
                  }`}
                >
                  {selectedResortDetail.with_mayors_permit
                    ? "✓ Verified Mayor's Permit"
                    : "No Mayor's Permit"}
                </span>
                <span className="gmaps-type-badge">{selectedResortDetail.type}</span>
              </div>
            </div>

            {/* Modal Body */}
            <div className="gmaps-modal-content">
              {/* Title & Stars */}
              <div className="gmaps-title-section">
                <h2>{selectedResortDetail.resort_name}</h2>
                <div className="gmaps-rating-row">
                  <div className="gmaps-stars">
                    <span className="gmaps-rating-num">
                      {selectedResortDetail.tourism_rating || "0.0"}
                    </span>
                    <div className="gmaps-star-icons">
                      {Array.from({ length: 5 }, (_, i) => (
                        <FiStar
                          key={i}
                          className={
                            i < Math.round(Number(selectedResortDetail.tourism_rating || 0))
                              ? "star-gold"
                              : "star-gray"
                          }
                          size={14}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="gmaps-review-count">
                    ({selectedResortFeedback.length} tourist reviews)
                  </span>
                  <span className="gmaps-access-tag">
                    • Access: {selectedResortDetail.access}
                  </span>
                </div>
              </div>

              {/* Quick Actions Bar */}
              <div className="gmaps-quick-actions">
                {selectedResortCoordinates ? (
                  <button
                    type="button"
                    className="gmaps-action-btn primary"
                    onClick={() => {
                      const url = `https://www.google.com/maps/search/?api=1&query=${selectedResortCoordinates.lat},${selectedResortCoordinates.lng}`;
                      window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <FiMapPin /> Open in Google Maps
                  </button>
                ) : null}

                <button
                  type="button"
                  className="gmaps-action-btn"
                  onClick={() => {
                    const el = document.getElementById("gmaps-resort-reviews");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <FiMessageSquare /> Reviews ({selectedResortFeedback.length})
                </button>

                <button
                  type="button"
                  className="gmaps-action-btn"
                  onClick={() => {
                    const toEdit = selectedResortDetail;
                    setSelectedResortDetail(null);
                    openEditDestination(toEdit);
                  }}
                >
                  <FiEdit2 /> Edit / Add Photos
                </button>
              </div>

              {/* Info Items List */}
              <div className="gmaps-info-list">
                <div className="gmaps-info-item">
                  <FiMapPin className="gmaps-info-icon" />
                  <div>
                    <p className="gmaps-info-label">Address & Location</p>
                    <p className="gmaps-info-val">{selectedResortDetail.location}</p>
                  </div>
                </div>

                <div className="gmaps-info-item">
                  <FiCompass className="gmaps-info-icon" />
                  <div>
                    <p className="gmaps-info-label">Coordinates</p>
                    <p className="gmaps-info-val">
                      {selectedResortCoordinates
                        ? `${selectedResortCoordinates.lat.toFixed(5)}° N, ${selectedResortCoordinates.lng.toFixed(5)}° E`
                        : "Coordinates not specified"}
                    </p>
                  </div>
                </div>

                <div className="gmaps-info-item">
                  <FiUsers className="gmaps-info-icon" />
                  <div>
                    <p className="gmaps-info-label">Monthly Tourist Arrivals</p>
                    <p className="gmaps-info-val">
                      {Number(selectedResortDetail.monthly_arrivals || 0).toLocaleString()} tourists
                    </p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="gmaps-section">
                <h3>About This Destination</h3>
                <p className="gmaps-description">
                  {selectedResortDetail.short_description || "No description provided for this destination."}
                </p>
              </div>

              {/* Interactive Mini-Map Preview */}
              {selectedResortCoordinates ? (
                <div className="gmaps-section">
                  <h3>Location Map Preview</h3>
                  <div className="gmaps-map-preview-wrap">
                    <MapContainer
                      center={[selectedResortCoordinates.lat, selectedResortCoordinates.lng]}
                      zoom={14}
                      scrollWheelZoom={false}
                      style={{ height: "190px", width: "100%" }}
                    >
                      <TileLayer
                        url="http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
                        attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
                      />
                      <Marker
                        position={[selectedResortCoordinates.lat, selectedResortCoordinates.lng]}
                        icon={gmapsMarkerIcon}
                      >
                        <Popup>{selectedResortDetail.resort_name}</Popup>
                      </Marker>
                    </MapContainer>
                  </div>
                </div>
              ) : null}

              {/* Ratings & Reviews for this resort */}
              <div className="gmaps-section" id="gmaps-resort-reviews">
                <div className="gmaps-reviews-header">
                  <h3>Visitor Reviews ({selectedResortFeedback.length})</h3>
                  <button
                    type="button"
                    className="gmaps-view-all-reviews-btn"
                    onClick={() => {
                      const id = selectedResortDetail.resort_id;
                      setSelectedResortDetail(null);
                      setActiveTab("feedback");
                      setDestinationFilter(String(id));
                    }}
                  >
                    View in Feedback Hub &rarr;
                  </button>
                </div>

                {selectedResortFeedback.length > 0 ? (
                  <div className="gmaps-reviews-list">
                    {selectedResortFeedback.map((feedback) => (
                      <div key={feedback.id} className="gmaps-review-card">
                        <div className="gmaps-review-card-top">
                          <div>
                            <strong>{feedback.reviewer}</strong>
                            <span className="gmaps-review-date">{feedback.date}</span>
                          </div>

                          <div className="gmaps-review-badge-stars">
                            <span className={`status ${feedback.status}`}>
                              {feedback.status}
                            </span>
                            <div className="stars-mini" style={{ display: "flex", gap: "2px" }}>
                              {Array.from({ length: 5 }, (_, i) => (
                                <FiStar
                                  key={i}
                                  className={
                                    i < Number(feedback.rating || 0)
                                      ? "star-gold"
                                      : "star-gray"
                                  }
                                  size={12}
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        {feedback.title ? (
                          <p className="gmaps-review-title">{feedback.title}</p>
                        ) : null}
                        <p className="gmaps-review-msg">{feedback.message}</p>

                        {/* Review Photos in modal */}
                        {feedback.photos && feedback.photos.length > 0 ? (
                          <div className="feedback-photos-wrapper">
                            <span className="feedback-photos-label">
                              Attached Photos ({feedback.photos.length}):
                            </span>
                            <div className="feedback-photo-grid">
                              {feedback.photos.map((photo, idx) => (
                                <div key={idx} className="feedback-photo-item">
                                  <img
                                    src={photo}
                                    alt={`Review submission ${idx + 1}`}
                                    onClick={() => setPreviewPhotoUrl(photo)}
                                    title="Click to view full size"
                                  />
                                  <div className="feedback-photo-actions">
                                    <button
                                      type="button"
                                      className="photo-action-btn download"
                                      onClick={() => downloadPhoto(photo, `review_photo_${feedback.id}_${idx + 1}.jpg`)}
                                      title="Download to PC"
                                    >
                                      <FiDownload size={10} />
                                      Download
                                    </button>
                                    <button
                                      type="button"
                                      className="photo-action-btn promote"
                                      onClick={() => addPhotoToResortGallery(photo, selectedResortDetail.resort_id)}
                                      title="Add to this Resort's Slideshow"
                                    >
                                      <FiPlus size={10} />
                                      Add to Resort
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {feedback.reply ? (
                          <div className="gmaps-review-reply">
                            <small>Tourism Office Reply:</small>
                            <p>{feedback.reply}</p>
                          </div>
                        ) : null}

                        {replyingId === feedback.id ? (
                          <div className="feedback-reply-form" style={{ marginTop: "10px" }}>
                            <textarea
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              rows={2}
                              placeholder="Write reply..."
                            />
                            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "6px" }}>
                              <button
                                type="button"
                                className="tourist-record-cancel"
                                onClick={closeReply}
                                disabled={savingReply}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="tourist-record-save"
                                onClick={() => saveReply(feedback)}
                                disabled={savingReply}
                              >
                                {savingReply ? "Saving..." : "Save Reply"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: "8px" }}>
                            <button
                              type="button"
                              className="text-xs text-blue-600 font-semibold hover:underline"
                              onClick={() => openReply(feedback)}
                            >
                              {feedback.reply ? "Edit Reply" : "Reply to Feedback"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "#64748b", fontSize: "13px", padding: "12px 0" }}>
                    No reviews submitted for this resort yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Photo Lightbox / Preview Modal */}
      {previewPhotoUrl ? (
        <div
          className="fixed inset-0 z-[99] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewPhotoUrl}
              alt="Preview"
              className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            />
            <button
              type="button"
              className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/90"
              onClick={() => setPreviewPhotoUrl(null)}
            >
              <FiX size={20} />
            </button>
            <div className="mt-3 flex justify-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-bold text-slate-900 shadow hover:bg-slate-100"
                onClick={() => downloadPhoto(previewPhotoUrl, "tourist_photo.jpg")}
              >
                <FiDownload /> Download Photo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit / Add Destination Modal with Image Uploader */}
      {isFormOpen ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10">
          <form
            className="tourist-record-form w-full max-w-[720px]"
            onSubmit={handleSubmit}
          >
            <h2 className="mb-6 text-xl font-extrabold text-black">
              {editingDestination ? "Edit Destination & Images" : "Add Destination"}
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
                placeholder="dona-choleng-camping-resort, aquazul-hotel-and-resort"
                value={form.image_key}
                onChange={(value) => updateField("image_key", value)}
              />

              {/* Upload Multiple Resort Images (Slideshow) */}
              <div className="col-span-full">
                <span className="block mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                  Resort Slideshow Images ({form.images?.length || 0})
                </span>

                <label className="image-upload-dropzone">
                  <FiUploadCloud size={28} className="text-green-600 mb-1" />
                  <span className="text-xs font-bold text-slate-700">
                    {uploadingImages ? "Uploading images..." : "Click or drag photos to upload for mobile slideshow"}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Supports JPG, PNG, WEBP. Uploaded images will rotate in the mobile carousel.
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImages}
                    onChange={handleImageUploadChange}
                  />
                </label>

                {form.images && form.images.length > 0 ? (
                  <div className="image-upload-preview-grid">
                    {form.images.map((imgUrl, index) => (
                      <div key={index} className="image-preview-card">
                        <img src={imgUrl} alt={`Resort item ${index + 1}`} />
                        <button
                          type="button"
                          className="image-preview-remove-btn"
                          onClick={() => removeFormImage(index)}
                          title="Remove image"
                        >
                          <FiX size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

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

              <LocationPicker
                label="Destination Map Pin"
                latitude={form.latitude}
                longitude={form.longitude}
                onChange={updateField}
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
                disabled={saving || uploadingImages}
                onClick={() => setIsFormOpen(false)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="tourist-record-save"
                disabled={saving || uploadingImages}
              >
                {saving ? "Saving..." : "Save Destination"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Delete Destination Modal */}
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

function FeedbackStatCard({ title, value, icon }) {
  return (
    <div className="feedback-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>
      {icon ? <div className="icon">{icon}</div> : null}
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
