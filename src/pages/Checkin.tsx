import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Index from "@/pages/Index";

/**
 * The signed-in entry point: skips the marketing home, language picker, and
 * triage (an account already carries consent and an identity — see
 * Index.tsx's presetPathway) and opens straight on recording. Finishing or
 * starting over returns to /account instead of the public home screen.
 *
 * Gated on Core+ here rather than only in the UI, since Index itself has no
 * idea this route requires an entitlement.
 */
const Checkin = () => {
  const { isEntitled } = useAuth();

  if (!isEntitled("core")) {
    return <Navigate to="/pricing" replace />;
  }

  return <Index initialState="capture" presetPathway="WELLNESS" exitTo="/account" />;
};

export default Checkin;
