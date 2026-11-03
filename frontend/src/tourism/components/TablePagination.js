import { useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

// The paging of a table whose rows are all in the browser already: "Showing 1-10 of 25 filtered records" on the left, how many rows a page
// holds and the two buttons on the right, with the look of Record Management (the .booking-pagination rules; that page pages on the
// server, so its markup is not reusable and is left alone). It only cuts the rows it is given: any total shown beside the table comes from
// the server or from all the rows, never from the page.
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

// The page the table shows. `resetKey` names the filters in force: when it changes the table goes back to the first page, as it does when
// the number of rows per page changes. A page past the last (the rows got fewer) is the last.
export function usePagination(rows, resetKey) {
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [seenKey, setSeenKey] = useState(resetKey);

  let wanted = page;
  if (seenKey !== resetKey) {
    // set while rendering, so the page that is drawn is already the first one
    setSeenKey(resetKey);
    setPage(1);
    wanted = 1;
  }

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, wanted), totalPages);
  const from = total ? (current - 1) * pageSize : 0;
  const to = Math.min(total, from + pageSize);

  return {
    visibleRows: rows.slice(from, to),
    page: current,
    pageSize,
    total,
    totalPages,
    showingStart: total ? from + 1 : 0,
    showingEnd: to,
    setPage,
    setPageSize: (size) => {
      setPageSize(size);
      setPage(1);
    },
  };
}

function TablePagination({ pagination, idPrefix, noun = "filtered records" }) {
  const { page, pageSize, total, totalPages, showingStart, showingEnd, setPage, setPageSize } = pagination;
  const selectId = `${idPrefix}-page-size`;

  return (
    <div className="booking-pagination">
      <p>
        Showing{" "}
        <strong>
          {showingStart}-{showingEnd}
        </strong>{" "}
        of <strong>{total}</strong> {noun}
      </p>

      <div className="pagination-actions table-pagination-actions">
        <div className="table-pagination-size">
          <label htmlFor={selectId}>Rows per page</label>
          <select id={selectId} value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        {totalPages > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous page"
              className={`booking-page-btn prev ${page === 1 ? "disabled" : ""}`}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <FiChevronLeft />
            </button>

            <button
              type="button"
              aria-label="Next page"
              className={`booking-page-btn next ${page === totalPages ? "disabled" : ""}`}
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              <FiChevronRight />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default TablePagination;
