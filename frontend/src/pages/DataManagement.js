import React from 'react';
import Sidebar from '../components/Sidebar';
import '../styles/layout.css';
import { FaSearch, FaFilter, FaUpload, FaEye } from "react-icons/fa";

function DataManagement() {

  const data = [
    {name:"Mentina Nerjie Angelo", age:21, place:"Polo", date:"3/16/2026", dest:"Marlorica Santol"},
    {name:"Huidem Trish-Anne", age:21, place:"Atimonan", date:"3/16/2026", dest:"Quezon City"},
    {name:"Amarillo Ralph Richmo.", age:21, place:"Mauban", date:"3/16/2026", dest:"Kugonan"},
    {name:"Wennielyn Lorenzana", age:22, place:"Lucena", date:"3/16/2026", dest:"Cagbalete"},
    {name:"John Joseph Israel", age:21, place:"Gulang-gulang", date:"3/16/2026", dest:"Mabato"},
    {name:"Coedy Dela Cruz", age:21, place:"Tayabas", date:"3/16/2026", dest:"Brgy. Bagong Bayan"},
    {name:"Emmanuel Aviles", age:21, place:"Iyam", date:"3/16/2026", dest:"Gatuban"},
    {name:"Quert Russel Lalisa", age:21, place:"Better Living", date:"3/16/2026", dest:"Paresan ng Bayan"},
    {name:"Carabido Carl Kien", age:23, place:"Malapit sa Pacific", date:"3/16/2026", dest:"Stella Mariz"},
    {name:"Mark Ernest Kambal", age:21, place:"Dalahican", date:"3/16/2026", dest:"Mauban Port"}
  ];

  return (
    <div className="layout">
      <Sidebar />

      <div className="content">
        <p className="subtitle">TOURISM MONITORING</p>
        <h1>Data Management</h1>

        <div className="search-container">
          <input type="text" placeholder="Search..." />
          <div className="search-actions">
            <button><FaSearch /></button>
            <button><FaFilter /></button>
            <button className="date-btn">3/15/2026</button>
            <button><FaUpload /></button>
          </div>
        </div>

        <div className="table-card">
          <table className="custom-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>AGE</th>
                <th>PLACE</th>
                <th>DATE</th>
                <th>DESTINATION VISITED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {data.map((item, index) => (
                <tr key={index}>
                  <td>{item.name}</td>
                  <td>{item.age}</td>
                  <td>{item.place}</td>
                  <td>{item.date}</td>
                  <td>{item.dest}</td>
                  <td>
                    <button className="view-btn">
                      <FaEye /> View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          Showing 10 of 10 total records
        </div>

      </div>
    </div>
  );
}

export default DataManagement;