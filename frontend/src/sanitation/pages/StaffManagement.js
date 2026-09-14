import React, { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiMail,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiUserCheck,
  FiUserX,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../../auth/AuthContext";
import {
  createSanitaryStaff,
  fetchSanitaryStaff,
  updateSanitaryStaff,
} from "../services/sanitationApi";

function formatDisplayDate(dateString) {
  if (!dateString) return "—";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

const initialForm = {
  first_name: "",
  last_name: "",
  username: "",
  email: "",
  password: "",
};

export default function StaffManagement() {
  const { user: currentUser } = useAuth();

  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Status Toggle Confirmation
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggling, setToggling] = useState(false);

  async function loadStaff() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchSanitaryStaff();
      setStaffList(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || "Failed to load sanitary staff accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaff();
  }, []);

  const metrics = useMemo(() => {
    const total = staffList.length;
    const active = staffList.filter((s) => s.is_active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [staffList]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffList.filter((item) => {
      const matchesSearch =
        !q ||
        (item.full_name && item.full_name.toLowerCase().includes(q)) ||
        (item.username && item.username.toLowerCase().includes(q)) ||
        (item.email && item.email.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && item.is_active) ||
        (statusFilter === "inactive" && !item.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [staffList, search, statusFilter]);

  function openAddModal() {
    setForm(initialForm);
    setFormError("");
    setShowPassword(false);
    setIsAddModalOpen(true);
  }

  function closeAddModal() {
    setIsAddModalOpen(false);
    setForm(initialForm);
    setFormError("");
  }

  function handleFormChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formError) setFormError("");
  }

  async function handleCreateStaff(e) {
    e.preventDefault();
    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const username = form.username.trim().toLowerCase();
    const email = form.email.trim();
    const password = form.password;

    if (!firstName) {
      setFormError("First name is required.");
      return;
    }
    if (!lastName) {
      setFormError("Last name is required.");
      return;
    }
    if (!username) {
      setFormError("Username is required.");
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      setFormError(
        "Username may only contain letters, numbers, dots, dashes, and underscores."
      );
      return;
    }
    if (!password) {
      setFormError("Initial password is required.");
      return;
    }
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters long.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      await createSanitaryStaff({
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        password,
      });

      setSuccessNotice(`Inspector account @${username} created successfully.`);
      closeAddModal();
      await loadStaff();
      setTimeout(() => setSuccessNotice(""), 5000);
    } catch (err) {
      setFormError(
        err?.details?.detail || err?.message || "Failed to create inspector account."
      );
    } finally {
      setSaving(false);
    }
  }

  function promptToggleStatus(staffMember) {
    setToggleTarget({
      ...staffMember,
      nextStatus: !staffMember.is_active,
    });
  }

  async function confirmToggleStatus() {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      await updateSanitaryStaff(toggleTarget.id, {
        is_active: toggleTarget.nextStatus,
      });

      setSuccessNotice(
        `Inspector @${toggleTarget.username} has been ${
          toggleTarget.nextStatus ? "activated" : "deactivated"
        }.`
      );
      setToggleTarget(null);
      await loadStaff();
      setTimeout(() => setSuccessNotice(""), 5000);
    } catch (err) {
      alert(
        err?.details?.detail ||
          err?.message ||
          "Failed to update inspector status."
      );
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="sanitary-management-page" style={{ padding: "24px 32px" }}>
      {/* Header */}
      <div
        className="sanitary-page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: "24px", fontWeight: "800", color: "#0f172a" }}>
            Inspector & Staff Management
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
            Create and maintain authorized Sanitary Inspector accounts with official app credentials.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="add-establishment-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "#15803d",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "10px 18px",
            fontSize: "14px",
            fontWeight: "700",
            cursor: "pointer",
            boxShadow: "0 2px 4px rgba(21, 128, 61, 0.2)",
          }}
        >
          <FiPlus size={18} /> Add New Inspector
        </button>
      </div>

      {/* Success Banner */}
      {successNotice && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FiCheckCircle size={18} />
            <span>{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice("")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#166534" }}
          >
            <FiX size={16} />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "14px",
          }}
        >
          <FiAlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            padding: "18px 20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "10px",
              background: "#e0f2fe",
              color: "#0369a1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
            }}
          >
            <FiUsers />
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>
              Total Registered
            </div>
            <div style={{ fontSize: "24px", fontWeight: "900", color: "#0f172a" }}>
              {metrics.total}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "18px 20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "10px",
              background: "#dcfce7",
              color: "#15803d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
            }}
          >
            <FiUserCheck />
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>
              Active Inspectors
            </div>
            <div style={{ fontSize: "24px", fontWeight: "900", color: "#15803d" }}>
              {metrics.active}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "18px 20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "10px",
              background: "#f1f5f9",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
            }}
          >
            <FiUserX />
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>
              Inactive Accounts
            </div>
            <div style={{ fontSize: "24px", fontWeight: "900", color: "#64748b" }}>
              {metrics.inactive}
            </div>
          </div>
        </div>
      </div>

      {/* Directory Table Card */}
      <section
        className="establishment-table-card"
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}
      >
        {/* Filter / Search Tools */}
        <div
          className="establishment-tools"
          style={{
            padding: "16px 20px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div
            className="establishment-search"
            style={{
              flex: "1 1 280px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "8px 12px",
            }}
          >
            <FiSearch color="#64748b" size={16} />
            <input
              type="text"
              placeholder="Search inspector by name, username, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                width: "100%",
                fontSize: "13.5px",
              }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              fontSize: "13.5px",
              fontWeight: "600",
              color: "#334155",
            }}
          >
            <option value="all">All Statuses ({staffList.length})</option>
            <option value="active">Active Only ({metrics.active})</option>
            <option value="inactive">Inactive Only ({metrics.inactive})</option>
          </select>

          <button
            type="button"
            onClick={loadStaff}
            disabled={loading}
            title="Refresh inspector directory"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              fontSize: "13.5px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            <FiRefreshCw className={loading ? "spin" : ""} size={14} /> Refresh
          </button>
        </div>

        {/* Table Wrap */}
        <div className="establishment-table-wrap" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: "700", color: "#475569", textTransform: "uppercase" }}>
                  Sanitary Inspector
                </th>
                <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: "700", color: "#475569", textTransform: "uppercase" }}>
                  Username
                </th>
                <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: "700", color: "#475569", textTransform: "uppercase" }}>
                  Email Address
                </th>
                <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: "700", color: "#475569", textTransform: "uppercase", textAlign: "center" }}>
                  Status
                </th>
                <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: "700", color: "#475569", textTransform: "uppercase" }}>
                  Date Created
                </th>
                <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: "700", color: "#475569", textTransform: "uppercase", textAlign: "center" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && staffList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "36px", textAlign: "center", color: "#64748b" }}>
                    Loading staff records...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "36px", textAlign: "center", color: "#64748b" }}>
                    {search || statusFilter !== "all"
                      ? "No inspectors match the active search or filter criteria."
                      : "No sanitary inspector accounts found. Click '+ Add New Inspector' to register one."}
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => {
                  const isSelf = currentUser && String(currentUser.id) === String(staff.id);
                  const initials = `${(staff.first_name || "")[0] || ""}${(staff.last_name || "")[0] || ""}`.toUpperCase() || "SI";

                  return (
                    <tr
                      key={staff.id}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Name & Avatar */}
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              background: staff.is_active ? "#dcfce7" : "#e2e8f0",
                              color: staff.is_active ? "#15803d" : "#64748b",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: "800",
                              fontSize: "13px",
                            }}
                          >
                            {initials}
                          </div>
                          <div>
                            <strong style={{ display: "block", color: "#0f172a", fontSize: "14px" }}>
                              {staff.full_name || staff.username}
                            </strong>
                            <span style={{ fontSize: "12px", color: "#64748b" }}>
                              Sanitary Inspector
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Username */}
                      <td style={{ padding: "14px 18px", fontSize: "13.5px", color: "#334155" }}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            background: "#f1f5f9",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            color: "#0f172a",
                          }}
                        >
                          @{staff.username}
                        </span>
                      </td>

                      {/* Email */}
                      <td style={{ padding: "14px 18px", fontSize: "13.5px", color: "#475569" }}>
                        {staff.email ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <FiMail size={14} color="#94a3b8" />
                            {staff.email}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>No email recorded</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: "14px 18px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "11.5px",
                            fontWeight: "800",
                            letterSpacing: "0.5px",
                            background: staff.is_active ? "#dcfce7" : "#fee2e2",
                            color: staff.is_active ? "#15803d" : "#b91c1c",
                          }}
                        >
                          {staff.is_active ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>

                      {/* Date Created */}
                      <td style={{ padding: "14px 18px", fontSize: "13px", color: "#64748b" }}>
                        {formatDisplayDate(staff.date_joined)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "14px 18px", textAlign: "center" }}>
                        {isSelf ? (
                          <span
                            style={{
                              fontSize: "11.5px",
                              color: "#64748b",
                              background: "#f1f5f9",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontWeight: "600",
                            }}
                          >
                            Current Account
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => promptToggleStatus(staff)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              fontSize: "12.5px",
                              fontWeight: "700",
                              cursor: "pointer",
                              border: staff.is_active ? "1px solid #fecaca" : "1px solid #bbf7d0",
                              background: staff.is_active ? "#fff" : "#15803d",
                              color: staff.is_active ? "#dc2626" : "#ffffff",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {staff.is_active ? (
                              <>
                                <FiUserX size={14} /> Deactivate
                              </>
                            ) : (
                              <>
                                <FiUserCheck size={14} /> Activate
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── MODAL: ADD NEW INSPECTOR ── */}
      {isAddModalOpen && (
        <div
          className="establishment-modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={closeAddModal}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#f8fafc",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "#dcfce7",
                    color: "#15803d",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FiShield size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "#0f172a" }}>
                    Create Sanitary Inspector Account
                  </h2>
                  <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "#64748b" }}>
                    Credentials will allow mobile inspector login and sanitation recording.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateStaff} style={{ padding: "24px" }}>
              {formError && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#b91c1c",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FiAlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Name Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "5px" }}>
                    First Name <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Maria"
                    value={form.first_name}
                    onChange={(e) => handleFormChange("first_name", e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13.5px",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "5px" }}>
                    Last Name <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Santos"
                    value={form.last_name}
                    onChange={(e) => handleFormChange("last_name", e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13.5px",
                    }}
                  />
                </div>
              </div>

              {/* Username */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "5px" }}>
                  Username <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "12px", top: "10px", color: "#94a3b8", fontSize: "13.5px" }}>
                    @
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="inspector_maria"
                    value={form.username}
                    onChange={(e) => handleFormChange("username", e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "9px 12px 9px 28px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13.5px",
                    }}
                  />
                </div>
                <small style={{ color: "#64748b", fontSize: "11.5px", marginTop: "3px", display: "block" }}>
                  Unique username for mobile app sign-in.
                </small>
              </div>

              {/* Email */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "5px" }}>
                  Email Address <span style={{ color: "#64748b", fontWeight: "normal" }}>(Optional)</span>
                </label>
                <input
                  type="email"
                  placeholder="maria.santos@mauban.gov.ph"
                  value={form.email}
                  onChange={(e) => handleFormChange("email", e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13.5px",
                  }}
                />
              </div>

              {/* Initial Password */}
              <div style={{ marginBottom: "22px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "5px" }}>
                  Initial Password <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Minimum 6 characters"
                    value={form.password}
                    onChange={(e) => handleFormChange("password", e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "9px 40px 9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13.5px",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "9px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#64748b",
                    }}
                  >
                    {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={saving}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#475569",
                    fontWeight: "600",
                    fontSize: "13.5px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#15803d",
                    color: "#ffffff",
                    fontWeight: "700",
                    fontSize: "13.5px",
                    cursor: saving ? "not-allowed" : "pointer",
                    boxShadow: "0 2px 4px rgba(21, 128, 61, 0.2)",
                  }}
                >
                  {saving ? "Creating Account..." : "Create Inspector"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: STATUS TOGGLE CONFIRMATION ── */}
      {toggleTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => !toggling && setToggleTarget(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "440px",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: toggleTarget.nextStatus ? "#dcfce7" : "#fee2e2",
                color: toggleTarget.nextStatus ? "#15803d" : "#dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: "24px",
              }}
            >
              {toggleTarget.nextStatus ? <FiUserCheck /> : <FiAlertCircle />}
            </div>

            <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: "800", color: "#0f172a" }}>
              {toggleTarget.nextStatus ? "Activate Inspector Account?" : "Deactivate Inspector Account?"}
            </h3>

            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "13.5px", lineHeight: "1.5" }}>
              {toggleTarget.nextStatus ? (
                <>
                  Are you sure you want to activate <strong>{toggleTarget.full_name || toggleTarget.username}</strong> (@{toggleTarget.username})? They will immediately regain access to the Sanitary Inspector mobile portal.
                </>
              ) : (
                <>
                  Are you sure you want to deactivate <strong>{toggleTarget.full_name || toggleTarget.username}</strong> (@{toggleTarget.username})? They will be immediately prevented from logging into the mobile inspection system.
                </>
              )}
            </p>

            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => setToggleTarget(null)}
                disabled={toggling}
                style={{
                  padding: "10px 18px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  fontWeight: "600",
                  fontSize: "13.5px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmToggleStatus}
                disabled={toggling}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: toggleTarget.nextStatus ? "#15803d" : "#dc2626",
                  color: "#ffffff",
                  fontWeight: "700",
                  fontSize: "13.5px",
                  cursor: toggling ? "not-allowed" : "pointer",
                }}
              >
                {toggling
                  ? "Updating..."
                  : toggleTarget.nextStatus
                  ? "Yes, Activate Account"
                  : "Yes, Deactivate Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
