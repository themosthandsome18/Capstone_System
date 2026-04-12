function Modal({ isOpen, onClose, title, description, children }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10">
      <div className="w-full max-w-[720px] rounded-[10px] border border-[#d1e4e8] bg-[#e9f5f7] p-4 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Modal;
