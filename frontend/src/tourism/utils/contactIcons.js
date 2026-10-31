// The twelve icons an emergency contact can have: ONE place that ties each
// name to its picture and its colour token. The list of contacts, the icon grid
// of the form and the preview all draw from here, so they cannot disagree.
//
// The names are the values the server accepts (EmergencyContact.ICON_CHOICES in
// backend/api/models.py). docs/MOBILE_CONTACT_ICONS.md is the same list for the
// mobile app, which must match it and fall back to "other" for a name it does
// not know. The colours are the `--th-contact-*` tokens in Tourism_index.css
// (see THEME_TOKENS.md); there is no colour written in a component.
import {
  MdOutlineAccountBalance,
  MdOutlineAnchor,
  MdOutlineBolt,
  MdOutlineDirectionsBoat,
  MdOutlineEmergency,
  MdOutlineLocalFireDepartment,
  MdOutlineLocalHospital,
  MdOutlineLocalPolice,
  MdOutlineMedicalServices,
  MdOutlinePhone,
  MdOutlineSupportAgent,
  MdOutlineWaterDrop,
} from "react-icons/md";

export const FALLBACK_ICON = "other";

// `textToken` (only where the icon colour is too pale to read as small text on
// white: below 4.5:1) is the darker colour of the NUMBER, the same as the app's
// textColor. Without it the number takes the icon's colour.
// Help desk takes the theme's own deep colour, as it does in the app
// (brand.deep), so it follows the system colour like the rest of the shell.
export const CONTACT_ICONS = [
  { name: "rescue", label: "Rescue", Icon: MdOutlineLocalHospital, token: "--th-contact-rescue", textToken: "--th-contact-text-rescue" },
  { name: "police", label: "Police", Icon: MdOutlineLocalPolice, token: "--th-contact-police" },
  { name: "coast_guard", label: "Coast Guard", Icon: MdOutlineDirectionsBoat, token: "--th-contact-coast-guard", textToken: "--th-contact-text-coast-guard" },
  { name: "fire", label: "Fire", Icon: MdOutlineLocalFireDepartment, token: "--th-contact-fire", textToken: "--th-contact-text-fire" },
  { name: "hospital", label: "Hospital", Icon: MdOutlineMedicalServices, token: "--th-contact-hospital" },
  { name: "ambulance", label: "Ambulance", Icon: MdOutlineEmergency, token: "--th-contact-ambulance" },
  { name: "help_desk", label: "Help desk", Icon: MdOutlineSupportAgent, token: "--th-primary-deep" },
  { name: "lgu_office", label: "LGU office", Icon: MdOutlineAccountBalance, token: "--th-contact-lgu-office" },
  { name: "power", label: "Power", Icon: MdOutlineBolt, token: "--th-contact-power", textToken: "--th-contact-text-power" },
  { name: "water", label: "Water", Icon: MdOutlineWaterDrop, token: "--th-contact-water", textToken: "--th-contact-text-water" },
  { name: "port", label: "Port", Icon: MdOutlineAnchor, token: "--th-contact-port", textToken: "--th-contact-text-port" },
  { name: FALLBACK_ICON, label: "Other", Icon: MdOutlinePhone, token: "--th-contact-other" },
];

// A name the page does not know (the server may one day send a newer one, or
// nothing) is shown as "other": never blank, never an error.
export function contactIcon(name) {
  return CONTACT_ICONS.find((item) => item.name === name) || CONTACT_ICONS.find((item) => item.name === FALLBACK_ICON);
}

// The colour as a custom property on the element: the stylesheet does the rest.
export function contactStyle(name) {
  const { token, textToken } = contactIcon(name);
  return textToken
    ? { "--contact-color": `var(${token})`, "--contact-text": `var(${textToken})` }
    : { "--contact-color": `var(${token})` };
}

// The picture in its pale box, as the app draws it (colour on a 10% tint).
export function ContactIcon({ name }) {
  const { Icon, name: shown } = contactIcon(name);
  return (
    <span className="contact-icon" data-icon={shown} style={contactStyle(name)}>
      <Icon aria-hidden="true" />
    </span>
  );
}
