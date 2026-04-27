import { useState } from "react";
import {
  FiBell,
  FiCalendar,
  FiCamera,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiSearch,
  FiX,
} from "react-icons/fi";

const inspectionRows = [
  {
    name: "Market Stall #14",
    address: "Brgy. Poblacion",
    type: "Public Market Stall (Monthly)",
    last: "2026-02-28",
    next: "2026-03-28",
    due: "26d overdue",
    status: "Violation",
  },
  {
    name: "Sunrise Bistro",
    address: "Brgy. San Roque",
    type: "Restaurant / Food Service (Monthly)",
    last: "2026-03-02",
    next: "2026-04-02",
    due: "21d overdue",
    status: "For Completion",
  },
  {
    name: "AquaPure Refilling",
    address: "Brgy. San Isidro",
    type: "Water Refilling Station (Monthly)",
    last: "2026-03-12",
    next: "2026-04-12",
    due: "11d overdue",
    status: "Good Standing",
  },
  {
    name: "Golden Egg Poultry",
    address: "Brgy. Malabanan",
    type: "Poultry Farm (Quarterly)",
    last: "2026-01-20",
    next: "2026-04-20",
    due: "3d overdue",
    status: "Violation",
  },
  {
    name: "Crystal Springs Water",
    address: "Brgy. San Isidro",
    type: "Water Refilling Station (Monthly)",
    last: "2026-03-22",
    next: "2026-04-22",
    due: "1d overdue",
    status: "Good Standing",
  },
  {
    name: "Lola Nena’s Eatery",
    address: "Brgy. Poblacion",
    type: "Restaurant / Food Service (Monthly)",
    last: "2026-03-18",
    next: "2026-04-25",
    due: "in 2d",
    status: "Upcoming",
  },
  {
    name: "Manong Pedro’s Carinderia",
    address: "Brgy. San Roque",
    type: "Restaurant / Food Service (Monthly)",
    last: "2026-03-25",
    next: "2026-04-25",
    due: "in 2d",
    status: "Good Standing",
  },
  {
    name: "Shell Junction",
    address: "Brgy. Poblacion",
    type: "Gasoline Station (Quarterly)",
    last: "2026-01-30",
    next: "2026-04-28",
    due: "in 5d",
    status: "Upcoming",
  },
  {
    name: "Petron Highway",
    address: "Brgy. Poblacion",
    type: "Gasoline Station (Quarterly)",
    last: "2026-02-05",
    next: "2026-05-05",
    due: "in 12d",
    status: "Good Standing",
  },
  {
    name: "Happy Hen Farm",
    address: "Brgy. Malabanan",
    type: "Poultry Farm (Monthly)",
    last: "2026-02-10",
    next: "2026-05-10",
    due: "in 17d",
    status: "For Completion",
  },
  {
    name: "Style Cuts Salon",
    address: "Brgy. Bagong Pook",
    type: "Barbershop / Salon (Quarterly)",
    last: "2026-02-15",
    next: "2026-05-15",
    due: "in 22d",
    status: "Good Standing",
  },
  {
    name: "FreshCut Barber",
    address: "Brgy. Bagong Pook",
    type: "Barbershop / Salon (Quarterly)",
    last: "2026-02-22",
    next: "2026-05-22",
    due: "in 29d",
    status: "Good Standing",
  },
  {
    name: "Iot Moto",
    address: "Brgy. Bagong Bayan",
    type: "MotorShop (Quarterly)",
    last: "2026-02-24",
    next: "2026-05-24",
    due: "in 30d",
    status: "Good Standing",
  },
];

const calendarCells = [
  { day: "20" },
  { day: "21", title: "Golden Egg Poultry", status: "violation" },
  { day: "22" },
  { day: "23", title: "Crystal Springs Water", status: "good" },
  { day: "24" },
  { day: "25", title: "Lola Nena’s Eatery", title2: "Manong Pedro’s Carinderia", status: "upcoming" },
  { day: "26" },
  { day: "27" },
  { day: "28" },
  { day: "29", title: "Shell Junction", status: "upcoming" },
  { day: "30" },
  { day: "1" },
  { day: "2" },
  { day: "3" },
  { day: "4" },
  { day: "5" },
  { day: "6", title: "Petron Highway", status: "good" },
  { day: "7" },
  { day: "8" },
  { day: "9" },
  { day: "10" },
  { day: "11", title: "Happy Hen Farm", status: "completion" },
  { day: "12" },
  { day: "13" },
  { day: "14" },
  { day: "15" },
  { day: "16", title: "Style Cuts Salon", status: "good" },
  { day: "17" },
];

function InspectionManagement() {
  const [view, setView] = useState("list");
  const [showForm, setShowForm] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(inspectionRows[0]);

  function openForm(row) {
    setSelectedInspection(row);
    setShowForm(true);
  }

  return (
    <div className="inspection-page">
      <div className="inspection-header">
        <h1>Inspection Management</h1>
        <p>Track and manage sanitary inspections</p>
      </div>

      <div className="inspection-alert">
        <FiBell />
        <div>
          <h3>Inspection Alerts</h3>
          <p>
            <span>3</span> establishment(s) due within 7 days •{" "}
            <strong>5</strong> overdue
          </p>
        </div>
      </div>

      <div className="inspection-view-row">
        <div className="inspection-view-toggle">
          <button
            type="button"
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            List View
          </button>
          <button
            type="button"
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            Calendar View
          </button>
        </div>

        <div className="inspection-legend">
          <span className="good">● Good Standing</span>
          <span className="upcoming">● Upcoming</span>
          <span className="completion">● For Completion</span>
          <span className="violation">● Violation</span>
        </div>
      </div>

      {view === "list" ? (
        <section className="inspection-table-card">
          <div className="inspection-search">
            <FiSearch />
            <input type="text" placeholder="Search records..." />
          </div>

          <table>
            <thead>
              <tr>
                <th>Establishment</th>
                <th>Type</th>
                <th>Last Inspection</th>
                <th>Next Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {inspectionRows.map((row) => (
                <tr key={row.name}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.address}</small>
                  </td>
                  <td>{row.type}</td>
                  <td>{row.last}</td>
                  <td>
                    <strong>{row.next}</strong>
                    <small className={row.due.includes("overdue") ? "overdue" : ""}>
                      {row.due}
                    </small>
                  </td>
                  <td>
                    <span className={`inspection-status ${statusClass(row.status)}`}>
                      ● {row.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="conduct-btn"
                      onClick={() => openForm(row)}
                    >
                      <FiClipboard />
                      Conduct
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="inspection-pagination">
            <p>Showing 13 of 150</p>
            <div>
              <button type="button">
                <FiChevronLeft />
              </button>
              <button type="button">
                <FiChevronRight />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="inspection-calendar-card">
          <h3>
            <FiCalendar />
            Upcoming Inspections - Next 4 Weeks
          </h3>

          <div className="calendar-weekdays">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="inspection-calendar-grid">
            {calendarCells.map((cell, index) => (
              <div key={`${cell.day}-${index}`} className={`calendar-cell ${cell.status || ""}`}>
                <span>{cell.day}</span>
                {cell.title && <strong>{cell.title}</strong>}
                {cell.title2 && <b>{cell.title2}</b>}
              </div>
            ))}
          </div>
        </section>
      )}

      {showForm && (
        <InspectionFormModal
          inspection={selectedInspection}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function InspectionFormModal({ inspection, onClose }) {
  return (
    <div className="inspection-modal-backdrop">
      <div className="inspection-modal">
        <button type="button" className="inspection-close-btn" onClick={onClose}>
          <FiX />
        </button>

        <div className="inspection-form-title">
          <h2>
            Inspection Form : <strong>{inspection.name}</strong>
          </h2>
          <p>Public Market Stall • SP • Monthly Inspection Cycle</p>
        </div>

        <div className="inspection-form-grid">
          <label>
            <span>Inspector Name</span>
            <input type="text" placeholder="Insp. J. Cruz" />
          </label>

          <label>
            <span>Date of Inspection</span>
            <div className="date-input">
              <input type="text" defaultValue="04/24/2026" />
              <FiCalendar />
            </div>
          </label>
        </div>

        <div className="inspection-checklist-box">
          <div className="inspection-checklist-title">
            <h3>Requirements Checklist</h3>
            <span>67% complete</span>
          </div>

          <label className="check-row checked">
            <input type="checkbox" defaultChecked />
            <span>Helath Card</span>
          </label>

          <label className="check-row">
            <input type="checkbox" />
            <span>Sanitary Permit</span>
          </label>

          <label className="check-row checked">
            <input type="checkbox" defaultChecked />
            <span>Stall Cleanliness Inspection</span>
          </label>
        </div>

        <label className="inspection-textarea">
          <span>Remarks / Findings</span>
          <textarea placeholder="Notes on observed conditions, violations, or follow-up actions..." />
        </label>

        <div className="photo-upload-title">
          <FiCamera />
          <span>Photo Documentation (optional)</span>
        </div>

        <div className="photo-upload-box">
          Drag & drop photos here, or click to upload
        </div>

        <div className="inspection-warning">
          ⚠ Status will be auto-set to <strong>For Completion</strong> if any
          requirement is unchecked.
        </div>

        <div className="inspection-form-actions">
          <button type="button" className="draft-btn">
            Save Draft
          </button>
          <button type="button" className="submit-inspection-btn">
            Submit Inspection
          </button>
        </div>
      </div>
    </div>
  );
}

function statusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-");
}

export default InspectionManagement;