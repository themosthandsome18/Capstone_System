import { capacityFareForBoatType, requiresCapacityFare } from "./boatCapacityFare";

const FARE = "1-2 pax (One-Way P1500, Two-way P2000)";

// Names are deliberately not "Public ..."/"Private ...": the rule must follow
// the flag, whatever the boat is called.
const boatTypes = [
  { id: 1, name: "Tourist Boat", requires_capacity_fare: true },
  { id: 2, name: "Passenger Boat", requires_capacity_fare: false },
  { id: 3, name: "Public Boat" },
];

describe("requiresCapacityFare", () => {
  it("is true when the boat row requires a capacity fare", () => {
    expect(requiresCapacityFare(boatTypes, 1)).toBe(true);
    expect(requiresCapacityFare(boatTypes, "1")).toBe(true);
  });

  it("is false when the boat row does not require one", () => {
    expect(requiresCapacityFare(boatTypes, 2)).toBe(false);
  });

  it("is false when the flag is missing, even for a boat named Public Boat", () => {
    expect(requiresCapacityFare(boatTypes, 3)).toBe(false);
  });

  it("is false when the boat row is not found", () => {
    expect(requiresCapacityFare(boatTypes, 99)).toBe(false);
    expect(requiresCapacityFare(boatTypes, "")).toBe(false);
    expect(requiresCapacityFare([], 1)).toBe(false);
    expect(requiresCapacityFare(undefined, 1)).toBe(false);
  });
});

describe("capacityFareForBoatType", () => {
  it("keeps the fare on a boat that requires one", () => {
    expect(capacityFareForBoatType(boatTypes, 1, FARE)).toBe(FARE);
  });

  it("clears the fare on a boat that explicitly does not take one", () => {
    expect(capacityFareForBoatType(boatTypes, 2, FARE)).toBe("");
  });

  it("keeps the fare when the flag is missing", () => {
    expect(capacityFareForBoatType(boatTypes, 3, FARE)).toBe(FARE);
  });

  it("keeps the fare when the boat row did not load", () => {
    expect(capacityFareForBoatType(boatTypes, 99, FARE)).toBe(FARE);
    expect(capacityFareForBoatType([], 1, FARE)).toBe(FARE);
    expect(capacityFareForBoatType(undefined, 1, FARE)).toBe(FARE);
  });
});
