import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useVoiceHistory } from "@/hooks/use-voice-history";
import Index from "@/pages/Index";

/**
 * The signed-in entry point: skips the marketing home, language picker, and
 * triage (an account already carries consent and an identity) and opens
 * straight on recording. Finishing or starting over returns to /account.
 *
 * Entitlement, which is subtler than it looks:
 *
 *   free   one check-in, ever. Pricing sells this as "Try it — one 20-second
 *          check-in, your seven signals, this time only, no history or trend".
 *   core+  unlimited.
 *
 * This used to require Core, which bounced every free account straight to
 * /pricing and made the free tier unreachable despite being sold on the
 * pricing page. Now the gate is an ACCOUNT, and free accounts are stopped by
 * having already used their one rather than by their plan.
 *
 * The count comes from stored history, which is the same record the trend view
 * reads. It is a product gate, not a security boundary: history is append-only
 * per the Firestore rules, but anyone determined could still burn a second
 * check-in by other means. Enforce for real server-side before this costs
 * money at volume.
 */
const Checkin = () => {
  const { user, isEntitled } = useAuth();
  const { loading, sessions } = useVoiceHistory();

  const unlimited = isEntitled("core");

  // Don't decide anything while history is still loading, or a paid-looking
  // free user gets bounced on a race.
  if (!unlimited && loading) return null;

  if (!unlimited && sessions.length > 0) {
    return <Navigate to="/pricing" replace />;
  }

  // ProtectedRoute already guarantees this; belt and braces, since Index itself
  // has no idea the route requires anyone to be signed in.
  if (!user) return <Navigate to="/login" replace />;

  return <Index initialState="capture" presetPathway="WELLNESS" exitTo="/account" />;
};

export default Checkin;
