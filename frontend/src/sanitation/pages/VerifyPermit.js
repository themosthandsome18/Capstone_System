import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FiCheckCircle, FiXCircle, FiAlertCircle, FiShield } from "react-icons/fi";
import { API_BASE_URL } from "../../shared/apiClient";
import "../Sanitation_index.css";
function VerifyPermit() {
  const { code } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);

  useEffect(() => {
    async function verifyPermit() {
      try {
        const response = await fetch(`${API_BASE_URL}/mobile/sanitation/permits/verify/?code=${code}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Unable to verify this permit code.");
        }

        setVerificationResult(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (code) {
      verifyPermit();
    }
  }, [code]);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.spinner}></div>
          <h2>Verifying Permit...</h2>
          <p>Please wait while we check the official LGU records.</p>
        </div>
      </div>
    );
  }

  if (error || !verificationResult?.verified) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <FiXCircle size={64} color="#ef4444" style={styles.icon} />
          <h2 style={{ color: '#ef4444' }}>Verification Failed</h2>
          <p style={styles.description}>{error || "This QR code does not match any valid sanitary permit records."}</p>
          <div style={styles.helpBox}>
            <p>Ensure you scanned an official Mauban LGU QR code.</p>
          </div>
        </div>
      </div>
    );
  }

  const { establishment, permit } = verificationResult;
  const isGoodStanding = permit.compliance_status === "good_standing";
  const isWarning = ["upcoming", "for_completion"].includes(permit.compliance_status);
  
  let statusColor = "#10b981"; // Green
  let StatusIcon = FiCheckCircle;
  let statusTitle = "Verified: Good Standing";

  if (!isGoodStanding) {
    if (isWarning) {
      statusColor = "#f59e0b"; // Orange/Yellow
      StatusIcon = FiAlertCircle;
      statusTitle = "Verified: Action Required";
    } else {
      statusColor = "#ef4444"; // Red
      StatusIcon = FiXCircle;
      statusTitle = "Verified: Non-Compliant";
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <FiShield size={48} color="#0f172a" />
          <h1>Mauban LGU</h1>
          <p>Sanitation Permit Verification</p>
        </div>

        <div style={{ ...styles.statusBox, backgroundColor: `${statusColor}15`, borderColor: statusColor }}>
          <StatusIcon size={48} color={statusColor} style={styles.icon} />
          <h2 style={{ color: statusColor }}>{statusTitle}</h2>
          <p style={{ fontWeight: 600 }}>{permit.compliance_status_label}</p>
        </div>

        <div style={styles.detailsGrid}>
          <div style={styles.detailItem}>
            <span style={styles.label}>Business Name</span>
            <strong style={styles.value}>{establishment.business_name}</strong>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.label}>Business Type</span>
            <strong style={styles.value}>{establishment.business_type_name}</strong>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.label}>Owner / Proprietor</span>
            <strong style={styles.value}>{establishment.owner_name}</strong>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.label}>Address</span>
            <strong style={styles.value}>{establishment.address}, Brgy. {establishment.barangay}</strong>
          </div>
        </div>

        <div style={{ ...styles.detailsGrid, marginTop: '1rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
           <div style={styles.detailItem}>
            <span style={styles.label}>Permit Number</span>
            <strong style={styles.value}>{permit.permit_number || 'N/A'}</strong>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.label}>Permit Status</span>
            <strong style={styles.value}>{permit.permit_status_label}</strong>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.label}>Date Issued</span>
            <strong style={styles.value}>{permit.permit_issued_date || 'N/A'}</strong>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.label}>Date Expiry</span>
            <strong style={styles.value}>{permit.permit_expiry_date || 'N/A'}</strong>
          </div>
        </div>

        <div style={styles.footer}>
          <p>This information is pulled live from the Mauban Municipal Health Office Sanitary Section records.</p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f1f5f9',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
    textAlign: 'center'
  },
  header: {
    marginBottom: '24px',
    paddingBottom: '24px',
    borderBottom: '1px solid #e2e8f0'
  },
  icon: {
    marginBottom: '16px'
  },
  statusBox: {
    padding: '24px',
    borderRadius: '12px',
    border: '2px solid',
    marginBottom: '32px'
  },
  detailsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    textAlign: 'left'
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  label: {
    fontSize: '0.875rem',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600
  },
  value: {
    fontSize: '1rem',
    color: '#0f172a'
  },
  helpBox: {
    marginTop: '24px',
    padding: '16px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    color: '#475569',
    fontSize: '0.9rem'
  },
  footer: {
    marginTop: '32px',
    paddingTop: '24px',
    borderTop: '1px solid #e2e8f0',
    fontSize: '0.8rem',
    color: '#94a3b8'
  },
  spinner: {
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px auto'
  }
};

export default VerifyPermit;
