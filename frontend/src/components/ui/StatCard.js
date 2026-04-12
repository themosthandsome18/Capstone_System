function StatCard({ label, value, helper, icon, trend, tone = "teal" }) {
  const toneStyles = {
    teal: "bg-brand-50 text-brand-700 ring-brand-100",
    blue: "bg-slateblue-50 text-slateblue-700 ring-slateblue-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
  };

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium text-slate-500">{label}</p>
          <h3 className="mt-3 text-[2rem] font-bold tracking-tight text-slate-900">{value}</h3>
          {helper ? <p className="mt-2 text-xs text-slate-500">{helper}</p> : null}
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-2xl ring-1 ${
            toneStyles[tone] || toneStyles.teal
          }`}
        >
          {icon}
        </div>
      </div>
      {trend ? (
        <div className="mt-4 inline-flex rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
          {trend}
        </div>
      ) : null}
    </div>
  );
}

export default StatCard;
