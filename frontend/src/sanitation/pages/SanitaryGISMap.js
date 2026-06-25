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
import { FiLayers } from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";
// eslint-disable-next-line no-unused-vars
import HeatmapLayer from "../components/HeatmapLayer";
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
  { value: "for_completion", label: "For Completion" },
  { value: "violation", label: "Violation" },
];

const communityReportStatusFilters = [
  { value: "all", label: "All Reports" },
  { value: "pending", label: "New" },
  { value: "investigating", label: "In Review" },
];

function SanitaryGISMap() {
  const location = useLocation();
  const { establishments, householdRecords, complaintData, loading, error, refreshComplaintData } =
    useSanitationData();

  const [mapMode, setMapMode] = useState(location.state?.mode || "establishments");
  const [mapLayer, setMapLayer] = useState("street");
  const [statusFilter, setStatusFilter] = useState("all");
  const [barangayFilter, setBarangayFilter] = useState("All Barangays");
  const [selectedItemId, setSelectedItemId] = useState(location.state?.reportId || null);

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

  const sourceItems = useMemo(() => {
    let source = establishments;
    if (isHouseholdMode) source = householdRecords;
    if (isCommunityMode) {
      source = (complaintData?.rows || []).filter(
        (item) => item.status !== "resolved" && item.status !== "dismissed"
      );
    }

    return source.map((item) => ({
      ...item,
      position: getMapPosition(item),
    }));
  }, [establishments, householdRecords, complaintData, isHouseholdMode, isCommunityMode]);

  const barangays = useMemo(() => {
    const uniqueBarangays = new Set(
      sourceItems.map((item) => item.barangay).filter(Boolean)
    );

    return ["All Barangays", ...Array.from(uniqueBarangays).sort()];
  }, [sourceItems]);

  const filteredSourceItems = useMemo(() => {
    return sourceItems.filter((item) => {
      let statusValue = item.compliance_status;
      if (isHouseholdMode) statusValue = item.status;
      if (isCommunityMode) statusValue = item.status;

      const matchesStatus =
        statusFilter === "all" || statusValue === statusFilter;

      // When a specific barangay is selected, still show all but we track match for highlighting
      return matchesStatus;
    });
  }, [sourceItems, statusFilter, isHouseholdMode, isCommunityMode]);

  const filteredItems = useMemo(
    () => filteredSourceItems.filter((item) => item.position),
    [filteredSourceItems]
  );
  const unmappedItems = useMemo(
    () => filteredSourceItems.filter((item) => !item.position),
    [filteredSourceItems]
  );
  
  const unmappedNewRecords = useMemo(
    () => unmappedItems.filter((item) => !item.inspection_scheduled_date),
    [unmappedItems]
  );

  const unmappedScheduled = useMemo(
    () => unmappedItems.filter((item) => !!item.inspection_scheduled_date),
    [unmappedItems]
  );

  const mappedTotal = sourceItems.filter((item) => item.position).length;
  const unmappedTotal = sourceItems.length - mappedTotal;
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

  const renderGisItem = (item) => {
    let markerColor = getRiskColor(item);
    if (isCommunityMode) {
      markerColor = item.priority === "high" ? "#ef4444" : item.priority === "medium" ? "#f59e0b" : "#10b981";
    }

    const isBarangayMatch =
      barangayFilter === "All Barangays" || item.barangay === barangayFilter;
    const isDimmed = barangayFilter !== "All Barangays" && !isBarangayMatch;
    const isHighlighted = barangayFilter !== "All Barangays" && isBarangayMatch;

    return (
      <button
        key={`${mapMode}-list-${item.id}`}
        type="button"
        className={`gis-item ${
          selectedItem?.id === item.id ? "active" : ""
        }${isHighlighted ? " barangay-highlighted" : ""}${isDimmed ? " barangay-dimmed" : ""}`}
        onClick={() => setSelectedItemId(item.id)}
      >
        <span
          className="dot"
          style={{ background: isDimmed ? "#ccc" : markerColor }}
        />

        <div>
          <strong>
            {isHouseholdMode
              ? item.household_head
              : isCommunityMode
              ? item.complainant_name || "Anonymous"
              : item.business_name}
          </strong>

          <small>
            {isHouseholdMode
              ? `${item.household_code} | ${item.barangay}`
              : isCommunityMode
              ? `${item.complaint_id} | ${item.barangay}`
              : `${item.business_type_name} | ${item.barangay}`}
          </small>
        </div>
      </button>
    );
  };

  const normalizeBgy = (name) => (name || "").toLowerCase().trim();

  const barangayAggregates = useMemo(() => {
    const aggregates = {};
    
    if (maubanBarangaysGeoJSON?.features) {
       maubanBarangaysGeoJSON.features.forEach(feature => {
          aggregates[normalizeBgy(feature.properties.NAME_3)] = { total: 0, high: 0, medium: 0, low: 0 };
       });
    }

    filteredItems.forEach(item => {
      const bgy = normalizeBgy(item.barangay);
      if (!aggregates[bgy]) aggregates[bgy] = { total: 0, high: 0, medium: 0, low: 0 };
      
      aggregates[bgy].total += 1;
      
      let risk = "low";
      if (isHouseholdMode) {
         if (item.status === 'violation') risk = "high";
         else if (item.status === 'for_completion') risk = "medium";
      } else if (isCommunityMode) {
         if (item.priority === 'high' || item.status === 'pending') risk = "high";
         else if (item.priority === 'medium' || item.status === 'investigating') risk = "medium";
      } else {
         if (item.compliance_status === 'violation' || item.compliance_status === 'no_permit') risk = "high";
         else if (item.compliance_status === 'upcoming' || item.compliance_status === 'for_completion') risk = "medium";
      }
      
      aggregates[bgy][risk] += 1;
    });

    const result = {};
    for (const bgy in aggregates) {
      if (aggregates[bgy].total === 0) {
        result[bgy] = { risk: "none", total: 0 };
      } else {
        const t = aggregates[bgy].total;
        result[bgy] = {
          risk: aggregates[bgy].high > 0 ? "high" : aggregates[bgy].medium > 0 ? "medium" : "low",
          total: t,
          highPct: (aggregates[bgy].high / t) * 100,
          mediumPct: (aggregates[bgy].medium / t) * 100,
          lowPct: (aggregates[bgy].low / t) * 100
        };
      }
    }
    return result;
  }, [filteredItems, isHouseholdMode, isCommunityMode]);

  const geoJsonStyle = (feature) => {
    const bgyName = normalizeBgy(feature.properties.NAME_3);
    const agg = barangayAggregates[bgyName] || { risk: "none", total: 0 };
    
    const isSelected = barangayFilter !== "All Barangays" && normalizeBgy(barangayFilter) === bgyName;
    const isDimmed = barangayFilter !== "All Barangays" && !isSelected;
    
    // Only show colors if this specific barangay is selected.
    let fillColor = "transparent";
    let fillOpacity = 0.05; // very faint fill to allow clicking anywhere inside
    
    if (agg.total > 0 && isSelected) {
      fillColor = `url(#grad-${bgyName.replace(/\s+/g, '-')})`;
      fillOpacity = 0.8;
    }

    return {
      fillColor,
      weight: isSelected ? 3 : 1,
      opacity: isDimmed ? 0.3 : 0.8,
      color: isSelected ? "#0f172a" : "#64748b",
      dashArray: isSelected ? "" : "3",
      fillOpacity
    };
  };

  const onEachFeature = (feature, layer) => {
    if (feature.properties && feature.properties.NAME_3) {
      const bgyName = feature.properties.NAME_3;
      const agg = barangayAggregates[normalizeBgy(bgyName)];
      
      let tooltipContent = `<strong>${bgyName}</strong><br/>`;
      if (agg && agg.total > 0) {
        tooltipContent += `High Risk (Red): ${Math.round(agg.highPct)}%<br/>`;
        tooltipContent += `Medium Risk (Yellow): ${Math.round(agg.mediumPct)}%<br/>`;
        tooltipContent += `Low Risk (Green): ${Math.round(agg.lowPct)}%`;
      } else {
        tooltipContent += `No Records`;
      }
      
      layer.bindTooltip(tooltipContent);
      
      layer.on({
        click: () => {
          // If we have it exactly matching dropdown options, we can set it.
          // Otherwise, it might not match exact casing. We could find the exact casing from the barangays list.
          const matchingOption = barangays.find(b => normalizeBgy(b) === normalizeBgy(bgyName));
          if (matchingOption) setBarangayFilter(matchingOption);
        }
      });
    }
  };


  if (loading) {
    return <div className="sanitary-gis-page">Loading GIS map...</div>;
  }

  return (
    <div className="sanitary-gis-page">
      <div className="sanitary-page-header">
        <h2>Sanitary GIS Map</h2>
        <p>
          Geographic visualization of establishment and household sanitation
          status
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
            {barangays.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay}
              </option>
            ))}
          </select>
        </div>

        <div className="gis-layer-toggle">
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

        <div className="gis-legend">
          <span>
            <i className="low" /> {isCommunityMode ? "Routine" : "Low Risk"}
          </span>

          <span>
            <i className="moderate" /> {isCommunityMode ? "Standard" : "Medium Risk"}
          </span>

          <span>
            <i className="high" /> {isCommunityMode ? "Urgent" : "High Risk"}
          </span>
        </div>
      </div>

      <div 
        className="gis-map-summary-row"
        style={isCommunityMode ? { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" } : undefined}
      >
        {isCommunityMode ? (
          <>
            <MapSummaryCard label="Total" value={filteredItems.length} color="#3b82f6" />
            <MapSummaryCard label="Under Investigation" value={filteredItems.filter(i => i.status === "investigating").length} color="#eab308" />
            <MapSummaryCard label="Pending" value={filteredItems.filter(i => i.status === "pending").length} color="#ef4444" />
          </>
        ) : (
          <>
            <MapSummaryCard label="Mapped" value={mappedTotal} />
            <MapSummaryCard label="Unmapped" value={unmappedTotal} />
            <MapSummaryCard label="Filtered Pins" value={filteredItems.length} />
            <MapSummaryCard label="Filtered Unmapped" value={unmappedItems.length} />
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
            <TileLayer
              attribution={tileLayer.attribution}
              url={tileLayer.url}
            />

            <FitMapToItems items={filteredItems} selectedItemId={selectedItemId} />

            {/* Dynamic SVG Gradients for Barangay Polygons */}
            <svg style={{ width: 0, height: 0, position: "absolute" }}>
              <defs>
                {Object.entries(barangayAggregates).map(([bgyName, agg]) => {
                  if (agg.total === 0) return null;
                  const redEnd = agg.highPct;
                  const yellowEnd = redEnd + agg.mediumPct;
                  return (
                    <linearGradient 
                      key={bgyName} 
                      id={`grad-${bgyName.replace(/\s+/g, '-')}`} 
                      x1="0%" y1="0%" x2="100%" y2="100%"
                    >
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset={`${redEnd}%`} stopColor="#ef4444" />
                      
                      <stop offset={`${redEnd}%`} stopColor="#eab308" />
                      <stop offset={`${yellowEnd}%`} stopColor="#eab308" />
                      
                      <stop offset={`${yellowEnd}%`} stopColor="#22c55e" />
                      <stop offset="100%" stopColor="#22c55e" />
                    </linearGradient>
                  );
                })}
              </defs>
            </svg>

            {isHouseholdMode ? (
              <GeoJSON 
                key={`${mapMode}-${barangayFilter}-${statusFilter}`}
                data={maubanBarangaysGeoJSON} 
                style={geoJsonStyle} 
                onEachFeature={onEachFeature}
              />
            ) : (
              filteredItems.map((item) => (
                <Marker key={`${mapMode}-marker-${item.id}`} position={item.position}>
                  <Popup>
                    <div style={{ padding: "4px" }}>
                      <strong style={{ fontSize: "14px", color: "#0f172a", display: "block" }}>
                        {isCommunityMode
                          ? item.complainant_name || "Anonymous"
                          : item.business_name}
                      </strong>
                      <div style={{ fontSize: "12px", marginTop: "4px", color: "#64748b" }}>
                        {isCommunityMode
                          ? `${item.complaint_id} | ${item.barangay}`
                          : `${item.business_type_name} | ${item.barangay}`}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))
            )}
          </MapContainer>

          {!filteredItems.length ? (
            <div className="gis-map-empty-overlay">
              No mapped coordinates match the current filters.
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
            {isHouseholdMode ? "Mapped Households" : isCommunityMode ? "Mapped Community Reports" : "Mapped Establishments"}
          </h3>

          {selectedItem ? (
            <div className="gis-selected-card">
              <strong>
                {isHouseholdMode
                  ? selectedItem.household_head
                  : isCommunityMode
                  ? selectedItem.complainant_name || "Anonymous"
                  : selectedItem.business_name}
              </strong>

              <p>
                {isHouseholdMode
                  ? `${selectedItem.household_code} | ${selectedItem.barangay}`
                  : isCommunityMode
                  ? `${selectedItem.complaint_id} | ${selectedItem.barangay}`
                  : `${selectedItem.business_type_name} | ${selectedItem.barangay}`}
              </p>

              <span
                className={`status-pill ${statusClass(
                  isHouseholdMode || isCommunityMode
                    ? selectedItem.status_label || selectedItem.status
                    : selectedItem.compliance_status_label
                )}`}
              >
                {isHouseholdMode || isCommunityMode
                  ? selectedItem.status_label || selectedItem.status
                  : selectedItem.compliance_status_label}
              </span>
            </div>
          ) : null}

          <div className="gis-list">
            {isCommunityMode ? (
              <>
                {filteredItems.filter((i) => i.status === "pending").length > 0 && (
                  <>
                    <div style={{ padding: "12px 16px 4px", fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Pending</div>
                    {filteredItems.filter((i) => i.status === "pending").map(renderGisItem)}
                  </>
                )}
                {filteredItems.filter((i) => i.status === "investigating").length > 0 && (
                  <>
                    <div style={{ padding: "12px 16px 4px", fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Under Investigation</div>
                    {filteredItems.filter((i) => i.status === "investigating").map(renderGisItem)}
                  </>
                )}
                {!filteredItems.length && (
                  <p className="gis-empty">No mapped community reports found.</p>
                )}
              </>
            ) : (
              filteredItems.length ? (
                filteredItems.map(renderGisItem)
              ) : (
                <p className="gis-empty">
                  No mapped {isHouseholdMode ? "households" : "establishments"} found.
                </p>
              )
            )}
          </div>

          {isCommunityMode ? (
            <>
              {unmappedNewRecords.length ? (
                <div className="gis-unmapped-panel">
                  <h4>Record</h4>
                  <p>Just arrived, needs inspector assignment.</p>

                  {unmappedNewRecords.slice(0, 8).map((item) => (
                    <div key={`${mapMode}-unmapped-new-${item.id}`}>
                      <strong>{item.complainant_name || "Anonymous"}</strong>
                      <small>{item.barangay || "No barangay"}</small>
                    </div>
                  ))}
                </div>
              ) : null}

              {unmappedScheduled.length ? (
                <div className="gis-unmapped-panel">
                  <h4>Inspected</h4>
                  <p>Inspector assigned and scheduled.</p>

                  {unmappedScheduled.slice(0, 8).map((item) => (
                    <div key={`${mapMode}-unmapped-scheduled-${item.id}`}>
                      <strong>{item.complainant_name || "Anonymous"}</strong>
                      <small>{item.barangay || "No barangay"}</small>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            unmappedItems.length ? (
              <div className="gis-unmapped-panel">
                <h4>Unmapped Records</h4>
                <p>These records match the filters but need latitude and longitude.</p>

                {unmappedItems.slice(0, 8).map((item) => (
                  <div key={`${mapMode}-unmapped-${item.id}`}>
                    <strong>
                      {isHouseholdMode ? item.household_head : item.business_name}
                    </strong>
                    <small>{item.barangay || "No barangay"}</small>
                  </div>
                ))}
              </div>
            ) : null
          )}
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



function FitMapToItems({ items, selectedItemId }) {
  const map = useMap();

  useEffect(() => {
    if (selectedItemId) {
      const selected = items.find((i) => i.id === selectedItemId);
      if (selected && selected.position) {
        map.flyTo(selected.position, 16, { duration: 0.5 });
        return;
      }
    }

    if (!items.length) {
      map.setView(maubanCenter, 14);
      return;
    }

    if (items.length === 1) {
      map.setView(items[0].position, 15);
      return;
    }

    const bounds = items.map((item) => item.position);
    map.fitBounds(bounds, { padding: [36, 36] });
  }, [items, map, selectedItemId]);

  return null;
}

function getRiskColor(item) {
  const score = Number(item.risk_score || 0);

  if (score >= 70) return "#ef2222";
  if (score >= 35) return "#f5c400";
  return "#0f7a45";
}



function statusClass(status = "") {
  return status.toLowerCase().replaceAll(" ", "-");
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getMapPosition(item) {
  const lat =
    parseCoordinate(item.latitude) ?? parseCoordinate(item.coordinates?.lat);
  const lng =
    parseCoordinate(item.longitude) ?? parseCoordinate(item.coordinates?.lng);

  if (lat === null || lng === null) {
    return null;
  }

  if (Math.abs(lat) < 0.001 || Math.abs(lng) < 0.001) {
    return null;
  }

  if (lat < 13.9 || lat > 14.4 || lng < 121.55 || lng > 122) {
    return null;
  }

  return [lat, lng];
}

export default SanitaryGISMap;
