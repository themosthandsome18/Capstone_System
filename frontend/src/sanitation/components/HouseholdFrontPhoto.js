import FrontPhoto from "./FrontPhoto";
export default function HouseholdFrontPhoto({ householdId, snapshot }) {
  return <FrontPhoto key={householdId} kind="household" recordId={householdId} snapshot={snapshot} />;
}
