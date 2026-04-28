import { FiEdit2, FiMapPin, FiStar, FiTrash2 } from "react-icons/fi";
import { useTourismData } from "../context/TourismDataContext";

function DestinationManagement() {
  const { referenceTables } = useTourismData();

  const destinations = referenceTables.resorts;

  const averageRating = (
    destinations.reduce((sum, item) => sum + item.tourism_rating, 0) /
    Math.max(destinations.length, 1)
  ).toFixed(1);

  return (
    <div className="destination-page">
      <div className="destination-header">
        <div>
          <h1>Destination Management</h1>
          <p>Manage resorts and tourist spot in Mauban, Quezon</p>
        </div>

        <button type="button" className="destination-add-btn">
          <FiMapPin />
          Add Destination
        </button>
      </div>

      <div className="destination-search">
        <input type="search" placeholder="Search destinations..." />
      </div>

      <div className="destination-grid">
        {destinations.map((destination) => (
          <div key={destination.resort_id} className="destination-card">
            <div className="destination-image">
              <img src={destination.image} alt={destination.resort_name} />

              <span className="destination-rating">
                <FiStar />
                {destination.tourism_rating}
              </span>
            </div>

            <div className="destination-body">
              <div className="destination-title-row">
                <div>
                  <h3>{destination.resort_name}</h3>
                  <p>
                    <FiMapPin />
                    {destination.location}
                  </p>
                </div>

                <span
                  className={`destination-status ${
                    destination.with_mayors_permit ? "active" : "maintenance"
                  }`}
                >
                  {destination.with_mayors_permit ? "Active" : "Maintenance"}
                </span>
              </div>

              <div className="destination-card-stats">
                <div>
                  <p>VISITORS</p>
                  <h4>{destination.monthly_arrivals}</h4>
                  <span>this month</span>
                </div>

                <div>
                  <p>TREND</p>
                  <h4 className={destination.monthly_arrivals < 400 ? "negative" : ""}>
                    {destination.monthly_arrivals < 400 ? "-3%" : "+18%"}
                  </h4>
                  <span>vs. last month</span>
                </div>
              </div>

              <div className="destination-action-row">
                <button type="button" className="destination-edit-btn">
                  <FiEdit2 />
                  Edit
                </button>

                <button type="button" className="destination-delete-btn">
                  <FiTrash2 />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="destination-footer">
        <p>
          TOTAL DESTINATION: <strong>{destinations.length}</strong>
        </p>

        <p>
          Average Ratings: <FiStar /> <strong>{averageRating}</strong>
        </p>
      </div>
    </div>
  );
}

export default DestinationManagement;
