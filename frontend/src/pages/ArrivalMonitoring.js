import React from 'react';
import Sidebar from '../components/Sidebar';
import '../styles/layout.css';

function ArrivalMonitoring() {
  return (
    <div className="layout">
      <Sidebar />

      <div className="content">
        <p className="subtitle">TOURISM MONITORING</p>
        <h1>Arrival Monitoring</h1>

        {/* TOP CARDS */}
        <div className="cards">
          <div className="card stat-card">
            <p>DAILY ARRIVAL :</p>
            <h2>199 visitors</h2>
          </div>

          <div className="card stat-card">
            <p>WEEKLY AVERAGE :</p>
            <h2>1,390 visitors</h2>
          </div>

          <div className="card stat-card">
            <p>MONTHLY TOTAL :</p>
            <h2>5,970 visitors</h2>
          </div>
        </div>

        {/* CHARTS */}
        <div className="chart-card large">Daily Tourist Arrivals</div>
        <div className="chart-card large">Monthly Tourist Comparison</div>
        <div className="chart-card large">Visitor Satisfaction Ratings</div>

        {/* INSIGHTS */}
        <div className="insights-card">
          <h3>Key Insights</h3>
          <ul>
            <li>Tourist arrivals have increased by 15% compared to last year</li>
            <li>Peak days are typically weekends and holidays</li>
            <li>Summer season shows highest tourism activity</li>
            <li>Domestic tourists represent 80% of total arrivals</li>
          </ul>
        </div>

      </div>
    </div>
  );
}

export default ArrivalMonitoring;