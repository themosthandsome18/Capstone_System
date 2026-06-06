import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiCheckCircle, FiPlus } from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

const STANDARD_REQUIREMENT_NAMES = [
  "Xerox copy of DTI/SEC/CDA",
  "Barangay Clearance of owner",
  "Chest X-ray Results (Owner & employees)",
  "CTC/Cedula of owner and employees",
  "1x1 picture of owner and employees",
  "Potability of Water Supply - Physical/Chemical Examination",
  "Potability of Water Supply - Microbiological Examination",
];

const BUSINESS_TYPE_ORDER = [
  "Water Refilling Station",
  "Agro-industrial Establishment (Poultry / Piggery Farm)",
  "Restaurant / Food Establishment",
  "Public Market Stall",
  "Drug Store",
  "Sub-contractor",
  "Resort / Picnic Ground",
  "Boatman",
  "Massage / Physical Therapy",
  "Funeral Parlor",
  "Burial Ground",
  "Private Laboratory & Clinic",
  "Karaoke / Video Bar / CSW",
];

function TypesAndRequirements() {
  const { businessTypes, loading, error } = useSanitationData();
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [permitSize, setPermitSize] = useState("sp");

  const orderedBusinessTypes = useMemo(() => {
    return [...businessTypes].sort((first, second) => {
      const firstIndex = BUSINESS_TYPE_ORDER.indexOf(first.name);
      const secondIndex = BUSINESS_TYPE_ORDER.indexOf(second.name);

      if (firstIndex === -1 && secondIndex === -1) {
        return first.name.localeCompare(second.name);
      }

      if (firstIndex === -1) {
        return 1;
      }

      if (secondIndex === -1) {
        return -1;
      }

      return firstIndex - secondIndex;
    });
  }, [businessTypes]);

  useEffect(() => {
    if (!selectedTypeId && orderedBusinessTypes.length) {
      setSelectedTypeId(String(orderedBusinessTypes[0].id));
    }
  }, [orderedBusinessTypes, selectedTypeId]);

  const selectedType = useMemo(() => {
    return orderedBusinessTypes.find(
      (type) => String(type.id) === String(selectedTypeId)
    );
  }, [orderedBusinessTypes, selectedTypeId]);

  const requirements = useMemo(() => {
    if (!selectedType) {
      return [];
    }

    return (selectedType.requirements || []).filter(
      (requirement) => requirement.permit_size === permitSize
    );
  }, [selectedType, permitSize]);

  const standardRequirements = useMemo(() => {
    return STANDARD_REQUIREMENT_NAMES.map((requirementName) =>
      requirements.find((item) => item.requirement_name === requirementName)
    ).filter(Boolean);
  }, [requirements]);

  const additionalRequirements = useMemo(() => {
    return requirements.filter(
      (requirement) =>
        !STANDARD_REQUIREMENT_NAMES.includes(requirement.requirement_name)
    );
  }, [requirements]);

  if (loading) {
    return (
      <div className="sanitary-requirements-page">
        Loading business types and requirements...
      </div>
    );
  }

  return (
    <div className="sanitary-requirements-page">
      <div className="sanitary-page-header">
        <h1>Business Types & Requirements</h1>
        <p>Manage sanitary requirements per business category</p>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <div className="requirements-grid">
        <section className="requirements-card business-type-card">
          <div className="requirements-card-header">
            <h2>Business Types</h2>
            <button type="button" title="Business type setup is managed in admin">
              <FiPlus />
              Add
            </button>
          </div>

          <div className="business-type-list">
            {orderedBusinessTypes.length ? (
              orderedBusinessTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setSelectedTypeId(String(type.id))}
                  className={String(selectedTypeId) === String(type.id) ? "active" : ""}
                >
                  <span title={type.name}>{type.name}</span>
                  <small>{formatFrequency(type.inspection_frequency)}</small>
                </button>
              ))
            ) : (
              <p className="requirements-empty">No business types found.</p>
            )}
          </div>
        </section>

        <section className="requirements-card checklist-card">
          {selectedType ? (
            <>
              <div className="checklist-top">
                <div>
                  <h2>{selectedType.name}</h2>
                  <p>
                    <FiCalendar />
                    Inspection Frequency:{" "}
                    <strong>
                      {formatFrequency(selectedType.inspection_frequency)}
                    </strong>
                  </p>
                </div>

                <div className="size-toggle">
                  <button
                    type="button"
                    className={permitSize === "sp" ? "active" : ""}
                    onClick={() => setPermitSize("sp")}
                  >
                    SP (Small)
                  </button>
                  <button
                    type="button"
                    className={permitSize === "large" ? "active" : ""}
                    onClick={() => setPermitSize("large")}
                  >
                    Large
                  </button>
                </div>
              </div>

              <div className="requirements-checklist">
                <h3>
                  Standard Requirements{" "}
                  <small>(applies to all establishments)</small>
                </h3>

                {standardRequirements.length ? (
                  standardRequirements.map((item) => (
                    <div key={item.id} className="requirement-row">
                      <FiCheckCircle />
                      <span>{item.requirement_name}</span>
                    </div>
                  ))
                ) : (
                  <div className="requirement-row">
                    <span>No requirements found for this permit size.</span>
                  </div>
                )}
              </div>

              <div className="requirements-checklist additional-requirements">
                <h3>
                  Additional Requirements for {selectedType.name}{" "}
                  <small>({permitSize === "sp" ? "SP" : "Large"})</small>
                </h3>

                {additionalRequirements.length ? (
                  additionalRequirements.map((item) => (
                    <div key={item.id} className="requirement-row">
                      <FiCheckCircle />
                      <span>{item.requirement_name}</span>
                    </div>
                  ))
                ) : (
                  <div className="requirement-row">
                    <span>No additional requirements for this business type.</span>
                  </div>
                )}
              </div>

              <div className="auto-applied-note">
                <strong>Auto-applied:</strong> When a new establishment is
                registered with type <b>{selectedType.name}</b>{" "}
                ({permitSize === "sp" ? "SP" : "Large"}), these{" "}
                {requirements.length} requirements are automatically loaded into
                its inspection checklist on a{" "}
                {formatFrequency(selectedType.inspection_frequency).toLowerCase()}{" "}
                cycle.
              </div>
            </>
          ) : (
            <p className="requirements-empty">
              Select a business type to view requirements.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function formatFrequency(value = "") {
  if (value === "monthly") {
    return "Monthly";
  }

  if (value === "quarterly") {
    return "Quarterly";
  }

  if (value === "annual") {
    return "Annual";
  }

  return value || "Not Set";
}

export default TypesAndRequirements;
