const badgeStyles = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-sky-50 text-sky-700",
};

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge ${badgeStyles[tone] || badgeStyles.neutral}`}>{children}</span>;
}

export default Badge;
