import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiCheckCircle, FiPlus } from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

function TypesAndRequirements() {
  const { businessTypes, loading, error } = useSanitationData();
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [permitSize, setPermitSize] = useState("sp");

  useEffect(() => {
    if (!selectedTypeId && businessTypes.length) {
      setSelectedTypeId(String(businessTypes[0].id));
    }
  }, [businessTypes, selectedTypeId]);

  const selectedType = useMemo(() => {
    return businessTypes.find(
      (type) => String(type.id) === String(selectedTypeId)
    );
  }, [businessTypes, selectedTypeId]);

  const requirements = useMemo(() => {
    if (!selectedType) {
      return [];
    }

    return (selectedType.requirements || []).filter(
      (requirement) => requirement.permit_size === permitSize
    );
  }, [selectedType, permitSize]);

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
            {businessTypes.length ? (
              businessTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setSelectedTypeId(String(type.id))}
                  className={String(selectedTypeId) === String(type.id) ? "active" : ""}
                >
                  <span>{type.name}</span>
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
                    SP
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
                <h3>Requirements Checklist</h3>

                {requirements.length ? (
                  requirements.map((item) => (
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

  return value || "Not Set";
}

export default TypesAndRequirements;