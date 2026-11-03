// Who may use the tourism Administration pages: Settings, Registration Options and Mobile App Content (with the Emergency Hotlines).
// The Tourism Office and the system admin. One list, named by the three access files below, so the sidebar, the route guard and the pages
// cannot disagree. The server says the same in ADMINISTRATION_ROLES (backend/api/permissions.py) and refuses everyone else itself; a test
// reads that file and compares. A role that is not in this list, a role nobody has defined yet included, is out.
export const ADMINISTRATION_ROLES = ["admin", "tourism"];
