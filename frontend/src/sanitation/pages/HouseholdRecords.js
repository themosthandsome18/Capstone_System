import {
  FiAlertTriangle,
  FiChevronLeft,
  FiChevronRight,
  FiDroplet,
  FiHome,
  FiSearch,
} from "react-icons/fi";

const households = [
  ["H-0001", "Dela Cruz, Coedy", "2", "Water-Sealed", "Level III (LGU Waterworks)", "Collected by LGU", "Good Standing"],
  ["H-0002", "Santos, Juan", "7", "Pour-Flush", "Level I (Deep Well)", "Composed", "Violation"],
  ["H-0003", "Trish-Anne Huidem", "3", "Pit Latrine", "Level II (Communal Faucet)", "Burned", "For Completion"],
  ["H-0004", "Julia Santos", "3", "None", "Level III (LGU Waterworks)", "Dumped", "Violation"],
  ["H-0005", "Beca Mitchel", "8", "Water-Sealed", "Level I (LGU Waterworks)", "Collected by LGU", "Good Standing"],
  ["H-0006", "Dela Cruz, Juan", "6", "Pour-Flush", "Level II (Communal Faucet)", "Composed", "Good Standing"],
  ["H-0007", "Nerjie Mecantina", "4", "Pit Latrine", "Level III (LGU Waterworks)", "Burned", "Good Standing"],
  ["H-0008", "Wennielyn Lorenzana", "2", "None", "Level I (Deep Well)", "Dumped", "Violation"],
  ["H-0009", "Ralph Richmond Amarillo", "4", "Water-Sealed", "Level II (Communal Faucet)", "Collected by LGU", "For Completion"],
  ["H-0010", "Quert Russel Lalisan", "7", "Pour-Flush", "Level III (LGU Waterworks)", "Composed", "For Completion"],
  ["H-0011", "John Joseph Israel", "6", "Pit Latrine", "Level I (Deep Well)", "Burned", "Good Standing"],
  ["H-0012", "Emmanuel Aviles", "9", "None", "Level II (Communal Faucet)", "Dumped", "Violation"],
];

const riskBarangays = [
  { name: "Poblacion", value: 4, color: "red" },
  { name: "San Isidro", value: 4, color: "yellow" },
  { name: "Malabanan", value: 4, color: "yellow" },
  { name: "San Roque", value: 4, color: "yellow" },
  { name: "Bagong Pook", value: 4, color: "yellow" },
];

function HouseholdRecords() {
  return (
    <div className="household-page">
      <div className="household-header">
        <h1>Household Records</h1>
        <p>Monitor household sanitation profiles and risk indicators</p>
      </div>

      <div className="household-stat-grid">
        <HouseholdStat title="Total Households" value="12" icon={<FiHome />} color="green" />
        <HouseholdStat title="With Sanitary Facility" value="6" desc="50% coverage" icon={<FiHome />} color="dark" />
        <HouseholdStat title="With Water Access" value="8" desc="level II & III" icon={<FiDroplet />} color="blue" />
        <HouseholdStat title="At-Risk Households" value="4" icon={<FiAlertTriangle />} color="red" />
      </div>

      <div className="household-chart-grid">
        <section className="household-chart-card">
          <div className="household-chart-title">
            <div>
              <h3>At- High Risk Households by Barangay</h3>
              <p>Across all barangays - violation status</p>
            </div>

            <div className="risk-badge">
              <span>Highest Risk</span>
              <strong>Brgy. Poblacion</strong>
              <small>4 of 12 (33%)</small>
            </div>
          </div>

          <div className="risk-bar-list">
            {riskBarangays.map((item) => (
              <div className="risk-row" key={item.name}>
                <span>{item.name}</span>
                <div className="risk-track">
                  <b className={item.color} style={{ width: `${item.value * 25}%` }} />
                </div>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="household-chart-card">
          <div className="household-chart-title">
            <div>
              <h3>Toilet Type Distribution</h3>
              <p>12 households</p>
            </div>
          </div>

          <div className="household-bar-chart">
            <MockBar label="Water-Sealed" value={3} color="green" />
            <MockBar label="Pour-Flush" value={3} color="dark" />
            <MockBar label="Pit Latrine" value={3} color="yellow" />
            <MockBar label="None" value={3} color="red" />
          </div>
        </section>

        <section className="household-chart-card">
          <div className="household-chart-title">
            <div>
              <h3>Waste Disposal Methods</h3>
              <p>12 households</p>
            </div>
          </div>

          <div className="household-bar-chart">
            <MockBar label="Collected" value={3} color="green" />
            <MockBar label="Composted" value={3} color="dark" />
            <MockBar label="Burned" value={3} color="yellow" />
            <MockBar label="Dumped" value={3} color="red" />
          </div>
        </section>

        <section className="household-chart-card">
          <h3>Water Access Levels</h3>

          <div className="water-donut-wrap">
            <div className="water-donut" />
            <span className="water-label top">4</span>
            <span className="water-label left">4</span>
            <span className="water-label bottom">4</span>
          </div>

          <div className="household-legend">
            <span className="yellow">■ Level I</span>
            <span className="green">■ Level II</span>
            <span className="dark">■ Level III</span>
          </div>
        </section>
      </div>

      <section className="household-table-card">
        <div className="household-table-tools">
          <select>
            <option>All Barangays</option>
            <option>Poblacion</option>
            <option>San Isidro</option>
            <option>Malabanan</option>
            <option>San Roque</option>
            <option>Bagong Pook</option>
          </select>

          <div className="household-right-tools">
            <div className="household-search">
              <FiSearch />
              <input placeholder="Search households..." />
            </div>

            <select>
              <option>All</option>
              <option>Good Standing</option>
              <option>Violation</option>
              <option>For Completion</option>
            </select>
          </div>
        </div>

        <div className="household-table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Household Head</th>
                <th>Members</th>
                <th>Toilet Type</th>
                <th>Water Source</th>
                <th>Waste Disposal</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {households.map((row) => (
                <tr key={row[0]}>
                  <td>{row[0]}</td>
                  <td><strong>{row[1]}</strong></td>
                  <td>{row[2]}</td>
                  <td>{row[3]}</td>
                  <td>{row[4]}</td>
                  <td>{row[5]}</td>
                  <td>
                    <span className={`household-status ${statusClass(row[6])}`}>
                      ● {row[6]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="household-pagination">
          <span></span>
          <div>
            <button type="button"><FiChevronLeft /></button>
            <button type="button"><FiChevronRight /></button>
          </div>
        </div>
      </section>
    </div>
  );
}

function HouseholdStat({ title, value, desc, icon, color }) {
  return (
    <div className="household-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
        {desc && <span>{desc}</span>}
      </div>

      <div className={`household-stat-icon ${color}`}>{icon}</div>
    </div>
  );
}

function MockBar({ label, value, color }) {
  return (
    <div className="household-bar-item">
      <div className="household-bar-area">
        <span className={color} style={{ height: `${value * 50}px` }} />
      </div>
      <small>{label}</small>
    </div>
  );
}

function statusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-");
}

export default HouseholdRecords;