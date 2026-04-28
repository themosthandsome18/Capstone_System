export function formatNumber(value) {
  return new Intl.NumberFormat("en-PH").format(Number(value || 0));
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}
