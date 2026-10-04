// Region and Province apply to a Philippine record only. The rule follows the
// country row's type ("local" or "foreign"), as the backend does, not its name.

function findCountry(countries, countryId) {
  return (countries || []).find((country) => String(country.id) === String(countryId));
}

// True unless the country row is found and typed "foreign", so a country that
// is unknown or not yet loaded keeps Region and Province required, as before.
export function countryRequiresLocation(countries, countryId) {
  return findCountry(countries, countryId)?.type !== "foreign";
}
