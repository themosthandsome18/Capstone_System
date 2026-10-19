import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function PublicReportingMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.capstoneReportingMetadata?.apply(pathname);
    return () => window.capstoneReportingMetadata?.apply(null);
  }, [pathname]);
  return null;
}
