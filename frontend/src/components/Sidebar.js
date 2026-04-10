import React from 'react';
import { NavLink } from "react-router-dom";
import { FaChartBar, FaDatabase, FaPlaneArrival, FaMapMarkedAlt, FaComments, FaChartLine, FaGlobe  } from "react-icons/fa";
import '../styles/layout.css';

function Sidebar() {
  return (
    <div className="sidebar">
      <h3>Mauban Tourism Office</h3>

      <ul>
        <li>
          <NavLink to="/" end><FaChartBar style={{ marginRight: "10px" }} />Dashboard</NavLink>
        </li>

        <li>
          <NavLink to="/data" end><FaDatabase style={{ marginRight: "10px" }} />Data Management</NavLink>
        </li>

        <li>
          <NavLink to="/arrival" end><FaPlaneArrival style={{ marginRight: "10px" }} />Arrival Monitoring</NavLink>
        </li>

        <li>
          <NavLink to="/destination" end><FaMapMarkedAlt style={{ marginRight: "10px" }} />Destination Management</NavLink>
        </li>

        <li>
          <NavLink to="/feedback" end><FaComments style={{ marginRight: "10px" }} />Feedback Monitoring</NavLink>
        </li>

        <li>
          <NavLink to="/analytics" end><FaChartLine style={{ marginRight: "10px" }} />Analytics and Report</NavLink>
        </li>

        <li>
          <NavLink to="/gis" end><FaGlobe style={{ marginRight: "10px" }} />GIS Map</NavLink>
        </li>

      </ul>
    </div>
  );
}

export default Sidebar;