import { useMemo, useState } from "react";
import { FiAlertTriangle, FiClock, FiFileText, FiSearch } from "react-icons/fi";

const permitRows = [
  {
    business: "AquaPure Refilling",
    owner: "Maria Santos",
    type: "Water Refilling Station • SP",
    lastInspection: "2026-04-24",
    permitStatus: "Active",
    compliance: "Good Standing",
  },
  {
    business: "Golden Egg Poultry",
    owner: "Jose Ramirez",
    type: "Poultry Farm • Large",
    lastInspection: "2026-04-20",
    permitStatus: "Suspended",
    compliance: "Violation",
  },
  {
    business: "Petron Highway",
    owner: "PMC Corp.",
    type: "Gasoline Station • Large",
    lastInspection: "2026-02-05",
    permitStatus: "Active",
    compliance: "Good Standing",
  },
  {
    business: "Lola Nena’s Eatery",
    owner: "Helena Cruz",
    type: "Restaurant / Food Service • SP",
    lastInspection: "2026-02-18",
    permitStatus: "Active (Renewal Due)",
    compliance: "Upcoming",
  },
  {
    business: "Sunrise Bistro",
    owner: "Carlos Tan",
    type: "Restaurant / Food Service • Large",
    lastInspection: "2026-03-02",
    permitStatus: "Conditional",
    compliance: "For Completion",
  },
  {
    business: "Style Cuts Salon",
    owner: "Anne Reyes",
    type: "Barbershop / Salon • SP",
    lastInspection: "2026-02-15",
    permitStatus: "Active",
    compliance: "Good Standing",
  },
  {
    business: "Crystal Springs Water",
    owner: "B. Aquino",
    type: "Water Refilling Station • Large",
    lastInspection: "2026-03-22",
    permitStatus: "Active",
    compliance: "Good Standing",
  },
  {
    business: "Shell Junction",
    owner: "Shell Phils.",
    type: "Gasoline Station • Large",
    lastInspection: "2026-01-30",
    permitStatus: "Active (Renewal Due)",
    compliance: "Upcoming",
  },
  {
    business: "Happy Hen Farm",
    owner: "R. Delgado",
    type: "Poultry Farm • SP",
    lastInspection: "2026-02-10",
    permitStatus: "Conditional",
    compliance: "For Completion",
  },
  {
    business: "Market Stall #14",
    owner: "L. Mendoza",
    type: "Public Market Stall • SP",
    lastInspection: "2026-02-28",
    permitStatus: "Suspended",
    compliance: "Violation",
  },
  {
    business: "Manong Pedro’s Carinderia",
    owner: "P. Villanueva",
    type: "Restaurant / Food Service • SP",
    lastInspection: "2026-03-25",
    permitStatus: "Active",
    compliance: "Good Standing",
  },
  {
    business: "FreshCut Barber",
    owner: "M. Bautista",
    type: "Barbershop / Salon • SP",
    lastInspection: "2026-02-22",
    permitStatus: "Active",
    compliance: "Good Standing",
  },
];

function PermitMonitoring() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.toLowerCase().trim();

    return permitRows.filter((row) => {
      const matchesSearch =
        row.business.toLowerCase().includes(keyword) ||
        row.owner.toLowerCase().includes(keyword) ||
        row.type.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "All" || row.permitStatus.includes(statusFilter);

      return matchesSearch && matchesStatus;
    });
  }, [searchTerm, statusFilter]);

  return (
    <div className="permit-page">
      <div className="permit-header">
        <h1>Sanitary Permit Monitoring</h1>
        <p>Track and manage sanitary permits for all registered establishments</p>
      </div>

      <div className="permit-stat-grid">
        <PermitStat
          title="Active Permits"
          value="6"
          icon={<FiFileText />}
          color="green"
        />
        <PermitStat
          title="Renewal Due"
          value="2"
          icon={<FiClock />}
          color="yellow"
        />
        <PermitStat
          title="Conditional"
          value="2"
          icon={<FiFileText />}
          color="orange"
        />
        <PermitStat
          title="Suspended"
          value="2"
          icon={<FiFileText />}
          color="red"
        />
      </div>

      <div className="permit-alert-grid">
        <PermitAlert
          title="Golden Egg Poultry"
          desc="Poultry Farm • Large"
        />
        <PermitAlert
          title="Market Stall #14"
          desc="Public Market Stall • SP"
        />
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
              <input
                type="text"
                placeholder="Search by name or owner..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>All</option>
              <option>Active</option>
              <option>Suspended</option>
              <option>Conditional</option>
            </select>
          </div>
        </div>

        <div className="permit-table-wrap">
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
              {filteredRows.map((row) => (
                <tr key={row.business}>
                  <td>
                    <strong>{row.business}</strong>
                    <small>{row.owner}</small>
                  </td>

                  <td>{row.type}</td>

                  <td>{row.lastInspection}</td>

                  <td>
                    <span className={`permit-status ${permitClass(row.permitStatus)}`}>
                      {row.permitStatus}
                    </span>
                  </td>

                  <td>
                    <span className={`permit-compliance ${complianceClass(row.compliance)}`}>
                      ● {row.compliance}
                    </span>
                  </td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan="5" className="permit-empty">
                    No permit records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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