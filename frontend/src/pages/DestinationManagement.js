import React from 'react';
import Sidebar from '../components/Sidebar';
import '../styles/layout.css';
import cagbalete from '../assets/Cagbalete.jpg';
import PutingBuhangin from '../assets/PutingBuhangin.jpg';
import DampalitanIsland from '../assets/DampalitanIsland.jpg';
import KwebangLampas from '../assets/Kwebang Lampas.jpg';
import MtPinagbanderahan from '../assets/Mt.Pinagbanderahan.jpg';
import Maubanlighthouse from '../assets/Maubanlighthouse.jpg';

function DestinationManagement() {

  const destinations = [
    {
      name: "Cagbalete Island",
      location: "Mauban Coast",
      desc: "A pristine island paradise with white sand beaches and crystal clear waters.",
      img: cagbalete
    },
    {
      name: "Puting Buhangin",
      location: "Barangay Cagbalete",
      desc: "Famous for its powdery white sand beach and calm turquoise waters.",
      img: PutingBuhangin
    },
    {
      name: "Dampalitan Island",
      location: "Pagbilao Waters",
      desc: "A scenic island with natural rock formations and great snorkeling.",
      img: DampalitanIsland
    },
    {
      name: "Kwebang Lampas",
      location: "Barangay Alitap",
      desc: "A stunning cave system with unique rock formations.",
      img: KwebangLampas
    },
    {
      name: "Mt. Pinagbanderahan",
      location: "Barangay Sta. Lucia",
      desc: "A popular hiking destination with panoramic views.",
      img: MtPinagbanderahan
    },
    {
      name: "Mauban Lighthouse",
      location: "Mauban Port Area",
      desc: "A historic lighthouse with coastal views and peaceful atmosphere.",
      img: Maubanlighthouse
    }
  ];

  return (
    <div className="layout">
      <Sidebar />

      <div className="content">
        <p className="subtitle">TOURISM MONITORING</p>
        <h1>Destination Management</h1>
        <p className="description">Manage tourist attraction records</p>

        <div className="top-bar">
          <button className="add-btn">+ Add Destination</button>
        </div>

        {/* DESTINATION GRID */}
        <div className="destination-grid">
          {destinations.map((item, index) => (
            <div className="destination-card" key={index}>
              
              <img src={item.img} alt={item.name} />

              <div className="card-content">
                <h3>{item.name}</h3>
                <span className="location">📍 {item.location}</span>
                <p>{item.desc}</p>

                <div className="card-actions">
                  <button className="edit-btn">✏️ Edit</button>
                  <button className="delete-btn">🗑 Delete</button>
                </div>
              </div>

            </div>
          ))}
        </div>

        {/* FOOTER */}
        <div className="destination-footer">
          <span>Total Destination: <strong>6</strong></span>
          <span>⭐ Average Ratings: <strong>4.5</strong></span>
        </div>

      </div>
    </div>
  );
}

export default DestinationManagement;