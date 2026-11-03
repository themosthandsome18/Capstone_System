import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiChevronLeft,
  FiCheck,
  FiChevronRight,
  FiDownload,
  FiEdit2,
  FiExternalLink,
  FiEye,
  FiEyeOff,
  FiImage,
  FiMapPin,
  FiMessageSquare,
  FiPlus,
  FiSearch,
  FiStar,
  FiThumbsDown,
  FiThumbsUp,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import { useLocation } from "react-router-dom";
import LocationPicker from "../../shared/LocationPicker";
import { useTourismData } from "../context/TourismDataContext";

const initialForm = {
  resort_name: "",
  is_active: true,
  with_mayors_permit: true,
  type: "",
  location: "",
  short_description: "",
  access: "",
  itinerary_ids: [],
  image_key: "",
  images: [],
  latitude: "",
  longitude: "",
};

const emptyDestinations = [];
const emptyOptions = [];

// The rating is the average of the reviews that count, so until there is one there is nothing to show: not 0.0.
export const NO_RATINGS = "No ratings yet";
export const NONE_RECORDED = "None recorded yet";

// How many reviews stand behind the rating. An older server does not say; then a rating above 0 means there is at least one.
export function reviewCountOf(destination, fallback) {
  const given = destination?.review_count;
  if (given !== undefined && given !== null) return Number(given);
  if (fallback !== undefined) return fallback;
  return Number(destination?.tourism_rating || 0) > 0 ? 1 : 0;
}

export function ratingOf(destination) {
  return reviewCountOf(destination) > 0 ? Number(destination.tourism_rating).toFixed(1) : NO_RATINGS;
}

export function ratingSummary(destination, reviews) {
  const count = reviewCountOf(destination, reviews);
  if (count <= 0) return NO_RATINGS;
  return `${Number(destination.tourism_rating).toFixed(1)} from ${count} ${count === 1 ? "review" : "reviews"}`;
}

// Arrivals are people, written as visitors.
export function visitorsText(value) {
  const people = Number(value || 0);
  return `${people.toLocaleString()} ${people === 1 ? "visitor" : "visitors"}`;
}

export function reviewsText(count) {
  return `${count} ${count === 1 ? "review" : "reviews"}`;
}

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
    uploadResortImage,
    feedbackEntries = [],
    updateFeedbackEntry,
    hideFeedbackEntry,
    unhideFeedbackEntry,
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

  // Google Maps Style Detail Modal State
  const [selectedResortDetail, setSelectedResortDetail] = useState(null);

  // Feedback Monitoring State
  const [feedbackSearch, setFeedbackSearch] = useState("");
  const [destinationFilter, setDestinationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [moderatingId, setModeratingId] = useState(null);
  const [moderationError, setModerationError] = useState("");
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

  // "Open destination" of an arrival (Arrival Monitoring) comes here with the id of the resort: open its Details, once for that visit.
  const openedFromVisit = useRef(null);
  useEffect(() => {
    const wanted = location.state?.openResortId;
    if (wanted === null || wanted === undefined || openedFromVisit.current === location.key) return;
    const found = destinations.find((destination) => String(destination.resort_id) === String(wanted));
    if (!found) return;
    openedFromVisit.current = location.key;
    setActiveTab("destinations");
    setSelectedResortDetail(found);
  }, [location.state, location.key, destinations]);

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

  // Only the destinations that have a review: one with none is not a 0.0 to average in.
  const ratedDestinations = filteredDestinations.filter((item) => reviewCountOf(item) > 0);
  const averageRating = ratedDestinations.length
    ? (
        ratedDestinations.reduce((sum, item) => sum + Number(item.tourism_rating || 0), 0) /
        ratedDestinations.length
      ).toFixed(1)
    : NO_RATINGS;

  // The Length of Stay options an admin can pick for a destination: the active ones, and any already picked that was retired.
  const itineraryOptions = referenceTables.itineraries || emptyOptions;
  const stayChoices = useMemo(() => {
    const picked = new Set(form.itinerary_ids || []);
    const known = new Set(itineraryOptions.map((option) => Number(option.id)));
    const shown = itineraryOptions
      .filter((option) => option.is_active !== false || picked.has(Number(option.id)))
      .map((option) => ({ id: Number(option.id), name: option.name }));
    // An id the options no longer list stays visible, so saving does not drop it without anyone seeing it.
    const unknown = [...picked].filter((id) => !known.has(id)).map((id) => ({ id, name: `Option ${id}` }));
    return [...shown, ...unknown];
  }, [itineraryOptions, form.itinerary_ids]);

  // Feedback calculation & filtering.
  //
  // COUNTING RULE (item #17): a count must match what is shown beside it.
  //  - Total / Positive / Neutral / Negative sit next to the destination's
  //    stars, and the stars no longer include a hidden review, so these
  //    count the VISIBLE reviews only. The hidden ones have their own "Hidden"
  //    count.
  //  - The tab count "Feedback Monitoring (N)" counts ALL of them, because the
  //    list under that tab shows the hidden ones too (marked); a count that
  //    differed from the list would look broken.
  const feedbackStats = useMemo(() => {
    const visible = feedbackEntries.filter((entry) => !entry.is_hidden);
    return {
      total: visible.length,
      positive: visible.filter((entry) => entry.status === "positive").length,
      neutral: visible.filter((entry) => entry.status === "neutral").length,
      negative: visible.filter((entry) => entry.status === "negative").length,
      hidden: feedbackEntries.length - visible.length,
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
      const visibilityMatch =
        visibilityFilter === "all" ||
        (visibilityFilter === "hidden" ? Boolean(entry.is_hidden) : !entry.is_hidden);
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

      return (
        destinationMatch &&
        statusMatch &&
        visibilityMatch &&
        searchText.includes(keyword)
      );
    });
  }, [
    destinationFilter,
    feedbackEntries,
    feedbackSearch,
    getDestinationName,
    statusFilter,
    visibilityFilter,
  ]);

  // Feedback for the clicked resort detail. Same counting rule as the stat
  // cards above: this modal sits next to the destination's stars, so a hidden
  // review is NOT in its list or its count; the hidden ones are counted
  // apart (selectedResortHiddenCount).
  const selectedResortAllFeedback = useMemo(() => {
    if (!selectedResortDetail) return [];
    return feedbackEntries.filter(
      (entry) => String(entry.destinationId) === String(selectedResortDetail.resort_id)
    );
  }, [feedbackEntries, selectedResortDetail]);

  const selectedResortFeedback = useMemo(
    () => selectedResortAllFeedback.filter((entry) => !entry.is_hidden),
    [selectedResortAllFeedback]
  );

  const selectedResortHiddenCount =
    selectedResortAllFeedback.length - selectedResortFeedback.length;

  // The photos the slideshow really has (the card's "PHOTOS" shows 1 for none, for its placeholder; this is the real count).
  const selectedResortPhotoCount = selectedResortDetail
    ? Array.isArray(selectedResortDetail.images) && selectedResortDetail.images.length > 0
      ? selectedResortDetail.images.length
      : selectedResortDetail.image
      ? 1
      : 0
    : 0;

  // The names of the Length of Stay options this destination offers, for the chips in Details.
  const selectedResortStays = useMemo(() => {
    const ids = Array.isArray(selectedResortDetail?.itinerary_ids) ? selectedResortDetail.itinerary_ids : [];
    return ids.map((id) => {
      const found = itineraryOptions.find((option) => Number(option.id) === Number(id));
      return { id: Number(id), name: found ? found.name : `Option ${id}` };
    });
  }, [selectedResortDetail, itineraryOptions]);

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
      is_active: destination.is_active !== false,
      with_mayors_permit: Boolean(destination.with_mayors_permit),
      type: destination.type || "",
      location: destination.location || "",
      short_description: destination.short_description || "",
      access: destination.access || "",
      itinerary_ids: Array.isArray(destination.itinerary_ids)
        ? destination.itinerary_ids.map(Number).filter((id) => !Number.isNaN(id))
        : [],
      image_key: destination.image_key || "",
      images: existingImages,
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

  function toggleItinerary(id) {
    setForm((current) => {
      const picked = current.itinerary_ids || [];
      return {
        ...current,
        itinerary_ids: picked.includes(id)
          ? picked.filter((item) => item !== id)
          : [...picked, id].sort((a, b) => a - b),
      };
    });
  }

  // The rating and the arrivals are worked out by the server, so they are not sent.
  function buildPayload() {
    return {
      resort_name: form.resort_name.trim(),
      is_active: Boolean(form.is_active),
      with_mayors_permit: Boolean(form.with_mayors_permit),
      type: form.type.trim(),
      location: form.location.trim(),
      short_description: form.short_description.trim(),
      access: form.access.trim(),
      itinerary_ids: form.itinerary_ids || [],
      image_key: form.image_key.trim(),
      images: form.images || [],
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

  async function toggleHidden(entry) {
    setModeratingId(entry.id);
    setModerationError("");

    try {
      if (entry.is_hidden) {
        await unhideFeedbackEntry(entry.id);
      } else {
        await hideFeedbackEntry(entry.id);
      }
    } catch (error) {
      setModerationError(
        error?.details?.detail ||
          error?.message ||
          "Unable to change the review. Please try again."
      );
    } finally {
      setModeratingId(null);
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
          {/* ALL reviews, hidden included: the list under this tab shows them. */}
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
                      {reviewCountOf(destination) > 0 ? <FiStar /> : null}
                      {ratingOf(destination)}
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
                          destination.is_active === false ? "maintenance" : "active"
                        }`}
                      >
                        {destination.is_active === false ? "Inactive" : "Active"}
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
              Average Ratings: {ratedDestinations.length ? <FiStar /> : null} <strong>{averageRating}</strong>
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
            <FeedbackStatCard title="Hidden" value={feedbackStats.hidden} icon={<FiEyeOff />} />
          </div>

          <p className="feedback-hide-note">
            Hidden reviews don't show in the app and don't count in the destination's rating.
          </p>

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

            <select
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value)}
              aria-label="Filter by visibility"
            >
              <option value="all">All visibility</option>
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>

          {replyError ? <p className="tourist-record-error">{replyError}</p> : null}
          {moderationError ? (
            <p className="tourist-record-error">{moderationError}</p>
          ) : null}

          <div className="feedback-list">
            {filteredFeedback.length ? (
              filteredFeedback.map((entry) => (
                <div
                  key={entry.id}
                  className={`feedback-card${entry.is_hidden ? " feedback-card-hidden" : ""}`}
                >
                  <div className="feedback-left">
                    <h3>
                      {entry.reviewer}
                      {entry.is_hidden ? (
                        <span className="feedback-hidden-badge">Hidden</span>
                      ) : null}
                    </h3>

                    {entry.is_hidden ? (
                      <p className="feedback-hidden-by">
                        Hidden by {entry.hidden_by_display || "Deleted user"} on{" "}
                        {entry.hidden_at
                          ? new Date(entry.hidden_at).toLocaleString()
                          : "--"}
                      </p>
                    ) : null}

                    {entry.is_hidden && entry.photos && entry.photos.length > 0 ? (
                      <p className="feedback-hidden-photo-warning" role="note">
                        The photo link stays reachable to anyone who already has it.
                        Hiding removes the review from the app, not the photo from
                        storage.
                      </p>
                    ) : null}

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

                    <button
                      type="button"
                      className="reply-btn"
                      onClick={() => toggleHidden(entry)}
                      disabled={moderatingId === entry.id}
                    >
                      {entry.is_hidden ? <FiEye size={12} /> : <FiEyeOff size={12} />}
                      {entry.is_hidden ? "Show again" : "Hide"}
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
                height="100%"
              />
              <div className="gmaps-modal-hero-overlay" />

              <div className="dest-hero-chips">
                <span
                  className={`dest-chip-status${selectedResortDetail.is_active === false ? " inactive" : ""}`}
                >
                  {selectedResortDetail.is_active === false ? null : <FiCheck size={13} aria-hidden="true" />}
                  {selectedResortDetail.is_active === false ? "Inactive" : "Active"}
                </span>
                <span className="dest-chip-category">{selectedResortDetail.type}</span>
              </div>

              <button
                type="button"
                className="dest-close-round"
                onClick={() => setSelectedResortDetail(null)}
                aria-label="Close details"
              >
                <FiX size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="gmaps-modal-content dest-details-body">
              <h2 className="dest-details-name">{selectedResortDetail.resort_name}</h2>
              <p className="dest-details-sub">
                {String(selectedResortDetail.location || "").split(",")[0].trim() || "Mauban"}
                {" · "}
                {selectedResortDetail.with_mayors_permit ? "Mayor's permit verified" : "No Mayor's permit"}
              </p>

              <div className="gmaps-quick-actions">
                {selectedResortCoordinates ? (
                  <button
                    type="button"
                    className="gmaps-action-btn primary dest-btn-orange"
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
                  <FiEdit2 /> Edit / Add photos
                </button>
              </div>

              <section className="dest-detail-group">
                <h3>What the records say</h3>
                <div className="dest-facts">
                  <div className="dest-fact">
                    <span className="dest-label">Tourist rating</span>
                    <span className="dest-value">
                      {ratingSummary(selectedResortDetail, selectedResortFeedback.length)}
                    </span>
                  </div>
                  <div className="dest-fact">
                    <span className="dest-label">Arrivals this month</span>
                    <span className="dest-value">{visitorsText(selectedResortDetail.monthly_arrivals)}</span>
                  </div>
                  <div className="dest-fact">
                    <span className="dest-label">Arrivals this year</span>
                    <span className="dest-value">{visitorsText(selectedResortDetail.yearly_arrivals)}</span>
                  </div>
                  <div className="dest-fact">
                    <span className="dest-label">Photos in slideshow</span>
                    <span className="dest-value">{selectedResortPhotoCount}</span>
                  </div>
                </div>
              </section>

              <section className="dest-detail-group">
                <h3>How a visitor gets here</h3>
                <div className="dest-facts two">
                  <div className="dest-fact">
                    <span className="dest-label">Access</span>
                    <span className="dest-value">{selectedResortDetail.access || "Not specified"}</span>
                  </div>
                  <div className="dest-fact">
                    <span className="dest-label">Address</span>
                    <span className="dest-value">{selectedResortDetail.location || "Not specified"}</span>
                  </div>
                </div>
                <div className="dest-fact">
                  <span className="dest-label">Length of stay offered</span>
                  <div className="dest-chip-row">
                    {selectedResortStays.length ? (
                      selectedResortStays.map((stay) => (
                        <span key={stay.id} className="dest-chip-static">
                          {stay.name}
                        </span>
                      ))
                    ) : (
                      <span className="dest-value">None chosen yet</span>
                    )}
                  </div>
                </div>
              </section>

              <section className="dest-detail-group">
                <h3>About this destination</h3>
                <p className="dest-about">
                  {selectedResortDetail.short_description || "No description provided for this destination."}
                </p>
              </section>

              <section className="dest-detail-group">
                <h3>On the map</h3>
                <p className="dest-coords">
                  {selectedResortCoordinates
                    ? `${selectedResortCoordinates.lat.toFixed(5)}° N, ${selectedResortCoordinates.lng.toFixed(5)}° E`
                    : "Coordinates not specified"}
                </p>
                {selectedResortCoordinates ? (
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
                ) : null}
              </section>

              {/* Ratings & Reviews for this resort */}
              <div className="dest-detail-group" id="gmaps-resort-reviews">
                <div className="dest-detail-group-head">
                  <h3>
                    Visitor reviews ({selectedResortFeedback.length})
                    {selectedResortHiddenCount ? (
                      <span className="gmaps-review-hidden-count">
                        {" "}
                        · {selectedResortHiddenCount} hidden
                      </span>
                    ) : null}
                  </h3>
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
                  <p style={{ color: "var(--th-text-muted)", fontSize: "13px", padding: "12px 0" }}>
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
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[var(--th-scrim)] px-4 py-10">
          <form
            className="dest-edit"
            onSubmit={handleSubmit}
            aria-label={editingDestination ? "Edit destination" : "Add destination"}
          >
            <header className="dest-edit-header">
              <div>
                <h2>{editingDestination ? "Edit destination" : "Add destination"}</h2>
                <p>{editingDestination ? editingDestination.resort_name : "A new destination"}</p>
              </div>
              <button
                type="button"
                className="dest-edit-close"
                aria-label="Close"
                disabled={saving || uploadingImages}
                onClick={() => setIsFormOpen(false)}
              >
                <FiX size={16} />
              </button>
            </header>

            <div className="dest-edit-body">
              {editingDestination ? (
                <div className="dest-readonly" aria-label="Worked out by the system">
                  <div className="dest-readonly-facts">
                    <div>
                      <span className="dest-label">Tourist rating</span>
                      <strong className="dest-readonly-value">{ratingOf(editingDestination)}</strong>
                      <small className="dest-hint">{reviewsText(reviewCountOf(editingDestination))}</small>
                    </div>
                    <div>
                      <span className="dest-label">Arrivals this month</span>
                      <strong className="dest-readonly-value">{visitorsText(editingDestination.monthly_arrivals)}</strong>
                      <small className="dest-hint">
                        {Number(editingDestination.yearly_arrivals || 0).toLocaleString()} this year
                      </small>
                    </div>
                  </div>
                  <p className="dest-hint">
                    Both come from the records. They were fields you could type into, and the server threw the typing
                    away.
                  </p>
                </div>
              ) : null}

              <section className="dest-group">
                <h3>Name and category</h3>
                <p className="dest-group-sub">What the visitor sees first.</p>
                <TextField
                  label="Destination name"
                  value={form.resort_name}
                  onChange={(value) => updateField("resort_name", value)}
                  required
                />
                <div className="dest-row-2">
                  <TextField
                    label="Category"
                    placeholder="Island Resort, Beach Resort, Heritage Site"
                    value={form.type}
                    onChange={(value) => updateField("type", value)}
                    required
                  />
                  <TextField
                    label="Location"
                    value={form.location}
                    onChange={(value) => updateField("location", value)}
                    required
                  />
                </div>
              </section>

              <section className="dest-group">
                <h3>Status</h3>
                <p className="dest-group-sub">Whether the app offers this destination at all.</p>
                <div className="dest-seg" role="group" aria-label="Status">
                  <button
                    type="button"
                    className={`dest-seg-btn${form.is_active ? " selected" : ""}`}
                    aria-pressed={Boolean(form.is_active)}
                    onClick={() => updateField("is_active", true)}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={`dest-seg-btn${form.is_active ? "" : " selected"}`}
                    aria-pressed={!form.is_active}
                    onClick={() => updateField("is_active", false)}
                  >
                    Inactive
                  </button>
                </div>
                <p className="dest-hint">
                  Inactive takes it out of the app's destination list and out of the registration form. Records that
                  already name it keep it, and it is never deleted.
                </p>
                <SelectBooleanField
                  label="Mayor's permit"
                  value={form.with_mayors_permit}
                  onChange={(value) => updateField("with_mayors_permit", value)}
                />
                <p className="dest-hint">A badge on the visitor's screen. It does not hide the destination.</p>
              </section>

              <section className="dest-group">
                <h3>How a visitor gets here</h3>
                <p className="dest-group-sub">Both of these appear in the app and in the registration form.</p>
                <TextField
                  label="Access"
                  placeholder="Boat Access, Road Access"
                  value={form.access}
                  onChange={(value) => updateField("access", value)}
                  required
                />
                <span className="dest-label">Length of stay offered</span>
                <div className="dest-stay-options" role="group" aria-label="Length of stay offered">
                  {stayChoices.map((option) => {
                    const picked = (form.itinerary_ids || []).includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`dest-chip${picked ? " selected" : ""}`}
                        aria-pressed={picked}
                        onClick={() => toggleItinerary(option.id)}
                      >
                        {option.name}
                      </button>
                    );
                  })}
                  {stayChoices.length === 0 ? (
                    <span className="dest-hint">No Length of Stay options are set up yet.</span>
                  ) : null}
                </div>
                <p className="dest-hint">By name. This used to be a box asking for "Itinerary IDs: 1, 2".</p>
              </section>

              <section className="dest-group">
                <h3>Photos</h3>
                <p className="dest-group-sub">These rotate in the app's slideshow.</p>
                <span className="dest-label">Slideshow images ({form.images?.length || 0})</span>

                <label className="image-upload-dropzone">
                  <FiUploadCloud size={28} className="text-[var(--th-primary)] mb-1" />
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
              </section>

              <section className="dest-group">
                <h3>Where it is</h3>
                <p className="dest-group-sub">Paste a Google Maps link and the pin follows it.</p>
                <LocationPicker
                  label="Destination map pin"
                  latitude={form.latitude}
                  longitude={form.longitude}
                  onChange={updateField}
                  hideHeader
                  applyLabel="Apply pin"
                  beforeMap={
                    <div className="dest-row-2">
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
                    </div>
                  }
                />
              </section>

              <section className="dest-group">
                <h3>Description</h3>
                <p className="dest-group-sub">The paragraph under the name in the app.</p>
                <TextAreaField
                  label="Description"
                  showLabel={false}
                  value={form.short_description}
                  onChange={(value) => updateField("short_description", value)}
                  required
                />
              </section>

              <div className="dest-image-key">
                <TextField
                  label="Image key"
                  placeholder="dona-choleng-camping-resort, aquazul-hotel-and-resort"
                  value={form.image_key}
                  onChange={(value) => updateField("image_key", value)}
                />
                <p className="dest-hint">
                  Finds the built-in photo. Leave it unless you know what it points to.
                </p>
              </div>

              {formError ? <p className="tourist-record-error">{formError}</p> : null}
            </div>

            <footer className="dest-edit-footer">
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
                {saving ? "Saving..." : "Save destination"}
              </button>
            </footer>
          </form>
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

// showLabel={false} is for a field whose group already carries the same word as its title: the label is then only for assistive
// technology (aria-label) and the box is not given the word as a placeholder, so it is said once on the screen.
function TextAreaField({ label, value, onChange, required = false, showLabel = true }) {
  return (
    <label className="tourist-record-field">
      {showLabel ? <span>{label}</span> : null}
      <textarea
        value={value}
        required={required}
        placeholder={showLabel ? label : ""}
        aria-label={showLabel ? undefined : label}
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
