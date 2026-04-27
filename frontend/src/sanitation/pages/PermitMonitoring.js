import { FiAlertTriangle, FiClock, FiFileText, FiSearch } from "react-icons/fi";

const permitRows = [
  ["AquaPure Refilling", "Maria Santos", "Water Refilling Station • SP", "2026-04-24", "Active", "Good Standing"],
  ["Golden Egg Poultry", "Jose Ramirez", "Poultry Farm • Large", "2026-04-20", "Suspended", "Violation"],
  ["Petron Highway", "PMC Corp.", "Gasoline Station • Large", "2026-02-05", "Active", "Good Standing"],
  ["Lola Nena’s Eatery", "Helena Cruz", "Restaurant / Food Service • SP", "2026-02-18", "Active (Renewal Due)", "Upcoming"],
  ["Sunrise Bistro", "Carlos Tan", "Restaurant / Food Service • Large", "2026-03-02", "Conditional", "For Completion"],
  ["Style Cuts Salon", "Anne Reyes", "Barbershop / Salon • SP", "2026-02-15", "Active", "Good Standing"],
  ["Crystal Springs Water", "B. Aquino", "Water Refilling Station • Large", "2026-03-22", "Active", "Good Standing"],
  ["Shell Junction", "Shell Phils.", "Gasoline Station • Large", "2026-01-30", "Active (Renewal Due)", "Upcoming"],
  ["Happy Hen Farm", "R. Delgado", "Poultry Farm • SP", "2026-02-10", "Conditional", "For Completion"],
  ["Market Stall #14", "L. Mendoza", "Public Market Stall • SP", "2026-02-28", "Suspended", "Violation"],
  ["Manong Pedro’s Carinderia", "P. Villanueva", "Restaurant / Food Service • SP", "2026-03-25", "Active", "Good Standing"],
  ["FreshCut Barber", "M. Bautista", "Barbershop / Salon • SP", "2026-02-22", "Active", "Good Standing"],
];

function PermitMonitoring() {
  return (
    <div className="permit-page">
      <div className="permit-header">
        <h1>Sanitary Permit Monitoring</h1>
        <p>Track and manage sanitary permits for all registered establishments</p>
      </div>

      <div className="permit-stat-grid">
        <PermitStat title="Active Permits" value="6" icon={<FiFileText />} color="green" />
        <PermitStat title="Renewal Due" value="2" icon={<FiClock />} color="yellow" />
        <PermitStat title="Conditional" value="2" icon={<FiFileText />} color="orange" />
        <PermitStat title="Suspended" value="2" icon={<FiFileText />} color="red" />
      </div>

      <div className="permit-alert-grid">
        <PermitAlert title="Golden Egg Poultry" desc="Poultry Farm • Large" />
        <PermitAlert title="Market Stall #14" desc="Public Market Stall • SP" />
      </div>

      <section className="permit-table-card">
        <div className="permit-table-top">
          <div>
            <h2>Permit Status — Auto-generated from Inspection Results</h2>
            <p>Violations are integrated; no separate violations module needed.</p>
          </div>

          <div className="permit-tools">
            <div className="permit-search">
              <FiSearch />
              <input type="text" placeholder="Search by name or owner..." />
            </div>

            <select>
              <option>All</option>
              <option>Active</option>
              <option>Suspended</option>
              <option>Conditional</option>
            </select>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>Type / Size</th>
              <th>Last Inspection</th>
              <th>Permit Status</th>
              <th>Compliance</th>
            </tr>
          </thead>

          <tbody>
            {permitRows.map((row) => (
              <tr key={row[0]}>
                <td>
                  <strong>{row[0]}</strong>
                  <small>{row[1]}</small>
                </td>
                <td>{row[2]}</td>
                <td>{row[3]}</td>
                <td>
                  <span className={`permit-status ${permitClass(row[4])}`}>
                    {row[4]}
                  </span>
                </td>
                <td>
                  <span className={`permit-compliance ${complianceClass(row[5])}`}>
                    ● {row[5]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PermitStat({ title, value, icon, color }) {
  return (
    <div className="permit-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>
      <div className={`permit-stat-icon ${color}`}>{icon}</div>
    </div>
  );
}

function PermitAlert({ title, desc }) {
  return (
    <div className="permit-alert-card">
      <FiAlertTriangle />
      <div>
        <h3>{title}</h3>
        <p>{desc}</p>
        <strong>Requires immediate renewal</strong>
      </div>
    </div>
  );
}

function permitClass(status) {
  return status.toLowerCase().replaceAll(" ", "-").replace(/[()]/g, "");
}

function complianceClass(status) {
  return status.toLowerCase().replaceAll(" ", "-");
}

export default PermitMonitoring;