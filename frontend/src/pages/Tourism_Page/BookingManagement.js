import { useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiFilter,
  FiSearch,
} from "react-icons/fi";
import { useTourismData } from "../../context/TourismDataContext";

const pageSize = 10;

function BookingManagement() {
  const { touristRecords, referenceTables } = useTourismData();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  function resolveLabel(collection, id, key = "id", valueKey = "name") {
    return collection.find((item) => item[key] === id)?.[valueKey] || "--";
  }

  const filteredRows = touristRecords.filter((record) => {
    const searchText = [
      record.survey_id,
      record.full_name,
      record.contact_number,
      resolveLabel(referenceTables.countries, record.country_id),
      resolveLabel(referenceTables.resorts, record.resort_id, "resort_id", "resort_name"),
    ]
      .join(" ")
      .toLowerCase();

    return searchText.includes(search.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="booking-page">
      <div className="booking-header">
        <div>
          <h1>Booking Management</h1>
          <p>Replace manual Google Forms with automated booking tracking</p>
        </div>

        <div className="booking-actions">
          <button type="button" className="outline-action">Export</button>
          <button type="button" className="primary-action">+ Generate Report</button>
        </div>
      </div>

      <div className="booking-status-grid">
        <div className="booking-status-card verified">
          <p>Verified Entries</p>
          <h2>2</h2>
        </div>

        <div className="booking-status-card arrived">
          <p>Arrived</p>
          <h2>4</h2>
        </div>

        <div className="booking-status-card noshow">
          <p>No-show</p>
          <h2>1</h2>
        </div>
      </div>

      <div className="booking-toolbar">
        <div className="booking-search">
          <FiSearch />
          <input
            type="search"
            placeholder="Search by name, contact, or booking ID..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <button type="button" className="btn-secondary">
          <FiFilter />
          Filter
        </button>
      </div>

      <div className="booking-table-card">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {[
                  "Guest",
                  "Contact",
                  "Country",
                  "Pax",
                  "Arrival",
                  "Nights",
                  "Resort",
                  "Status",
                  "Actions",
                ].map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {paginatedRows.map((row, index) => {
                const status =
                  index === 0 || index === 6 || index === 7
                    ? "Pending"
                    : index === 3
                    ? "No-show"
                    : "Arrived";

                return (
                  <tr key={row.survey_id}>
                    <td>
                      <p className="booking-guest-name">{row.full_name}</p>
                      <p className="booking-id">{row.survey_id}</p>
                    </td>

                    <td>{row.contact_number}</td>

                    <td>
                      <strong>
                        {resolveLabel(referenceTables.countries, row.country_id)}
                      </strong>
                    </td>

                    <td>{row.total_visitors}</td>
                    <td>Apr 18, 2026</td>
                    <td>
                      {index % 4 === 0 ? 2 : index % 4 === 1 ? 1 : index % 4 === 2 ? 3 : 4}
                    </td>

                    <td>
                      {resolveLabel(
                        referenceTables.resorts,
                        row.resort_id,
                        "resort_id",
                        "resort_name"
                      )}
                    </td>

                    <td>
                      <span
                        className={`booking-badge ${
                          status === "Arrived"
                            ? "arrived"
                            : status === "Pending"
                            ? "pending"
                            : "noshow"
                        }`}
                      >
                        {status}
                      </span>
                    </td>

                    <td>
                      <div className="booking-row-actions">
                        <button type="button" className="booking-arrived-btn">
                          ✓ Arrived
                        </button>
                        <button type="button" className="booking-noshow-btn">
                          × No-show
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="booking-pagination">
  <p>
    Showing <strong>{paginatedRows.length}</strong> of{" "}
    <strong>{filteredRows.length}</strong> total records
  </p>

  <div className="pagination-actions">
    <button
      type="button"
      className={`booking-page-btn prev ${page === 1 ? "disabled" : ""}`}
      disabled={page === 1}
      onClick={() => setPage((value) => Math.max(1, value - 1))}
    >
      <FiChevronLeft />
    </button>

    <button
      type="button"
      className={`booking-page-btn next ${page === totalPages ? "disabled" : ""}`}
      disabled={page === totalPages}
      onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
    >
      <FiChevronRight />
    </button>
  </div>
</div>
    </div>
  );
}

export default BookingManagement;