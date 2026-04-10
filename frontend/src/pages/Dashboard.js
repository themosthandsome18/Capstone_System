import React from 'react';
import Sidebar from '../components/Sidebar';
import '../styles/layout.css';
import { FaUsers, FaChartBar, FaMapMarkerAlt, FaStar } from "react-icons/fa";

function Dashboard() {
  return (
    <div className="layout">
      <Sidebar />

      <div className="content">
        {/* HEADER */}
        <div className="header">
          <div>
            <p className="subtitle">TOURISM MONITORING</p>
            <h1>Dashboard</h1>
          </div>
          <div className="header-icons">
            <span>🔔</span>
            <span>👤</span>
          </div>
        </div>

        {/* CARDS */}
        <div className="cards">
          <div className="card">
            <div>
              <p>Total Tourist Arrivals</p>
              <h2>12,550</h2>
              <span>↑ 15% from last month</span>
            </div>
            <FaUsers className="icon blue" />
          </div>

          <div className="card">
            <div>
              <p>Monthly Tourist Visits</p>
              <h2>3,200</h2>
              <span>↑ 22% from last month</span>
            </div>
            <FaChartBar className="icon purple" />
          </div>

          <div className="card">
            <div>
              <p>Top Tourist Destination</p>
              <h2>15</h2>
              <span>Active destination</span>
            </div>
            <FaMapMarkerAlt className="icon teal" />
          </div>

          <div className="card">
            <div>
              <p>Tourist Satisfaction</p>
              <h2>4.6</h2>
              <span>Out of 5.0 stars</span>
            </div>
            <FaStar className="icon yellow" />
          </div>
        </div>

        {/* CHARTS */}
        <div className="charts">
          <div className="chart-card">Line Chart</div>
          <div className="chart-card">Bar Chart</div>
        </div>

        {/* PIE */}
        <div className="pie-card">
          Pie Chart
        </div>

      </div>
    </div>
  );
}

export default Dashboard;