import React from 'react';
import ReactDOM from 'react-dom/client';
import "leaflet/dist/leaflet.css";
import "./tourism/Tourism_index.css";
import App from './App';
import "./sanitation/Sanitation_index.css";

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


