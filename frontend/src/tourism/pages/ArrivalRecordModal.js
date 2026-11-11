import { useEffect, useMemo, useRef } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import { buildArrivalRecordView } from "../utils/arrivalRecordView";

// The modal of one arrival in Arrival Monitoring. It only says what it is given: the record the server sent (with its `computed` part) and the
// web's referenceTables, for the names. Nothing in it is editable, and nothing is worked out here (see utils/arrivalRecordView.js).
function ArrivalRecordModal({ record, referenceTables, onClose, onOpenDestination }) {
  const view = useMemo(() => buildArrivalRecordView(record, referenceTables), [record, referenceTables]);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="arm-backdrop" onClick={onClose}>
      <div
        className="arm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="arm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="arm-band">
          <div className="arm-chips">
            <span className="arm-chip status">
              {view.chips.isArrived ? <FiCheck size={13} aria-hidden="true" /> : null}
              {view.chips.status}
            </span>
            <span className="arm-chip">{view.chips.stay}</span>
            <span className="arm-chip">{view.chips.visitors}</span>
          </div>
          <button type="button" className="arm-close" aria-label="Close" ref={closeRef} onClick={onClose}>
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="arm-body">
          <h2 className="arm-name" id="arm-title">
            {view.title}
          </h2>
          <p className="arm-sub">{view.subline}</p>

          <div className="arm-actions">
            <button
              type="button"
              className="arm-btn primary"
              disabled={view.resortId === null}
              onClick={() => onOpenDestination?.(view.resortId)}
            >
              Open destination
            </button>
          </div>

          {view.groups.map((group) => (
            <section className="arm-group" key={group.title}>
              <h3>{group.title}</h3>
              <div className="arm-grid">
                {group.items.map((entry) => (
                  <div key={entry.label}>
                    <p className="arm-label">{entry.label}</p>
                    <p className="arm-value">
                      {"unit" in entry ? (
                        entry.number === null ? (
                          "—"
                        ) : (
                          <>
                            {entry.number} <span className="arm-unit">{entry.unit}</span>
                          </>
                        )
                      ) : (
                        entry.text
                      )}
                    </p>
                    {entry.sub ? (
                      <p className="arm-subline">
                        <span className="arm-subline-label">{entry.sub.label}</span>
                        <span className="arm-subline-value">{entry.sub.text}</span>
                      </p>
                    ) : null}
                  </div>
                ))}
                {group.note ? <p className="arm-note">{group.note}</p> : null}
              </div>
            </section>
          ))}
        </div>

        <div className="arm-footer">
          <button type="button" className="arm-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ArrivalRecordModal;
