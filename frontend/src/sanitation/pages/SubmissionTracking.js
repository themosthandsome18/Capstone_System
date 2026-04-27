import { useMemo, useState } from "react";
import { FiDownload, FiFileText, FiPrinter, FiSearch } from "react-icons/fi";

const submissions = [
  ["E-001", "AquaPure Refilling", "Water Refilling Station", "2026-03-12", "Good Standing"],
  ["E-002", "Golden Egg Poultry", "Poultry Farm", "2026-01-20", "Violation"],
  ["E-003", "Petron Highway", "Gasoline Station", "2026-02-05", "Good Standing"],
  ["E-004", "Lola Nena’s Eatery", "Restaurant / Food Service", "2026-03-18", "Upcoming"],
  ["E-005", "Sunrise Bistro", "Restaurant / Food Service", "2026-03-02", "For Completion"],
  ["E-006", "Style Cuts Salon", "Barbershop / Salon", "2026-02-15", "Good Standing"],
  ["E-007", "Crystal Springs Water", "Water Refilling Station", "2026-03-22", "Good Standing"],
  ["E-008", "Shell Junction", "Gasoline Station", "2026-01-30", "Upcoming"],
  ["E-009", "Happy Hen Farm", "Poultry Farm", "2026-02-10", "For Completion"],
  ["E-010", "Market Stall #14", "Public Market Stall", "2026-02-28", "Violation"],
  ["E-011", "Manong Pedro’s Carinderia", "Restaurant / Food Service", "2026-03-25", "Good Standing"],
  ["E-012", "FreshCut Barber", "Barbershop / Salon", "2026-02-22", "Good Standing"],
];

const filters = [
  { key: "All Submissions", value: "All", count: 12, color: "blue" },
  { key: "Good Standing", value: "Good Standing", count: 6, color: "green" },
  { key: "For Completion", value: "For Completion", count: 2, color: "orange" },
  { key: "Upcoming", value: "Upcoming", count: 2, color: "yellow" },
  { key: "Violators", value: "Violation", count: 2, color: "red" },
];

function SubmissionTracking() {
  const [activeFilter, setActiveFilter] = useState("All");

  const filteredRows = useMemo(() => {
    if (activeFilter === "All") return submissions;
    return submissions.filter((item) => item[4] === activeFilter);
  }, [activeFilter]);

  return (
    <div className="submission-page">
      <div className="submission-header">
        <div>
          <h1>Sanitary Submission Tracking</h1>
          <p>Track documents requirement submissions per establishment</p>
        </div>

        <div className="submission-actions">
          <button type="button" className="submission-print-btn">
            <FiPrinter />
            Print
          </button>

          <button type="button" className="submission-report-btn">
            <FiDownload />
            Generate Report
          </button>
        </div>
      </div>

      <div className="submission-stat-grid">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`submission-stat-card ${filter.color} ${
              activeFilter === filter.value ? "active" : ""
            }`}
            onClick={() => setActiveFilter(filter.value)}
          >
            <div>
              <p>{filter.key}</p>
              <h2>{filter.count}</h2>
            </div>

            <FiFileText />
          </button>
        ))}
      </div>

      <section className="submission-table-card">
        <div className="submission-table-top">
          <h2>
            All Establishments <span>• {filteredRows.length} record(s)</span>
          </h2>

          <div className="submission-tools">
            <div className="submission-search">
              <FiSearch />
              <input type="text" placeholder="Search by name or owner..." />
            </div>

            <select>
              <option>All</option>
              <option>Good Standing</option>
              <option>For Completion</option>
              <option>Upcoming</option>
              <option>Violation</option>
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
            {filteredRows.map((row) => (
              <tr key={row[0]}>
                <td>{row[0]}</td>
                <td>
                  <strong>{row[1]}</strong>
                </td>
                <td>{row[2]}</td>
                <td>{row[3]}</td>
                <td>
                  <span className={`submission-status ${statusClass(row[4])}`}>
                    ● {row[4]}
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

function statusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-");
}

export default SubmissionTracking;