import { FiEdit2, FiEye, FiMapPin, FiPlus, FiStar, FiTrash2 } from "react-icons/fi";
import PageHeader from "../components/ui/PageHeader";
import { useTourismData } from "../context/TourismDataContext";

function DestinationManagement() {
  const { referenceTables } = useTourismData();
  const averageRating = (
    referenceTables.resorts.reduce((sum, item) => sum + item.tourism_rating, 0) /
    Math.max(referenceTables.resorts.length, 1)
  ).toFixed(1);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tourism Monitoring"
        title="Destination Management"
        description="Manage tourism destination and resorts in Mauban."
        actions={
          <button type="button" className="btn-primary">
            <FiPlus size={15} />
            Add Destination
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {referenceTables.resorts.map((destination) => (
          <div
            key={destination.resort_id}
            className="panel overflow-hidden p-0"
          >
            <div className="relative">
              <img
                src={destination.image}
                alt={destination.resort_name}
                className="h-40 w-full object-cover"
              />
              <div className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-700">
                {destination.with_mayors_permit ? "PERMIT READY" : "FOR REVIEW"}
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{destination.resort_name}</h3>
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                  {destination.short_description}
                </p>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5">
                  <FiMapPin size={12} className="text-sky-500" />
                  <span className="truncate">{destination.location}</span>
                </div>
                <div className="flex items-center gap-1 text-amber-500">
                  <FiStar size={12} />
                  <span className="font-semibold text-slate-700">{destination.tourism_rating}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button type="button" className="rounded-md bg-[#1d7d46] px-2 py-1.5 text-[11px] font-medium text-white">
                  <FiEye className="mr-1 inline" size={11} />
                  View
                </button>
                <button type="button" className="rounded-md bg-[#5b8df0] px-2 py-1.5 text-[11px] font-medium text-white">
                  <FiEdit2 className="mr-1 inline" size={11} />
                  Edit
                </button>
                <button type="button" className="rounded-md bg-[#e67272] px-2 py-1.5 text-[11px] font-medium text-white">
                  <FiTrash2 className="mr-1 inline" size={11} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel flex flex-col gap-3 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          TOTAL DESTINATION: <span className="font-semibold text-slate-800">{referenceTables.resorts.length}</span>
        </p>
        <p>
          Average Rating: <span className="font-semibold text-slate-800">{averageRating}</span>
        </p>
      </div>
    </div>
  );
}

export default DestinationManagement;
