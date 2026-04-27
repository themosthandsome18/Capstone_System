import Badge from "./Badge";

function DataTable({ columns, rows, emptyMessage = "No records found." }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#c4d8dd] bg-[#edf7f8]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[#c8dde3] bg-transparent">
          <thead className="bg-[#aecdd3]">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-700"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d7e7ea]">
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr
                  key={row.id || row.survey_id || rowIndex}
                  className="bg-[#edf7f8] transition hover:bg-[#e5f2f4]"
                >
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-4 align-top text-sm text-slate-700">
                      {column.render
                        ? column.render(row[column.key], row, rowIndex)
                        : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-sm text-slate-500"
                >
                  <div className="mx-auto max-w-sm">
                    <Badge tone="neutral">Empty Result</Badge>
                    <p className="mt-3">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataTable;
