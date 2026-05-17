export function exportCsv(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}


export function datedCsvFilename(prefix) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}


function escapeCsvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
