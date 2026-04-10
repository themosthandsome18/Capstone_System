import React from 'react';
import Sidebar from '../components/Sidebar';
import '../styles/layout.css';

function AnalyticsAndReport() {

  const stats = [
    { title: "YTD Growth Rate", value: "+18%", sub: "Compared to 2025" },
    { title: "Total Visitors", value: "14,500", sub: "Year 2026 (projected)" },
    { title: "Avg Satisfaction", value: "4.6", sub: "Out of 5.0 rating" },
    { title: "Est. Revenue", value: "₱1.45M", sub: "Tourism income" },
  ];

  const destinations = [
    { rank: 1, name: "Cagbalete Island", visits: "4,200 visits" },
    { rank: 2, name: "Puting Buhangin", visits: "3,800 visits" },
    { rank: 3, name: "Dampalitan Island", visits: "2,900 visits" },
    { rank: 4, name: "Kwebang Lampas", visits: "2,100 visits" },
    { rank: 5, name: "Mt. Pinagbanderahan", visits: "1,500 visits" },
  ];

  const kpis = [
    { label: "Visitor Satisfaction", value: 92, color: "blue" },
    { label: "Returns Visitor Rate", value: 67, color: "light-blue" },
    { label: "Destination Capacity", value: 78, color: "purple" },
  ];

  return (
    <div className="layout">
      <Sidebar />

      <div className="content">

        {/* HEADER */}
        <div className="page-header">
          <h5 className="section-label">TOURISM MONITORING</h5>
          <h1>Analytics and Reports</h1>
          <p className="subtitle">
            Visual data analytics and performance reports
          </p>
        </div>

        {/* STAT CARDS */}
        <div className="cards">
          {stats.map((item, index) => (
            <div className="card stat-card" key={index}>
              <p>{item.title}</p>
              <h2>{item.value}</h2>
              <span>{item.sub}</span>
            </div>
          ))}
        </div>

        {/* CHARTS */}
        <div className="chart-container">
          <h3>Tourism Growth Trends (2021–2026)</h3>
          <div className="chart large-chart">[Line Chart]</div>
        </div>

        <div className="chart-container">
          <h3>Destination Popularity Rankings</h3>
          <div className="chart">[Bar Chart]</div>
        </div>

        <div className="chart-container">
          <h3>Visitor Demographics Analysis</h3>
          <div className="chart">[Bar Chart]</div>
        </div>

        <div className="chart-container">
          <h3>Monthly Tourism Performance</h3>
          <div className="chart">[Line Chart]</div>
        </div>

        {/* BOTTOM SECTION */}
        <div className="bottom-panels">

          {/* TOP DESTINATIONS */}
          <div className="card panel">
            <h3 className="panel-title">Top Performing Destination</h3>

            {destinations.map((item) => (
              <div className="destination-item" key={item.rank}>
                <span className="rank">{item.rank}</span>
                <div>
                  <p className="dest-name">{item.name}</p>
                  <span className="visits">{item.visits}</span>
                </div>
              </div>
            ))}
          </div>

          {/* KPI */}
          <div className="card panel">
            <h3 className="panel-title">Key Performance Indicators</h3>

            {kpis.map((item, index) => (
              <div className="kpi-row" key={index}>
                <div className="kpi-header">
                  <span>{item.label}</span>
                  <span>{item.value}%</span>
                </div>

                <div className="progress">
                  <div
                    className={`progress-bar ${item.color}`}
                    style={{ width: `${item.value}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
}

export default AnalyticsAndReport;