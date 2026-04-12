function PageHeader({ eyebrow, title, description, actions, compact = false }) {
  return (
    <div className={`mb-5 px-1 py-2 ${compact ? "" : ""}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2a8d95]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="page-title mt-2">{title}</h1>
          {description ? <p className="page-subtitle mt-2 max-w-2xl">{description}</p> : null}
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}

export default PageHeader;
