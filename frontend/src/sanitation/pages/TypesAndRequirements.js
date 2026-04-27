import { useState } from "react";
import { FiCalendar, FiCheckCircle, FiPlus } from "react-icons/fi";

const businessTypes = [
  {
    name: "Water Refilling Station",
    frequency: "Monthly",
    small: [
      "Potability Test Bacteriological",
      "Health Cards of Workers",
      "Sanitary Permit",
      "Daily Cleaning Log",
    ],
    large: [
      "Potability Test (Bacteriological & Physico-chemical)",
      "Health Cards of all Workers",
      "Sanitary Permit",
      "Water Source Clearance",
      "Equipment Calibration Records",
      "HACCP Documentation",
    ],
  },
  {
    name: "Poultry Farm",
    frequency: "Quarterly",
    small: ["Sanitary Permit", "Waste Disposal Plan", "Cleaning Schedule"],
    large: ["Sanitary Permit", "Waste Disposal Plan", "Vector Control Plan", "Inspection Certificate"],
  },
  {
    name: "Gasoline Station",
    frequency: "Quarterly",
    small: ["Sanitary Permit", "Restroom Maintenance Log"],
    large: ["Sanitary Permit", "Restroom Maintenance Log", "Wastewater Compliance Record"],
  },
  {
    name: "Restaurant / Food Service",
    frequency: "Monthly",
    small: ["Sanitary Permit", "Health Cards", "Food Safety Checklist"],
    large: ["Sanitary Permit", "Health Cards", "Food Safety Checklist", "Kitchen Inspection Record"],
  },
  {
    name: "Barbershop / Salon",
    frequency: "Quarterly",
    small: ["Sanitary Permit", "Disinfection Log"],
    large: ["Sanitary Permit", "Disinfection Log", "Equipment Sanitation Record"],
  },
  {
    name: "Public Market Stall",
    frequency: "Monthly",
    small: ["Sanitary Permit", "Cleaning Log"],
    large: ["Sanitary Permit", "Cleaning Log", "Waste Disposal Record"],
  },
];

function TypesAndRequirements() {
  const [selectedType, setSelectedType] = useState(businessTypes[0]);
  const [size, setSize] = useState("small");

  const requirements = size === "small" ? selectedType.small : selectedType.large;

  return (
    <div className="sanitary-requirements-page">
      <div className="sanitary-page-header">
        <h1>Business Types & Requirements</h1>
        <p>Manage sanitary requirements per business category</p>
      </div>

      <div className="requirements-grid">
        <section className="requirements-card business-type-card">
          <div className="requirements-card-header">
            <h2>Business Types</h2>
            <button type="button">
              <FiPlus />
              Add
            </button>
          </div>

          <div className="business-type-list">
            {businessTypes.map((type) => (
              <button
                key={type.name}
                type="button"
                onClick={() => setSelectedType(type)}
                className={selectedType.name === type.name ? "active" : ""}
              >
                <span>{type.name}</span>
                <small>{type.frequency}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="requirements-card checklist-card">
          <div className="checklist-top">
            <div>
              <h2>{selectedType.name}</h2>
              <p>
                <FiCalendar />
                Inspection Frequency: <strong>{selectedType.frequency}</strong>
              </p>
            </div>

            <div className="size-toggle">
              <button
                type="button"
                className={size === "small" ? "active" : ""}
                onClick={() => setSize("small")}
              >
                SP (Small)
              </button>
              <button
                type="button"
                className={size === "large" ? "active" : ""}
                onClick={() => setSize("large")}
              >
                Large
              </button>
            </div>
          </div>

          <div className="requirements-checklist">
            <h3>Requirements Checklist</h3>

            {requirements.map((item) => (
              <div key={item} className="requirement-row">
                <FiCheckCircle />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="auto-applied-note">
            <strong>Auto-applied:</strong> When a new establishment is registered with type{" "}
            <b>{selectedType.name}</b> ({size === "small" ? "SP" : "Large"}), these{" "}
            {requirements.length} requirements are automatically loaded into its inspection
            checklist on a {selectedType.frequency.toLowerCase()} cycle.
          </div>
        </section>
      </div>
    </div>
  );
}

export default TypesAndRequirements;