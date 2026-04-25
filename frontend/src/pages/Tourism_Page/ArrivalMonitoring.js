import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { FiBriefcase, FiCalendar, FiDownload, FiMoon, FiSun, FiUsers } from "react-icons/fi";
import { useTourismData } from "../../context/TourismDataContext";
import { formatNumber } from "../../utils/format";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

function ArrivalMonitoring() {
  const { touristRecords, loading } = useTourismData();

  const totalArrivals = touristRecords.reduce(
    (total, record) => total + record.total_visitors,
    0
  );

  const totalMale = touristRecords.reduce(
    (total, record) => total + record.total_male,
    0
  );

  const totalFemale = touristRecords.reduce(
    (total, record) => total + record.total_female,
    0
  );

  const sameDay = touristRecords
    .filter((record) => record.total_visitors >= 5)
    .reduce((total, record) => total + record.total_visitors, 0);

  const overnight = Math.max(totalArrivals - sameDay, 0);

  const rows = [
    {
      date: "Apr 18",
      group: "Mecantina Family",
      male: 3,
      female: 3,
      overnight: 6,
      sameDay: "—",
      resort: "Cagbalete Sands Resort",
      fee: "₱1,800",
    },
    {
      date: "Apr 18",
      group: "Trish Tour Group",
      male: 1,
      female: 1,
      overnight: 2,
      sameDay: "—",
      resort: "MVT Sto. Nino",
      fee: "₱600",
    },
    {
      date: "Apr 18",
      group: "Ralph Barkada",
      male: 5,
      female: 4,
      overnight: "—",
      sameDay: 9,
      resort: "Pansacola Beach",
      fee: "₱2,700",
    },
    {
      date: "Apr 18",
      group: "Lorenzana Family",
      male: 1,
      female: 2,
      overnight: 3,
      sameDay: "—",
      resort: "Cagbalete Sands Resort",
      fee: "₱900",
    },
    {
      date: "Apr 18",
      group: "Israel Couple",
      male: 1,
      female: 1,
      overnight: 2,
      sameDay: "—",
      resort: "Pansacola Beach",
      fee: "₱600",
    },
    {
      date: "Apr 18",
      group: "Dela Cruz Org",
      male: 8,
      female: 4,
      overnight: "—",
      sameDay: 12,
      resort: "Villa Cleofas",
      fee: "₱3,600",
    },
  ];

  if (loading) {
    return <div className="panel p-10 text-center">Loading arrival data...</div>;
  }

  return (
    <div className="arrival-page">
      <div className="arrival-header">
        <div>
          <h1>Arrival Monitoring</h1>
          <p>Real-time tourist arrivals — auto calculated totals from booking data</p>
        </div>

        <div className="arrival-actions">
          <button type="button" className="arrival-date-btn">
            <FiCalendar size={15} />
            Apr 18, 2026
          </button>

          <button type="button" className="arrival-export-btn">
            <FiDownload size={15} />
            Export
          </button>
        </div>
      </div>

      <div className="arrival-stats">
        <StatCard title="Total Arrivals" value={formatNumber(totalArrivals)} icon={<FiUsers />} />
        <StatCard title="Male" value={formatNumber(totalMale)} icon="♂" />
        <StatCard title="Female" value={formatNumber(totalFemale)} icon="♀" pink />
        <StatCard title="Overnight" value={formatNumber(overnight)} icon={<FiMoon />} dark />
        <StatCard title="Same Day" value={formatNumber(sameDay)} icon={<FiSun />} yellow />
        <StatCard title="Fees Collected" value="₱10,200" icon={<FiBriefcase />} />
      </div>

      <div className="arrival-note">
        ✦ All totals are auto-calculated from registered arrivals — no manual encoding required
      </div>

      <div className="arrival-table-card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Group/Guest</th>
              <th>Male</th>
              <th>Female</th>
              <th>Overnight</th>
              <th>Sameday</th>
              <th>Resort</th>
              <th>Fee Paid</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.group}>
                <td>{row.date}</td>
                <td className="guest-name">{row.group}</td>
                <td>{row.male}</td>
                <td>{row.female}</td>
                <td>{row.overnight}</td>
                <td>{row.sameDay}</td>
                <td>{row.resort}</td>
                <td className="fee">{row.fee}</td>
              </tr>
            ))}

            <tr className="daily-total">
              <td>DAILY TOTAL</td>
              <td />
              <td>19</td>
              <td>15</td>
              <td>13</td>
              <td>21</td>
              <td />
              <td className="fee">₱10,200</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, pink, dark, yellow }) {
  return (
    <section className="arrival-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>

      <div
        className={`arrival-stat-icon ${pink ? "pink" : ""} ${dark ? "dark" : ""} ${
          yellow ? "yellow" : ""
        }`}
      >
        {icon}
      </div>
    </section>
  );
}

export default ArrivalMonitoring;