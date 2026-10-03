// Boat Capacity and Fare applies to the boat types whose row says so
// (requires_capacity_fare), not to a boat with a particular name, so renaming
// a boat type cannot switch the rule off.

function findBoatType(boatTypes, boatTypeId) {
  return (boatTypes || []).find((boat) => String(boat.id) === String(boatTypeId));
}

// True only when the boat row is found and explicitly takes a fare, so the
// field stays disabled whenever the rule is unknown.
export function requiresCapacityFare(boatTypes, boatTypeId) {
  return findBoatType(boatTypes, boatTypeId)?.requires_capacity_fare === true;
}

// The fare to keep for a boat type. It is cleared only when the boat row is
// found and explicitly takes no fare. When the rule is unknown (the row did
// not load, or it has no flag) the current fare is kept, never wiped.
export function capacityFareForBoatType(boatTypes, boatTypeId, fare) {
  return findBoatType(boatTypes, boatTypeId)?.requires_capacity_fare === false ? "" : fare;
}
