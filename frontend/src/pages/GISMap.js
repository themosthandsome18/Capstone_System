import React from 'react';
import Sidebar from '../components/Sidebar';
import '../styles/layout.css';
import '../styles/gis.css';
import mapImg from '../assets/mauban-map.png';

function GISMap() {

  const locations = [
    { name: "Cagbalete Island", type: "Beach", rating: 4.8, visits: 3200 },
    { name: "Pulong Malaki", type: "Beach", rating: 4.7, visits: 2800 },
    { name: "Dampalitan Island", type: "Island", rating: 4.6, visits: 2100 },
    { name: "Kwebang Lampas", type: "Cave", rating: 4.5, visits: 1850 },
    { name: "Mt. Pinagbanderahan", type: "Mountain", rating: 4.4, visits: 1200 },
    { name: "Mauban Lighthouse", type: "Landmark", rating: 4.4, visits: 1200 },
  ];

  return (
    <div className="layout">
      <Sidebar />

      <div className="content">

        {/* HEADER */}
        <div className="page-header">
          <h5 className="section-label">TOURISM MONITORING</h5>
          <h1>GIS Map</h1>
        </div>

        <div className="gis-container">

          {/* LEFT - MAP */}
          <div className="map-section card">
            <div className="map-header">
              <h3>Interactive Map</h3>
              <span>📍 Mauban, Quezon</span>
            </div>

            <div className="map-box">

              {/* LEGEND */}
              <div className="legend">
                <h4>Legend</h4>
                <p>🟡 Beach</p>
                <p>🟢 Island</p>
                <p>🔵 Cave</p>
                <p>🟩 Mountain</p>
                <p>🔴 Landmark</p>
              </div>

              <img src={mapImg} alt="Map" className="map-image" />
            </div>
          </div>

          {/* RIGHT SIDE */}
          <div className="details-section">

            {/* SMALL CARD */}
            <div className="card info-card small-card">
              <h3>Location Details</h3>
              <p>Click on a marker to view location details</p>
            </div>

            {/* BIG CARD */}
            <div className="card info-card big-card">
              <h3>All Locations</h3>

              <div className="locations-list">
                {locations.map((loc, index) => (
                  <div className="location-item" key={index}>
                    
                    {/* LEFT */}
                    <div className="location-left">
                      <span className="dot"></span>
                      <div>
                        <strong>{loc.name}</strong>
                        <p className="type">{loc.type}</p>
                      </div>
                    </div>

                    {/* RIGHT */}
                    <div className="location-right">
                      <span className="rating">⭐ {loc.rating}</span>
                      <span className="visits">👥 {loc.visits}</span>
                    </div>

                  </div>
                ))}
              </div>

            </div>

          </div>
        </div>

        {/* STATS */}
        <div className="cards stats-row">
          <div className="card stat-box">
            <p>Total Locations</p>
            <h2>6</h2>
          </div>

          <div className="card stat-box">
            <p>Beach Destinations</p>
            <h2>2</h2>
          </div>

          <div className="card stat-box">
            <p>Island Destinations</p>
            <h2>1</h2>
          </div>

          <div className="card stat-box">
            <p>Average Rating</p>
            <h2>4.5</h2>
          </div>
        </div>

      </div>
    </div>
  );
}

export default GISMap;