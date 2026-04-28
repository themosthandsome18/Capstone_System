import { useMemo, useState } from "react";
import { FiDownload, FiFileText, FiPrinter, FiSearch } from "react-icons/fi";

const submissions = [
  { id: "E-001", name: "AquaPure Refilling", type: "Water Refilling Station", date: "2026-03-12", status: "Good Standing" },
  { id: "E-002", name: "Golden Egg Poultry", type: "Poultry Farm", date: "2026-01-20", status: "Violation" },
  { id: "E-003", name: "Petron Highway", type: "Gasoline Station", date: "2026-02-05", status: "Good Standing" },
  { id: "E-004", name: "Lola Nena’s Eatery", type: "Restaurant / Food Service", date: "2026-03-18", status: "Upcoming" },
  { id: "E-005", name: "Sunrise Bistro", type: "Restaurant / Food Service", date: "2026-03-02", status: "For Completion" },
  { id: "E-006", name: "Style Cuts Salon", type: "Barbershop / Salon", date: "2026-02-15", status: "Good Standing" },
  { id: "E-007", name: "Crystal Springs Water", type: "Water Refilling Station", date: "2026-03-22", status: "Good Standing" },
  { id: "E-008", name: "Shell Junction", type: "Gasoline Station", date: "2026-01-30", status: "Upcoming" },
  { id: "E-009", name: "Happy Hen Farm", type: "Poultry Farm", date: "2026-02-10", status: "For Completion" },
  { id: "E-010", name: "Market Stall #14", type: "Public Market Stall", date: "2026-02-28", status: "Violation" },
  { id: "E-011", name: "Manong Pedro’s Carinderia", type: "Restaurant / Food Service", date: "2026-03-25", status: "Good Standing" },
  { id: "E-012", name: "FreshCut Barber", type: "Barbershop / Salon", date: "2026-02-22", status: "Good Standing" },
];

const kpiData = [
  { label: "All Submissions", filterValue: "All", value: 12, color: "blue" },
  { label: "Good Standing", filterValue: "Good Standing", value: 6, color: "green" },
  { label: "For Completion", filterValue: "For Completion", value: 2, color: "orange" },
  { label: "Upcoming", filterValue: "Upcoming", value: 2, color: "yellow" },
  { label: "Violators", filterValue: "Violation", value: 2, color: "red" },
];

function SubmissionTracking() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [activeCard, setActiveCard] = useState("All Submissions");

  const filtered = useMemo(() => {
    return submissions.filter((item) => {
      const keyword = search.toLowerCase().trim();

      const matchSearch =
        item.name.toLowerCase().includes(keyword) ||
        item.type.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword);

      const matchFilter = filter === "All" || item.status === filter;

      return matchSearch && matchFilter;
    });
  }, [search, filter]);

  return (
    <div className="submission-page">
      <div className="submission-header">
        <div>
          <h1>Sanitary Submission Tracking</h1>
          <p>Track documents requirement submissions per establishment</p>
        </div>

        <div className="submission-actions">
          <button type="button" className="btn-light">
            <FiPrinter />
            Print
          </button>

          <button type="button" className="btn-primary">
            <FiDownload />
            Generate Report
          </button>
        </div>
      </div>

      <div className="submission-kpi-grid">
        {kpiData.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            className={`kpi-card ${kpi.color} ${
              activeCard === kpi.label ? "active" : ""
            }`}
            onClick={() => {
              setActiveCard(kpi.label);
              setFilter(kpi.filterValue);
            }}
          >
            <div>
              <p>{kpi.label}</p>
              <h2>{kpi.value}</h2>
            </div>

            <FiFileText />
          </button>
        ))}
      </div>

      <section className="submission-table-card">
        <div className="table-top">
          <h3>
            All Establishments <span>• {filtered.length} record(s)</span>
          </h3>

          <div className="table-tools">
            <div className="search-box">
              <FiSearch />
              <input
                type="text"
                placeholder="Search by name or owner..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select
              value={filter}
              onChange={(event) => {
                const value = event.target.value;
                setFilter(value);

                const selectedCard = kpiData.find(
                  (item) => item.filterValue === value
                );

                setActiveCard(selectedCard ? selectedCard.label : "All Submissions");
              }}
            >
              <option value="All">All</option>
              <option value="Good Standing">Good Standing</option>
              <option value="For Completion">For Completion</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Violation">Violation</option>
            </select>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Business Name</th>
              <th>Type</th>
              <th>Date Submitted</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>{row.type}</td>
                <td>{row.date}</td>
                <td>
                  <span className={`status ${statusClass(row.status)}`}>
                    ● {row.status}
                  </span>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan="5" className="submission-empty">
                  No submission records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function statusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-");
}

export default SubmissionTracking;