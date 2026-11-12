// Fills the Add Record wizard of Booking Management the way a person does, one step at a time, for the tests that used to open an existing
// record and change it (a record opened from the table is only looked at now; Add Record is the place where fields are written).
// The component under test is rendered by the test itself, with the router state { openAddModal: true }.
import { fireEvent, screen } from "@testing-library/react";

export const goToStep = (label) =>
  fireEvent.click(screen.getByText(label, { selector: ".wizard-step-label strong" }).closest(".wizard-step-item"));

export const selectWith = (placeholder) => screen.getByText(placeholder, { selector: "option" }).closest("select");

export const fieldInput = (label) => screen.getByText(label).closest(".wizard-field").querySelector("input");

export function fillTouristInfo() {
  fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Nora" } });
  fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Santos" } });
  fireEvent.change(screen.getByPlaceholderText("email@example.com"), { target: { value: "nora@example.test" } });
  fireEvent.change(screen.getByPlaceholderText("9XXXXXXXXX"), { target: { value: "9170000000" } });
}

export function fillLocation({ region = "4", province = "7", resort = "3", itinerary = "11" } = {}) {
  goToStep("Location");
  fireEvent.change(selectWith("Select region"), { target: { value: region } });
  fireEvent.change(selectWith("Select province"), { target: { value: province } });
  fireEvent.change(selectWith("Select resort"), { target: { value: resort } });
  fireEvent.change(selectWith("Select length of stay"), { target: { value: itinerary } });
}

export function fillTravel({ mode = "21", boat = "31", purpose = "41", date = "2099-06-01" } = {}) {
  goToStep("Travel Details");
  fireEvent.change(selectWith("Select mode"), { target: { value: mode } });
  fireEvent.change(selectWith("Select boat"), { target: { value: boat } });
  fireEvent.change(selectWith("Select purpose"), { target: { value: purpose } });
  fireEvent.change(document.querySelector('.wizard-shell input[type="date"]'), { target: { value: date } });
}

// set one count on the Head Count step
export function setCount(label, value) {
  goToStep("Head Count");
  fireEvent.change(fieldInput(label), { target: { value: String(value) } });
}

// make the head count add up (male + female, and the age groups, equal the visitors) so that the record can be saved
export function balanceHeadCount(total) {
  const male = Math.ceil(total / 2);
  setCount("Total Male", male);
  setCount("Total Female", total - male);
  setCount("Age 8-59", total);
}

// Tourist Info, Location, Travel Details filled; the person is on the Travel Details step.
export function fillAddRecordUpToTravel(travel = {}) {
  fillTouristInfo();
  fillLocation();
  fillTravel(travel);
}

// A record that is only looked at has no way to be saved: on its last step there is no Update Record and no Save Record, no "Progress saved
// automatically", and nothing was sent to the server. (The server's update endpoint is still there; the screen no longer reaches it.)
export function expectNoWayToSave(...sent) {
  goToStep("Review");
  expect(screen.queryByRole("button", { name: /Update Record|Save Record/ })).toBeNull();
  expect(screen.queryByText("Progress saved automatically")).toBeNull();
  sent.forEach((mock) => expect(mock).not.toHaveBeenCalled());
}
