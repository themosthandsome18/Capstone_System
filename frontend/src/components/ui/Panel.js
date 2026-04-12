function Panel({ title, description, action, children, className = "" }) {
  return (
    <section className={`panel p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? <h3 className="text-sm font-semibold text-slate-900">{title}</h3> : null}
            {description ? (
              <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
            ) : null}
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export default Panel;
