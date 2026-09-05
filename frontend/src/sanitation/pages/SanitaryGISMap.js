import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  useMap,
  Marker,
  Popup,
  GeoJSON,
} from "react-leaflet";
import { FiLayers, FiMapPin, FiRefreshCw } from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";
import maubanBarangaysGeoJSON from "../assets/mauban_barangays.json";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const maubanCenter = [14.185, 121.731];

const tileLayers = {
  street: {
    attribution:
      '&copy; <a href="https://maps.google.com">Google Maps</a>',
    url: "http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
  },
  satellite: {
    attribution:
      '&copy; <a href="https://maps.google.com">Google Maps Satellite</a>',
    url: "http://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
  },
};

export const MAUBAN_BARANGAY_CENTERS = {
  "Abo-abo": [14.225, 121.670],
  "Alitap": [14.140, 121.715],
  "Baao": [14.160, 121.680],
  "Bagong Bayan": [14.185, 121.731],
  "Balaybalay": [14.110, 121.660],
  "Bato": [14.200, 121.680],
  "Cagbalete I": [14.230, 121.820],
  "Cagbalete II": [14.220, 121.830],
  "Cagsiay I": [14.260, 121.710],
  "Cagsiay II": [14.250, 121.715],
  "Cagsiay III": [14.240, 121.720],
  "Concepcion": [14.190, 121.690],
  "Daungan": [14.187, 121.735],
  "Liwayway": [14.140, 121.690],
  "Lual": [14.190, 121.728],
  "Lual Rural": [14.195, 121.725],
  "Lucutan": [14.175, 121.670],
  "Luya-luya": [14.130, 121.680],
  "Mabato": [14.080, 121.630],
  "Macasin": [14.180, 121.680],
  "Polo": [14.175, 121.730],
  "Remedios I": [14.230, 121.660],
  "Remedios II": [14.235, 121.650],
  "Rizaliana": [14.184, 121.730],
  "Rosario": [14.183, 121.729],
  "Sadsaran": [14.186, 121.732],
  "San Gabriel": [14.100, 121.650],
  "San Isidro": [14.160, 121.725],
  "San Jose": [14.130, 121.710],
  "San Lorenzo": [14.210, 121.720],
  "San Miguel": [14.170, 121.690],
  "San Rafael": [14.090, 121.640],
  "San Roque": [14.240, 121.690],
  "San Vicente": [14.188, 121.733],
  "Santa Lucia": [14.182, 121.734],
  "Santol": [14.120, 121.670],
  "Santo Angel": [14.181, 121.735],
  "Santo Niño": [14.095, 121.800],
  "Soledad": [14.070, 121.620],
  "Tapucan": [14.150, 121.720],
};

const establishmentStatusFilters = [
  { value: "all", label: "All Establishments" },
  { value: "good_standing", label: "Good Standing" },
  { value: "upcoming", label: "Upcoming" },
  { value: "for_completion", label: "For Completion" },
  { value: "violation", label: "Violation" },
  { value: "no_permit", label: "No Permit" },
];

const householdStatusFilters = [
  { value: "all", label: "All Households" },
  { value: "good_standing", label: "Good Standing" },
  { value: "for_completion", label: "For Compliance" },
  { value: "violation", label: "Needs Assistance" },
];

const communityReportStatusFilters = [
  { value: "all", label: "All Reports" },
  { value: "pending", label: "Pending" },
  { value: "investigating", label: "Under Investigation" },
  { value: "resolved", label: "Resolved" },
];

function getCategoryMeta(category) {
  const cat = (category || "").toLowerCase();
  if (cat.includes("garbage") || cat.includes("waste") || cat.includes("dump") || cat.includes("solid")) {
    return { icon: "🗑️", label: "Solid Waste", bg: "#fee2e2", color: "#991b1b" };
  }
  if (cat.includes("drain") || cat.includes("canal") || cat.includes("clog") || cat.includes("water") || cat.includes("flood")) {
    return { icon: "💧", label: "Drainage", bg: "#e0f2fe", color: "#0369a1" };
  }
  if (cat.includes("septic") || cat.includes("sewage") || cat.includes("toilet") || cat.includes("odor") || cat.includes("leak")) {
    return { icon: "⚠️", label: "Septic / Odor", bg: "#fef3c7", color: "#92400e" };
  }
  if (cat.includes("animal") || cat.includes("stray") || cat.includes("mosquito") || cat.includes("pest") || cat.includes("dengue")) {
    return { icon: "🦟", label: "Vector / Pest", bg: "#f3e8ff", color: "#6b21a8" };
  }
  if (cat.includes("food") || cat.includes("canteen") || cat.includes("restaurant") || cat.includes("hygiene")) {
    return { icon: "🍽️", label: "Food Hygiene", bg: "#dcfce7", color: "#166534" };
  }
  return { icon: "📢", label: category || "Concern", bg: "#f1f5f9", color: "#334155" };
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDeterministicOffset(seedStr) {
  let hash = 0;
  const str = String(seedStr || "");
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const x = Math.sin(hash) * 10000;
  const y = Math.cos(hash) * 10000;
  const latOff = (x - Math.floor(x) - 0.5) * 0.005;
  const lngOff = (y - Math.floor(y) - 0.5) * 0.005;
  return [latOff, lngOff];
}

function getMapPosition(item) {
  const lat =
    parseCoordinate(item.latitude) ?? parseCoordinate(item.coordinates?.lat);
  const lng =
    parseCoordinate(item.longitude) ?? parseCoordinate(item.coordinates?.lng);

  if (lat !== null && lng !== null && Math.abs(lat) > 0.001 && Math.abs(lng) > 0.001) {
    if (lat >= 13.9 && lat <= 14.5 && lng >= 121.55 && lng <= 122.0) {
      return [lat, lng];
    }
  }

  // Fallback: derive realistic coordinates from barangay center
  const bgyName = item.barangay || "Bagong Bayan";
  const matchedCenter =
    MAUBAN_BARANGAY_CENTERS[bgyName] ||
    Object.entries(MAUBAN_BARANGAY_CENTERS).find(
      ([k]) => k.toLowerCase() === bgyName.toLowerCase()
    )?.[1] ||
    maubanCenter;

  const [latOff, lngOff] = getDeterministicOffset(
    item.id || item.household_code || item.complaint_id || item.business_name
  );

  return [
    Number((matchedCenter[0] + latOff).toFixed(6)),
    Number((matchedCenter[1] + lngOff).toFixed(6)),
  ];
}

function getPinColor(item, mapMode) {
  if (mapMode === "community_reports") {
    if (item.status === "resolved") return "#16a34a"; // Green
    if (item.priority === "high" || item.status === "pending") return "#dc2626"; // Red
    if (item.priority === "medium" || item.status === "investigating") return "#f59e0b"; // Amber
    return "#16a34a"; // Green
  }

  if (mapMode === "households") {
    if (item.status === "violation") return "#dc2626"; // Red
    if (item.status === "for_completion") return "#f59e0b"; // Amber
    return "#16a34a"; // Green
  }

  // Establishments
  const status = item.compliance_status || "";
  if (status === "good_standing") return "#16a34a"; // Green
  if (status === "upcoming") return "#f59e0b"; // Amber / Yellow
  if (status === "for_completion") return "#ea580c"; // Orange
  if (status === "violation") return "#dc2626"; // Red
  if (status === "no_permit") return "#991b1b"; // Dark Red
  return "#0f766e"; // Default
}

function createCustomPin(color, isSelected = false) {
  const size = isSelected ? 34 : 26;
  const height = isSelected ? 44 : 34;

  const svg = `
    <div style="position: relative; width: ${size}px; height: ${height}px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <svg width="${size}" height="${height}" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.38)); transition: all 0.2s ease;">
        <path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 14.2 24.8 14.8 25.4.6.6 1.8.6 2.4 0C17.8 40.8 32 26.5 32 16 32 7.163 24.837 0 16 0z" fill="${color}"/>
        <circle cx="16" cy="15" r="7" fill="white" opacity="0.95"/>
        <circle cx="16" cy="15" r="4.2" fill="${color}"/>
        ${isSelected ? `<circle cx="16" cy="15" r="8.8" stroke="white" stroke-width="2.5" fill="none"/>` : ""}
      </svg>
    </div>
  `;

  return L.divIcon({
    className: `gis-pin-marker ${isSelected ? "selected" : ""}`,
    html: svg,
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
    popupAnchor: [0, -height + 4],
  });
}

function formatHouseholdStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("completion") || s.includes("compliance")) return "For Compliance";
  if (s.includes("violation") || s.includes("assistance")) return "Needs Assistance";
  return "Good Standing";
}

function formatReportStatus(status) {
  if (status === "pending") return "Pending";
  if (status === "investigating") return "Under Investigation";
  if (status === "resolved") return "Resolved";
  return status || "Pending";
}

function statusClass(status = "") {
  return String(status || "").toLowerCase().replace(/[\s_]+/g, "-");
}

function SanitaryGISMap() {
  const location = useLocation();
  const {
    establishments,
    householdRecords,
    complaintData,
    loading,
    error,
    refreshComplaintData,
  } = useSanitationData();

  const [mapMode, setMapMode] = useState(location.state?.mode || "establishments");
  const [mapLayer, setMapLayer] = useState("street");
  const [statusFilter, setStatusFilter] = useState("all");
  const [barangayFilter, setBarangayFilter] = useState("All Barangays");
  const [selectedItemId, setSelectedItemId] = useState(location.state?.reportId || null);
  const [resetKey, setResetKey] = useState(0);

  function handleResetView() {
    setSelectedItemId(null);
    setBarangayFilter("All Barangays");
    setStatusFilter("all");
    setResetKey((prev) => prev + 1);
  }

  useEffect(() => {
    if (location.state?.mode) {
      setMapMode(location.state.mode);
      if (location.state.reportId) {
        setSelectedItemId(location.state.reportId);
      }
    }
  }, [location.state]);

  const isHouseholdMode = mapMode === "households";
  const isCommunityMode = mapMode === "community_reports";

  useEffect(() => {
    if (isCommunityMode && !complaintData) {
      refreshComplaintData();
    }
  }, [isCommunityMode, complaintData, refreshComplaintData]);

  // Source items mapped with position
  const sourceItems = useMemo(() => {
    let source = establishments;
    if (isHouseholdMode) source = householdRecords;
    if (isCommunityMode) {
      source = complaintData?.rows || [];
    }

    return source.map((item) => ({
      ...item,
      position: getMapPosition(item),
    }));
  }, [establishments, householdRecords, complaintData, isHouseholdMode, isCommunityMode]);

  // Guaranteed all Mauban barangays in selector
  const barangays = useMemo(() => {
    const geoBarangays = (maubanBarangaysGeoJSON?.features || [])
      .map((f) => f.properties?.NAME_3)
      .filter(Boolean);
    const sourceBarangays = sourceItems.map((item) => item.barangay).filter(Boolean);
    const set = new Set([...geoBarangays, ...sourceBarangays]);
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
    return ["All Barangays", ...sorted];
  }, [sourceItems]);

  // Strict status & barangay filtering
  const filteredSourceItems = useMemo(() => {
    return sourceItems.filter((item) => {
      let statusValue = item.compliance_status;
      if (isHouseholdMode) statusValue = item.status;
      if (isCommunityMode) statusValue = item.status;

      const matchesStatus =
        statusFilter === "all" || statusValue === statusFilter;

      const matchesBarangay =
        barangayFilter === "All Barangays" ||
        (item.barangay &&
          item.barangay.toLowerCase().trim() === barangayFilter.toLowerCase().trim());

      return matchesStatus && matchesBarangay;
    });
  }, [sourceItems, statusFilter, barangayFilter, isHouseholdMode, isCommunityMode]);

  // Priority & Date sorting
  const sortedItems = useMemo(() => {
    return [...filteredSourceItems].sort((a, b) => {
      if (isCommunityMode) {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const statusWeight = { pending: 3, investigating: 2, resolved: 1 };
        const pDiff = (priorityWeight[b.priority] || 1) - (priorityWeight[a.priority] || 1);
        if (pDiff !== 0) return pDiff;
        const sDiff = (statusWeight[b.status] || 1) - (statusWeight[a.status] || 1);
        if (sDiff !== 0) return sDiff;
        return (
          new Date(b.reported_date || b.created_at || 0) -
          new Date(a.reported_date || a.created_at || 0)
        );
      }
      return (a.business_name || a.household_head || "").localeCompare(
        b.business_name || b.household_head || ""
      );
    });
  }, [filteredSourceItems, isCommunityMode]);

  const filteredItems = useMemo(
    () => sortedItems.filter((item) => item.position),
    [sortedItems]
  );

  const tileLayer = tileLayers[mapLayer] || tileLayers.street;

  const selectedItem =
    filteredItems.find((item) => item.id === selectedItemId) ||
    filteredItems[0];

  function handleModeChange(nextMode) {
    setMapMode(nextMode);
    setStatusFilter("all");
    setBarangayFilter("All Barangays");
    setSelectedItemId(null);
  }

  const normalizeBgy = (name) => (name || "").toLowerCase().trim();

  // Aggregate stats per barangay for tooltips
  const barangayAggregates = useMemo(() => {
    const aggregates = {};

    if (maubanBarangaysGeoJSON?.features) {
      maubanBarangaysGeoJSON.features.forEach((feature) => {
        aggregates[normalizeBgy(feature.properties.NAME_3)] = {
          total: 0,
          high: 0,
          medium: 0,
          low: 0,
        };
      });
    }

    sourceItems.forEach((item) => {
      const bgy = normalizeBgy(item.barangay);
      if (!aggregates[bgy]) aggregates[bgy] = { total: 0, high: 0, medium: 0, low: 0 };

      aggregates[bgy].total += 1;

      let risk = "low";
      if (isHouseholdMode) {
        if (item.status === "violation") risk = "high";
        else if (item.status === "for_completion") risk = "medium";
      } else if (isCommunityMode) {
        if (item.priority === "high" || item.status === "pending") risk = "high";
        else if (item.priority === "medium" || item.status === "investigating") risk = "medium";
      } else {
        if (item.compliance_status === "violation" || item.compliance_status === "no_permit")
          risk = "high";
        else if (
          item.compliance_status === "upcoming" ||
          item.compliance_status === "for_completion"
        )
          risk = "medium";
      }

      aggregates[bgy][risk] += 1;
    });

    return aggregates;
  }, [sourceItems, isHouseholdMode, isCommunityMode]);

  // GeoJSON boundary styles: prominent line and subtle tint when selected
  const geoJsonStyle = (feature) => {
    const bgyName = normalizeBgy(feature.properties?.NAME_3);
    const isSelected =
      barangayFilter !== "All Barangays" &&
      normalizeBgy(barangayFilter) === bgyName;
    const isDimmed = barangayFilter !== "All Barangays" && !isSelected;

    if (isSelected) {
      let strokeColor = "#0f766e";
      let fillColor = "#0ea5e9";
      if (statusFilter === "violation" || statusFilter === "no_permit") {
        strokeColor = "#dc2626";
        fillColor = "#ef4444";
      } else if (statusFilter === "good_standing") {
        strokeColor = "#16a34a";
        fillColor = "#22c55e";
      } else if (
        statusFilter === "upcoming" ||
        statusFilter === "for_completion" ||
        statusFilter === "investigating"
      ) {
        strokeColor = "#d97706";
        fillColor = "#f59e0b";
      }

      return {
        fillColor,
        fillOpacity: 0.16,
        weight: 3.5,
        opacity: 1,
        color: strokeColor,
        dashArray: "",
      };
    }

    return {
      fillColor: "transparent",
      fillOpacity: 0.02,
      weight: 1.2,
      opacity: isDimmed ? 0.25 : 0.65,
      color: isDimmed ? "#cbd5e1" : "#64748b",
      dashArray: "3 3",
    };
  };

  const onEachFeature = (feature, layer) => {
    if (feature.properties && feature.properties.NAME_3) {
      const bgyName = feature.properties.NAME_3;
      const agg = barangayAggregates[normalizeBgy(bgyName)];

      let tooltipContent = `<strong>Brgy. ${bgyName}</strong><br/>`;
      if (agg && agg.total > 0) {
        tooltipContent += `Total Records: ${agg.total}<br/>`;
        if (isHouseholdMode) {
          tooltipContent += `Good Standing: ${agg.low} • At-Risk: ${agg.high}`;
        } else if (isCommunityMode) {
          tooltipContent += `Pending: ${agg.high} • In Review: ${agg.medium}`;
        } else {
          tooltipContent += `Good Standing: ${agg.low} • Violations: ${agg.high}`;
        }
      } else {
        tooltipContent += `Click to isolate Brgy. ${bgyName}`;
      }

      layer.bindTooltip(tooltipContent, { sticky: true });

      layer.on({
        click: () => {
          const matchingOption = barangays.find(
            (b) => normalizeBgy(b) === normalizeBgy(bgyName)
          );
          if (matchingOption) setBarangayFilter(matchingOption);
        },
      });
    }
  };

  const renderGisItem = (item) => {
    const pinColor = getPinColor(item, mapMode);
    const isSelected = selectedItem?.id === item.id;

    return (
      <button
        key={`${mapMode}-list-${item.id}`}
        type="button"
        className={`gis-item ${isSelected ? "active" : ""}`}
        onClick={() => setSelectedItemId(item.id)}
      >
        <span className="dot" style={{ background: pinColor }} />

        <div>
          <strong>
            {isHouseholdMode
              ? item.household_head
              : isCommunityMode
              ? item.complainant_name || "Anonymous Citizen"
              : item.business_name}
          </strong>

          <small>
            {isHouseholdMode
              ? `${item.household_code} • Brgy. ${item.barangay}`
              : isCommunityMode
              ? `${item.complaint_id} • Brgy. ${item.barangay}`
              : `${item.business_type_name || "Establishment"} • Brgy. ${item.barangay}`}
          </small>
        </div>
      </button>
    );
  };

  if (loading) {
    return <div className="sanitary-gis-page">Loading Sanitary GIS map...</div>;
  }

  return (
    <div className="sanitary-gis-page">
      <div className="sanitary-page-header">
        <h2>Sanitary GIS Map</h2>
        <p>
          Accurate geographic visualization of establishments, households, and
          community concerns across Mauban
        </p>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <div className="gis-mode-toggle">
        <button
          type="button"
          className={mapMode === "establishments" ? "active" : ""}
          onClick={() => handleModeChange("establishments")}
        >
          Establishments
        </button>

        <button
          type="button"
          className={mapMode === "households" ? "active" : ""}
          onClick={() => handleModeChange("households")}
        >
          Households
        </button>

        <button
          type="button"
          className={mapMode === "community_reports" ? "active" : ""}
          onClick={() => handleModeChange("community_reports")}
        >
          Community Reports
        </button>
      </div>

      <div className="gis-toolbar">
        <div className="gis-left-controls">
          <label>Status:</label>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {(isCommunityMode
              ? communityReportStatusFilters
              : isHouseholdMode
              ? householdStatusFilters
              : establishmentStatusFilters
            ).map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>

          <label>Barangay:</label>

          <select
            value={barangayFilter}
            onChange={(event) => setBarangayFilter(event.target.value)}
          >
            {barangays.map((b) => (
              <option key={b} value={b}>
                {b === "All Barangays" ? "All Mauban Barangays" : `Brgy. ${b}`}
              </option>
            ))}
          </select>
        </div>

        <div className="gis-layer-toggle">
          <button
            type="button"
            className="gis-reset-btn"
            title="Reset map view to whole Mauban center"
            onClick={handleResetView}
          >
            <FiRefreshCw style={{ marginRight: "4px" }} /> Reset View
          </button>

          <button
            type="button"
            className={mapLayer === "street" ? "active" : ""}
            onClick={() => setMapLayer("street")}
          >
            Street
          </button>

          <button
            type="button"
            className={mapLayer === "satellite" ? "active" : ""}
            onClick={() => setMapLayer("satellite")}
          >
            Satellite
          </button>
        </div>

        {/* Dynamic Legend */}
        <div className="gis-legend">
          {isCommunityMode ? (
            <>
              <span>
                <i style={{ background: "#dc2626" }} /> Pending
              </span>
              <span>
                <i style={{ background: "#f59e0b" }} /> Under Investigation
              </span>
              <span>
                <i style={{ background: "#16a34a" }} /> Resolved
              </span>
            </>
          ) : isHouseholdMode ? (
            <>
              <span>
                <i style={{ background: "#16a34a" }} /> Good Standing
              </span>
              <span>
                <i style={{ background: "#f59e0b" }} /> For Compliance
              </span>
              <span>
                <i style={{ background: "#dc2626" }} /> Needs Assistance
              </span>
            </>
          ) : (
            <>
              <span>
                <i style={{ background: "#16a34a" }} /> Good Standing
              </span>
              <span>
                <i style={{ background: "#f59e0b" }} /> Upcoming
              </span>
              <span>
                <i style={{ background: "#ea580c" }} /> For Completion
              </span>
              <span>
                <i style={{ background: "#dc2626" }} /> Violation
              </span>
              <span>
                <i style={{ background: "#991b1b" }} /> No Permit
              </span>
            </>
          )}
        </div>
      </div>

      {/* Summary Counters */}
      <div
        className="gis-map-summary-row"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        {isCommunityMode ? (
          <>
            <MapSummaryCard label="Total Reports" value={filteredItems.length} color="#3b82f6" />
            <MapSummaryCard
              label="Pending"
              value={filteredItems.filter((i) => i.status === "pending").length}
              color="#dc2626"
            />
            <MapSummaryCard
              label="Under Investigation"
              value={filteredItems.filter((i) => i.status === "investigating").length}
              color="#f59e0b"
            />
            <MapSummaryCard
              label="Resolved"
              value={filteredItems.filter((i) => i.status === "resolved").length}
              color="#16a34a"
            />
          </>
        ) : isHouseholdMode ? (
          <>
            <MapSummaryCard label="Total Households" value={filteredItems.length} color="#3b82f6" />
            <MapSummaryCard
              label="Good Standing"
              value={filteredItems.filter((i) => i.status === "good_standing").length}
              color="#16a34a"
            />
            <MapSummaryCard
              label="For Compliance"
              value={filteredItems.filter((i) => i.status === "for_completion").length}
              color="#f59e0b"
            />
            <MapSummaryCard
              label="Needs Assistance"
              value={filteredItems.filter((i) => i.status === "violation").length}
              color="#dc2626"
            />
          </>
        ) : (
          <>
            <MapSummaryCard label="Total Establishments" value={filteredItems.length} color="#3b82f6" />
            <MapSummaryCard
              label="Good Standing"
              value={filteredItems.filter((i) => i.compliance_status === "good_standing").length}
              color="#16a34a"
            />
            <MapSummaryCard
              label="Upcoming / Renewal"
              value={
                filteredItems.filter(
                  (i) =>
                    i.compliance_status === "upcoming" ||
                    i.compliance_status === "for_completion"
                ).length
              }
              color="#f59e0b"
            />
            <MapSummaryCard
              label="Violations / No Permit"
              value={
                filteredItems.filter(
                  (i) =>
                    i.compliance_status === "violation" ||
                    i.compliance_status === "no_permit"
                ).length
              }
              color="#dc2626"
            />
          </>
        )}
      </div>

      <div className="gis-layout">
        <div className="gis-map">
          <MapContainer
            center={maubanCenter}
            zoom={14}
            style={{ height: "100%", width: "100%" }}
            zoomControl
          >
            <TileLayer attribution={tileLayer.attribution} url={tileLayer.url} />

            <FitMapToItems
              items={filteredItems}
              selectedItemId={selectedItemId}
              barangayFilter={barangayFilter}
              resetKey={resetKey}
            />

            {/* GeoJSON Boundary Layer across all modes */}
            <GeoJSON
              key={`geojson-${mapMode}-${barangayFilter}-${statusFilter}`}
              data={maubanBarangaysGeoJSON}
              style={geoJsonStyle}
              onEachFeature={onEachFeature}
            />

            {/* Color-Coded Map Markers across all modes */}
            {filteredItems.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              const pinColor = getPinColor(item, mapMode);
              const pinIcon = createCustomPin(pinColor, isSelected);
              const catMeta = isCommunityMode ? getCategoryMeta(item.category) : null;

              return (
                <Marker
                  key={`${mapMode}-marker-${item.id}`}
                  position={item.position}
                  icon={pinIcon}
                  eventHandlers={{
                    click: () => setSelectedItemId(item.id),
                  }}
                >
                  <Popup>
                    {isCommunityMode ? (
                      <div className="gis-popup-card">
                        <div className="gis-popup-header">
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: "800",
                              padding: "3px 8px",
                              borderRadius: "999px",
                              background: catMeta.bg,
                              color: catMeta.color,
                            }}
                          >
                            {catMeta.icon} {catMeta.label}
                          </span>
                          <span className={`status-pill ${statusClass(item.status)}`}>
                            {formatReportStatus(item.status)}
                          </span>
                        </div>
                        <h4 className="gis-popup-title">
                          {item.complainant_name || "Anonymous Citizen"}
                        </h4>
                        <p className="gis-popup-meta">
                          {item.complaint_id} • Brgy. {item.barangay}
                        </p>
                        {item.description ? (
                          <p className="gis-popup-desc">
                            "{item.description.length > 85
                              ? item.description.substring(0, 85) + "..."
                              : item.description}"
                          </p>
                        ) : null}
                        {item.inspection_scheduled_date ? (
                          <div className="gis-popup-scheduled">
                            <span>
                              Inspection: <strong>{item.inspection_scheduled_date}</strong>
                            </span>
                            {item.assigned_inspector ? (
                              <span>
                                Inspector: <strong>{item.assigned_inspector}</strong>
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : isHouseholdMode ? (
                      <div className="gis-popup-card">
                        <div className="gis-popup-header">
                          <span className={`status-pill ${statusClass(item.status)}`}>
                            {formatHouseholdStatus(item.status)}
                          </span>
                          <span className="gis-popup-code">{item.household_code}</span>
                        </div>
                        <h4 className="gis-popup-title">{item.household_head}</h4>
                        <p className="gis-popup-meta">
                          Brgy. {item.barangay} •{" "}
                          {item.total_members || item.male_count + item.female_count} Members
                        </p>
                        <p className="gis-popup-address">
                          {item.address || `Brgy. ${item.barangay}, Mauban, Quezon`}
                        </p>
                        <div className="gis-popup-details">
                          <div>
                            <span>Toilet:</span>{" "}
                            <strong>{item.toilet_type_label || item.toilet_type}</strong>
                          </div>
                          <div>
                            <span>Water Access:</span>{" "}
                            <strong>{item.water_level_label || item.water_level}</strong>
                          </div>
                          <div>
                            <span>Waste Disposal:</span>{" "}
                            <strong>{item.waste_disposal_label || item.waste_disposal}</strong>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="gis-popup-card">
                        <div className="gis-popup-header">
                          <span
                            className={`status-pill ${statusClass(
                              item.compliance_status_label || item.compliance_status
                            )}`}
                          >
                            {item.compliance_status_label || item.compliance_status}
                          </span>
                          <span className="gis-popup-code">
                            {item.permit_number || "NO PERMIT"}
                          </span>
                        </div>
                        <h4 className="gis-popup-title">{item.business_name}</h4>
                        <p className="gis-popup-meta">
                          {item.business_type_name || "Commercial"} • Brgy. {item.barangay}
                        </p>
                        <p className="gis-popup-address">{item.address}</p>
                        <div className="gis-popup-details">
                          <div>
                            <span>Owner:</span> <strong>{item.owner_name}</strong>
                          </div>
                          <div>
                            <span>Permit Status:</span>{" "}
                            <strong>{item.permit_status_label || item.permit_status}</strong>
                          </div>
                          {item.permit_expiry_date ? (
                            <div>
                              <span>Valid Until:</span>{" "}
                              <strong>{item.permit_expiry_date}</strong>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {!filteredItems.length ? (
            <div className="gis-map-empty-overlay">
              <FiMapPin style={{ marginRight: "6px" }} />
              No records match the current status and barangay filters.
            </div>
          ) : null}

          <button
            type="button"
            className="gis-layer-btn"
            aria-label="Toggle map layer"
            title="Toggle map layer"
            onClick={() =>
              setMapLayer((current) =>
                current === "street" ? "satellite" : "street"
              )
            }
          >
            <FiLayers />
          </button>
        </div>

        <aside className="gis-side">
          <h3>
            {isHouseholdMode
              ? "Household Records"
              : isCommunityMode
              ? "Community Reports"
              : "Establishment Records"}
          </h3>

          {selectedItem ? (
            <div className="gis-selected-card">
              <strong>
                {isHouseholdMode
                  ? selectedItem.household_head
                  : isCommunityMode
                  ? selectedItem.complainant_name || "Anonymous Citizen"
                  : selectedItem.business_name}
              </strong>

              <p>
                {isHouseholdMode
                  ? `${selectedItem.household_code} • Brgy. ${selectedItem.barangay}`
                  : isCommunityMode
                  ? `${selectedItem.complaint_id} • Brgy. ${selectedItem.barangay}`
                  : `${selectedItem.business_type_name || "Establishment"} • Brgy. ${selectedItem.barangay}`}
              </p>

              <span
                className={`status-pill ${statusClass(
                  isHouseholdMode
                    ? formatHouseholdStatus(selectedItem.status)
                    : isCommunityMode
                    ? formatReportStatus(selectedItem.status)
                    : selectedItem.compliance_status_label || selectedItem.compliance_status
                )}`}
              >
                {isHouseholdMode
                  ? formatHouseholdStatus(selectedItem.status)
                  : isCommunityMode
                  ? formatReportStatus(selectedItem.status)
                  : selectedItem.compliance_status_label || selectedItem.compliance_status}
              </span>
            </div>
          ) : null}

          <div className="gis-list">
            {filteredItems.length ? (
              filteredItems.map(renderGisItem)
            ) : (
              <p className="gis-empty">
                No records found matching the active filters.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function MapSummaryCard({ label, value, color }) {
  return (
    <div className="gis-map-summary-card">
      <span style={color ? { color } : undefined}>{label}</span>
      <strong style={color ? { color } : undefined}>{value}</strong>
    </div>
  );
}

function FitMapToItems({ items, selectedItemId, barangayFilter, resetKey }) {
  const map = useMap();

  useEffect(() => {
    if (resetKey > 0) {
      map.flyTo(maubanCenter, 13.5, { duration: 0.6 });
      return;
    }

    if (selectedItemId) {
      const selected = items.find((i) => i.id === selectedItemId);
      if (selected && selected.position) {
        map.flyTo(selected.position, 16, { duration: 0.5 });
        return;
      }
    }

    // Auto-fit to selected barangay polygon
    if (barangayFilter && barangayFilter !== "All Barangays") {
      const feature = maubanBarangaysGeoJSON?.features?.find(
        (f) =>
          f.properties?.NAME_3?.toLowerCase().trim() ===
          barangayFilter.toLowerCase().trim()
      );
      if (feature) {
        try {
          const geoJsonLayer = L.geoJSON(feature);
          const bounds = geoJsonLayer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
            return;
          }
        } catch (e) {
          // fallback to items bounds
        }
      }
    }

    if (!items.length) {
      map.setView(maubanCenter, 13.5);
      return;
    }

    if (items.length === 1) {
      map.setView(items[0].position, 15);
      return;
    }

    const bounds = items.map((item) => item.position);
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
  }, [items, map, selectedItemId, barangayFilter, resetKey]);

  return null;
}

export default SanitaryGISMap;
