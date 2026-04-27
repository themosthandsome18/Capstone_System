import { useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiPlus,
  FiSearch,
  FiX,
} from "react-icons/fi";

const establishments = [
  ["AquaPure Refilling", "Maria Santos", "Water Refilling Station", "SP", "Brgy. San Isidro", "Good Standing"],
  ["Golden Egg Poultry", "Jose Ramirez", "Poultry Farm", "Large", "Brgy. Malabanan", "Violation"],
  ["Petron Highway", "PMC Corp.", "Gasoline Station", "Large", "Brgy. Poblacion", "Good Standing"],
  ["Lola Nena’s Eatery", "Helena Cruz", "Restaurant / Food Service", "SP", "Brgy. Poblacion", "Upcoming"],
  ["Sunrise Bistro", "Carlos Tan", "Restaurant / Food Service", "Large", "Brgy. San Roque", "For Completion"],
  ["Style Cuts Salon", "Anne Reyes", "Barbershop / Salon", "SP", "Brgy. Bagong Pook", "Good Standing"],
  ["Crystal Springs Water", "B. Aquino", "Water Refilling Station", "Large", "Brgy. San Isidro", "Good Standing"],
  ["Shell Junction", "Shell Phils.", "Gasoline Station", "Large", "Brgy. Poblacion", "Upcoming"],
  ["Happy Hen Farm", "R. Delgado", "Poultry Farm", "SP", "Brgy. Malabanan", "For Completion"],
  ["Market Stall #14", "L. Mendoza", "Public Market Stall", "SP", "Brgy. Poblacion", "Violation"],
  ["Manong Pedro’s Carinderia", "P. Villanueva", "Restaurant / Food Service", "SP", "Brgy. San Roque", "Good Standing"],
  ["FreshCut Barber", "M. Bautista", "Barbershop / Salon", "SP", "Brgy. Bagong Pook", "Good Standing"],
  ["IOT MOTO", "Nerjie Mecantina", "Motorshop", "SP", "Brgy. Polo", "Good Standing"],
];

function EstablishmentRecords() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="establishment-page">
      <div className="establishment-header">
        <div>
          <h1>Establishment Records</h1>
          <p>Manage and monitor all registered establishments</p>
        </div>

        <button
          type="button"
          className="add-establishment-btn"
          onClick={() => setShowModal(true)}
        >
          <FiPlus /> Add Establishment
        </button>
      </div>

      <section className="establishment-table-card">
        <div className="establishment-tools">
          <div className="establishment-search">
            <FiSearch />
            <input type="text" placeholder="Search by name or owner..." />
          </div>

          <select>
            <option>All Statuses</option>
            <option>Good Standing</option>
            <option>Violation</option>
            <option>Upcoming</option>
            <option>For Completion</option>
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>Business Name</th>
              <th>Owner</th>
              <th>Type</th>
              <th>Permit</th>
              <th>Address</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {establishments.map((item) => (
              <tr key={item[0]}>
                <td>{item[0]}</td>
                <td>{item[1]}</td>
                <td>{item[2]}</td>
                <td>
                  <span className="permit-badge">{item[3]}</span>
                </td>
                <td>{item[4]}</td>
                <td>
                  <span className={`status-pill ${statusClass(item[5])}`}>
                    {item[5]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="establishment-pagination">
          <p>Showing 5 of 150 Establishments</p>
          <div>
            <button type="button"><FiChevronLeft /></button>
            <button type="button"><FiChevronRight /></button>
          </div>
        </div>
      </section>

      {showModal && (
        <RegisterEstablishmentModal onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}

function RegisterEstablishmentModal({ onClose }) {
  return (
    <div className="establishment-modal-backdrop">
      <div className="establishment-modal">
        <button type="button" className="modal-close-btn" onClick={onClose}>
          <FiX />
        </button>

        <h2>Register New Establishment</h2>

        <label className="modal-field full">
          <span>Business Name</span>
          <input type="text" placeholder="e.g. Iot Moto" />
        </label>

        <div className="modal-two-grid">
          <label className="modal-field">
            <span>Owner / Proprietor</span>
            <input type="text" placeholder="Full Name" />
          </label>

          <label className="modal-field">
            <span>Address / Barangay</span>
            <input type="text" placeholder="Brgy. ..." />
          </label>
        </div>

        <div className="modal-two-grid">
          <label className="modal-field">
            <span>Business Type</span>
            <select defaultValue="Motorshop">
              <option>Motorshop</option>
              <option>Water Refilling Station</option>
              <option>Poultry Farm</option>
              <option>Gasoline Station</option>
              <option>Restaurant / Food Service</option>
              <option>Barbershop / Salon</option>
            </select>
          </label>

          <label className="modal-field">
            <span>Permit Size</span>
            <select defaultValue="SP (Small)">
              <option>SP (Small)</option>
              <option>Large</option>
            </select>
          </label>
        </div>

        <div className="auto-requirements-box">
          <h3>AUTO-LOADED REQUIREMENTS (SP) - QUARTERLY INSPECTION</h3>
          <div className="auto-req-grid">
            <span>✓ Health Card</span>
            <span>✓ Sanitary Permit</span>
            <span>✓ Stall Cleanliness Inspection</span>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="save-btn">
            Save & Register
          </button>
        </div>
      </div>
    </div>
  );
}

function statusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-");
}

export default EstablishmentRecords;