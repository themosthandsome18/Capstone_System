import { escapeSlipText } from "./escapeSlipText";

/**
 * The Owner's Slip: the establishment's private tracking code for the
 * Establishment Portal, printed once. The code only passes through here on
 * its way into the print window; nothing keeps it.
 */

const MANILA_DATE = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const MANILA_DATE_TIME = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatManilaDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? MANILA_DATE.format(date) : "";
}

function formatManilaDateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? MANILA_DATE_TIME.format(date) : "";
}

/** The slip status shown on the establishment record. */
export function ownerSlipStatusText(establishment) {
  if (!establishment?.tracking_code_issued_at) {
    return "No Owner's Slip yet";
  }
  const date = formatManilaDate(establishment.tracking_code_issued_at);
  const staff = establishment.tracking_code_issued_by_name;
  return staff
    ? `Owner's Slip issued on ${date} by ${staff}`
    : `Owner's Slip issued on ${date}`;
}

/** Asked before a new code replaces one that is already on a printed slip. */
export function ownerSlipReplaceMessage(establishment) {
  const date = formatManilaDate(establishment.tracking_code_issued_at);
  const staff = establishment.tracking_code_issued_by_name || "staff";
  return (
    `A new code will be issued. The old slip issued on ${date} by ${staff} ` +
    "will stop working."
  );
}

const SLIP_STYLES = `
  @page { size: A6; margin: 7mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; font-size: 10pt; line-height: 1.35; }
  .slip { max-width: 91mm; margin: 0 auto; border: 1.5pt solid #000; padding: 4mm; }
  .office { text-align: center; font-size: 8.5pt; font-weight: 700; }
  h1 { text-align: center; font-size: 15pt; letter-spacing: 2pt; margin: 1.5mm 0 3mm; border-bottom: 1pt solid #000; padding-bottom: 2mm; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 400; font-size: 8pt; width: 30%; vertical-align: top; padding: 0.6mm 0; }
  td { font-weight: 700; padding: 0.6mm 0; overflow-wrap: anywhere; }
  .code-box { margin: 3mm 0; border: 1.5pt dashed #000; padding: 2.5mm; text-align: center; }
  .code-label { font-size: 8pt; letter-spacing: 1pt; }
  .code { font-family: "Courier New", Courier, monospace; font-size: 22pt; font-weight: 700; letter-spacing: 1.5pt; white-space: nowrap; }
  .issued { font-size: 8.5pt; }
  .steps { margin: 2.5mm 0; font-size: 9pt; }
  .steps p { margin: 0 0 1mm; }
  .private { border: 1.5pt solid #000; padding: 2mm; font-size: 8.5pt; font-weight: 700; }
  .lost { margin: 2mm 0 0; font-size: 8.5pt; text-align: center; }
  .print-btn { display: block; margin: 4mm auto 0; padding: 2mm 5mm; font-size: 10pt; }
  @media print { .print-btn { display: none; } }
`;

/** Shown in the print window while the code is being issued. */
export function ownerSlipGeneratingHtml() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Owner's Slip</title></head>
<body style="font-family: Arial, sans-serif; padding: 24px;">
  <p>Generating the Owner's Slip…</p>
</body>
</html>`;
}

/** The printable slip for one issued code (the generate endpoint's answer). */
export function buildOwnerSlipHtml(slip) {
  const establishment = slip.establishment || {};
  const permitNumber = (establishment.permit_number || "").trim();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Owner's Slip – ${escapeSlipText(establishment.business_name)}</title>
  <style>${SLIP_STYLES}</style>
</head>
<body>
  <main class="slip">
    <div class="office">Mauban Municipal Health Office – Sanitary Section</div>
    <h1>OWNER'S SLIP</h1>
    <table>
      <tr><th>Establishment</th><td>${escapeSlipText(establishment.business_name)}</td></tr>
      <tr><th>Permit No.</th><td>${
        permitNumber ? escapeSlipText(permitNumber) : "No permit number yet"
      }</td></tr>
      <tr><th>Business type</th><td>${escapeSlipText(establishment.business_type_name)}</td></tr>
      <tr><th>Barangay</th><td>${escapeSlipText(establishment.barangay)}</td></tr>
    </table>
    <div class="code-box">
      <div class="code-label">TRACKING CODE</div>
      <div class="code">${escapeSlipText(slip.tracking_code)}</div>
    </div>
    <p class="issued">Date issued: <strong>${escapeSlipText(
      formatManilaDateTime(slip.issued_at)
    )}</strong><br>Issued by: <strong>${escapeSlipText(slip.issued_by)}</strong></p>
    <div class="steps">
      <p>Open the Mauban Sanitary app → Establishment Portal → enter the code.</p>
    </div>
    <div class="private">This code is PRIVATE. Do not post it. It is different from the permit number.</div>
    <p class="lost">Lost this slip? Visit the Sanitary Office for a new code.</p>
  </main>
  <button type="button" class="print-btn" onclick="window.print()">Print</button>
</body>
</html>`;
}
