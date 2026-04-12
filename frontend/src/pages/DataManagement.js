import { useState } from "react";
import {
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiEdit2,
  FiFilter,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import { useTourismData } from "../context/TourismDataContext";

const pageSize = 10;

const defaultForm = {
  survey_id: "",
  email: "",
  full_name: "",
  contact_number: "",
  country_id: 1,
  region_id: 1,
  province_id: 1,
  foreigner_count: 0,
  filipino_count: 1,
  maubanin_count: 0,
  total_visitors: 1,
  total_male: 1,
  total_female: 0,
  special_group_count: 0,
  age_0_7: 0,
  age_8_59: 1,
  age_60_above: 0,
  arrival_date: "2026-03-15",
  itinerary_id: 1,
  resort_id: 1,
  travel_mode_id: 1,
  boat_type_id: 1,
  visit_purpose_id: 1,
};

function DataManagement() {
  const { touristRecords, referenceTables, createRecord, updateRecord, deleteRecord } =
    useTourismData();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);

  function resolveLabel(collection, id, key = "id", valueKey = "name") {
    return collection.find((item) => item[key] === id)?.[valueKey] || "--";
  }

  function openAddModal() {
    setEditingId(null);
    setForm({
      ...defaultForm,
      survey_id: `SURV-2026-${String(touristRecords.length + 1).padStart(3, "0")}`,
    });
    setModalOpen(true);
  }

  function openEditModal(record) {
    setEditingId(record.survey_id);
    setForm(record);
    setModalOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      ...form,
      country_id: Number(form.country_id),
      region_id: Number(form.region_id),
      province_id: Number(form.province_id),
      foreigner_count: Number(form.foreigner_count),
      filipino_count: Number(form.filipino_count),
      maubanin_count: Number(form.maubanin_count),
      total_visitors: Number(form.total_visitors),
      total_male: Number(form.total_male),
      total_female: Number(form.total_female),
      special_group_count: Number(form.special_group_count),
      age_0_7: Number(form.age_0_7),
      age_8_59: Number(form.age_8_59),
      age_60_above: Number(form.age_60_above),
      itinerary_id: Number(form.itinerary_id),
      resort_id: Number(form.resort_id),
      travel_mode_id: Number(form.travel_mode_id),
      boat_type_id: Number(form.boat_type_id),
      visit_purpose_id: Number(form.visit_purpose_id),
    };

    if (editingId) {
      await updateRecord(editingId, payload);
    } else {
      await createRecord(payload);
    }

    setModalOpen(false);
  }

  const filteredRows = touristRecords.filter((record) => {
    const haystack = [
      record.survey_id,
      record.full_name,
      resolveLabel(referenceTables.provinces, record.province_id),
      resolveLabel(referenceTables.resorts, record.resort_id, "resort_id", "resort_name"),
      resolveLabel(referenceTables.visitPurposes, record.visit_purpose_id),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const formFields = [
    ["full_name", "Full Name", "text"],
    ["email", "Email", "email"],
    ["contact_number", "Contact Number", "text"],
    ["country_id", "Country", "select", referenceTables.countries],
    ["region_id", "Region", "select", referenceTables.regions],
    ["province_id", "Province", "select", referenceTables.provinces],
    [
      "resort_id",
      "Resort",
      "select",
      referenceTables.resorts.map((item) => ({
        id: item.resort_id,
        name: item.resort_name,
      })),
    ],
    ["itinerary_id", "Itinerary", "select", referenceTables.itineraries],
    ["travel_mode_id", "Travel Mode", "select", referenceTables.travelModes],
    ["boat_type_id", "Boat Type", "select", referenceTables.boatTypes],
    ["visit_purpose_id", "Visit Purpose", "select", referenceTables.visitPurposes],
    ["arrival_date", "Arrival Date", "date"],
    ["filipino_count", "Filipino Count", "number"],
    ["foreigner_count", "Foreigner Count", "number"],
    ["total_male", "Total Male", "number"],
    ["total_female", "Total Female", "number"],
    ["age_0_7", "Age 0-7", "number"],
    ["age_8_59", "Age 8-59", "number"],
    ["age_60_above", "Age 60+", "number"],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tourism Monitoring"
        title="Data Management"
        description=""
      />

      <div className="panel px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <FiSearch
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
              size={18}
            />
            <input
              type="search"
              placeholder=""
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="input-base h-11 rounded-full pr-12"
            />
          </div>

          <button type="button" className="btn-secondary h-11 w-11 !rounded-full !px-0">
            <FiFilter size={16} />
          </button>

          <button type="button" className="btn-secondary h-11 gap-2">
            <FiCalendar size={16} />
            3/15/2026
          </button>

          <button type="button" className="btn-secondary h-11 w-11 !rounded-full !px-0">
            <FiUpload size={16} />
          </button>

          <button type="button" className="btn-primary h-11" onClick={openAddModal}>
            <FiPlus size={16} />
            Add Record
          </button>
        </div>
      </div>

      <div className="panel overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#abcbd1] text-slate-700">
              <tr>
                {["ID", "NAME", "Country", "Resort", "Purpose", "Arrival", "Visitors", "ACTIONS"].map(
                  (label) => (
                    <th
                      key={label}
                      className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em]"
                    >
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d4e5e8] bg-[#edf7f8]">
              {paginatedRows.map((row, index) => (
                <tr key={row.survey_id} className="hover:bg-[#e5f2f4]">
                  <td className="px-3 py-4 text-slate-600">{(page - 1) * pageSize + index + 1}</td>
                  <td className="px-3 py-4">
                    <p className="font-medium text-slate-800">{row.full_name}</p>
                  </td>
                  <td className="px-3 py-4 text-slate-700">
                    {resolveLabel(referenceTables.provinces, row.province_id)}
                  </td>
                  <td className="px-3 py-4 text-slate-700">
                    {resolveLabel(referenceTables.resorts, row.resort_id, "resort_id", "resort_name")}
                  </td>
                  <td className="px-3 py-4 text-slate-700">
                    {resolveLabel(referenceTables.visitPurposes, row.visit_purpose_id)}
                  </td>
                  <td className="px-3 py-4 text-slate-700">{row.arrival_date}</td>
                  <td className="px-3 py-4 text-slate-700">{row.total_visitors}</td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openEditModal(row)}
                        className="text-sky-500"
                      >
                        <FiEdit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRecord(row.survey_id)}
                        className="text-red-500"
                      >
                        <FiTrash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel flex items-center justify-between px-4 py-3 text-xs text-slate-500">
        <p>
          Showing {paginatedRows.length} of {filteredRows.length} total records
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#d7ebef] text-slate-600"
          >
            <FiChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#d7ebef] text-slate-600"
          >
            <FiChevronRight size={14} />
          </button>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Tourist Record"
        description=""
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            {formFields.map(([key, label, type, options]) => (
              <label key={key}>
                <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
                {type === "select" ? (
                  <select
                    value={form[key]}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [key]: event.target.value }))
                    }
                    className="input-base h-10 rounded-lg"
                  >
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={type}
                    value={form[key]}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [key]: event.target.value }))
                    }
                    className="input-base h-10 rounded-lg"
                  />
                )}
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
            >
              Cancel
            </button>
            <button type="submit" className="rounded-md bg-[#0d8b97] px-3 py-2 text-xs font-medium text-white">
              Save Record
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default DataManagement;
