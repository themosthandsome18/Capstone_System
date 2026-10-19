// The OLD address of the Emergency Hotlines page. The hotlines are now a tab of the Mobile App Content page
// (mobileContentAccess.js); this address stays as a redirect to that tab, so a bookmark or a link that was saved before still
// works, and it keeps the same rule: only the system admin.
import { MOBILE_CONTENT_ROLES } from "./mobileContentAccess";

export const HOTLINES_PATH = "/hotlines";
export const HOTLINES_ROLES = MOBILE_CONTENT_ROLES;
