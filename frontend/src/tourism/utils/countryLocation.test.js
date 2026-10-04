import { countryRequiresLocation } from "./countryLocation";

// "Philippine Islands" is deliberately not named "Philippines", and the
// foreign rows do not say so in their names: the rule must follow the type.
const countries = [
  { id: 1, name: "Philippine Islands", type: "local" },
  { id: 2, name: "United States", type: "foreign" },
  { id: 6, name: "International", type: "foreign" },
  { id: 7, name: "Untyped Country" },
];

describe("countryRequiresLocation", () => {
  it("is true for a local country", () => {
    expect(countryRequiresLocation(countries, 1)).toBe(true);
    expect(countryRequiresLocation(countries, "1")).toBe(true);
  });

  it("is false for a foreign country", () => {
    expect(countryRequiresLocation(countries, 2)).toBe(false);
    expect(countryRequiresLocation(countries, "6")).toBe(false);
  });

  it("stays true when the country has no type", () => {
    expect(countryRequiresLocation(countries, 7)).toBe(true);
  });

  it("stays true when no country is chosen or the list has not loaded", () => {
    expect(countryRequiresLocation(countries, "")).toBe(true);
    expect(countryRequiresLocation(countries, 99)).toBe(true);
    expect(countryRequiresLocation([], 2)).toBe(true);
    expect(countryRequiresLocation(undefined, 2)).toBe(true);
  });
});
