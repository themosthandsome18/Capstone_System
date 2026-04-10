import React from 'react';
import Sidebar from '../components/Sidebar';
import '../styles/layout.css';

function FeedbackMonitoring() {

  const feedbacks = [
    {
      name: "Coedy Dela Cruz",
      location: "Tayabas Island",
      message: "Absolute Cinema mga pre grabe halimaw!!!",
      rating: 5,
      date: "4/2/2026"
    },
    {
      name: "Quert Lalisa Manoba",
      location: "Better Living",
      message: "I came here to drop somе money droppin all my money Drop some money, all this bread so yummy, yeah Twerkin, twerkin when I buy the things I like Dolla, dollas droppin on my ass tonight!",
      rating: 5,
      date: "4/2/2026"
    },
    {
      name: "John Joseph Israel",
      location: "Gulang-Gulang",
      message: "PAANO KITA MAISASALBA KUNG PAREHAS TAYONG NALULUNOD....",
      rating: 4,
      date: "4/2/2026"
    },
    {
      name: "Carl Kien Carabido",
      location: "Gatuban",
      message: "Regrets, Ive had a few, But then again, too few to mention I did what I had to do, And saw it through without exemption,",
      rating: 3,
      date: "4/2/2026"
    },
    {
      name: "Emmanuel Aviles",
      location: "Gatuban",
      message: "Ako si Emman isa akong kalbo!!!",
      rating: 3,
      date: "4/2/2026"
    }
  ];

  const renderStars = (rating) => {
    return "★★★★★☆☆☆☆☆".slice(5 - rating, 10 - rating);
  };

  return (
    <div className="layout">
      <Sidebar />

      <div className="content">
        <p className="subtitle">TOURISM MONITORING</p>
        <h1>Feedback Monitoring</h1>

        {/* STATS */}
        <div className="cards">
          <div className="card">
            <span>Total Feedback</span>
            <h2>8</h2>
          </div>

          <div className="card">
            <span>Average Rating</span>
            <h2>4.6 ⭐</h2>
          </div>

          <div className="card">
            <span>5 Star Review</span>
            <h2>5</h2>
          </div>
        </div>

        {/* FILTERS */}
        <div className="filters">
          <select>
            <option>All destination</option>
          </select>

          <select>
            <option>All ratings</option>
          </select>
        </div>

        {/* FEEDBACK LIST */}
        <div className="feedback-list">
          {feedbacks.map((item, index) => (
            <div className="feedback-card" key={index}>

              <div className="feedback-header">
                <div>
                  <h3>{item.name}</h3>
                  <p className="location">📍 {item.location}</p>
                </div>

                <div className="rating">
                  <span className="stars">{renderStars(item.rating)}</span>
                  <span className="date">📅 {item.date}</span>
                </div>
              </div>

              <p className="message">{item.message}</p>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default FeedbackMonitoring;