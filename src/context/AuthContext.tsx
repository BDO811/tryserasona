import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

const NOT_CONFIGURED_ERROR = new Error("Accounts aren't set up yet. Check back soon.");

// Plan ids match Stripe Price lookup_keys — see docs/SETUP_BILLING.md.
export type PlanId = "free" | "core" | "plus" | "executive";

export interface SubscriptionState {
  planId: PlanId;
  status: "active" | "trialing" | "past_due" | "canceled" | "none";
  currentPeriodEnd: number | null; // unix seconds
  stripeCustomerId: string | null;
}

const DEFAULT_SUBSCRIPTION: SubscriptionState = {
  planId: "free",
  status: "none",
  currentPeriodEnd: null,
  stripeCustomerId: null,
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  subscription: SubscriptionState;
  isEntitled: (plan: Exclude<PlanId, "free">) => boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Plans rank in the order a subscriber would reasonably upgrade through, so
// "isEntitled(core)" also passes for a plus or executive subscriber.
const PLAN_RANK: Record<PlanId, number> = { free: 0, core: 1, plus: 2, executive: 3 };

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionState>(DEFAULT_SUBSCRIPTION);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!user || !db) {
      setSubscription(DEFAULT_SUBSCRIPTION);
      return;
    }
    // The Stripe webhook (gcp-functions/stripe-webhook) is the only writer to
    // this field; the client only ever reads it.
    const unsubscribeDoc = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.data();
      if (!data?.subscription) {
        setSubscription(DEFAULT_SUBSCRIPTION);
        return;
      }
      setSubscription({ ...DEFAULT_SUBSCRIPTION, ...data.subscription });
    });
    return unsubscribeDoc;
  }, [user]);

  const isEntitled = useCallback(
    (plan: Exclude<PlanId, "free">) => {
      const activeStatuses: SubscriptionState["status"][] = ["active", "trialing"];
      return activeStatuses.includes(subscription.status) && PLAN_RANK[subscription.planId] >= PLAN_RANK[plan];
    },
    [subscription]
  );

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!auth || !db) throw NOT_CONFIGURED_ERROR;
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: fullName });
    // No `subscription` field. The Firestore rules forbid the client from
    // writing one at all — that field is the entitlement, and it is only ever
    // set by the stripe-webhook function through the Admin SDK. Writing it here
    // (even as the harmless free/none default) made every signup fail the
    // create rule: the auth user was created, this write was rejected, and the
    // whole signUp threw, leaving an account that could log in but had no
    // profile document and never reached the app.
    //
    // Its absence already means free/none — the snapshot listener above falls
    // back to DEFAULT_SUBSCRIPTION when the field is missing.
    await setDoc(doc(db, "users", credential.user.uid), {
      email,
      fullName,
      createdAt: serverTimestamp(),
    });
  }, []);

  const logIn = useCallback(async (email: string, password: string) => {
    if (!auth) throw NOT_CONFIGURED_ERROR;
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const logOut = useCallback(async () => {
    if (!auth) return;
    await signOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!auth) throw NOT_CONFIGURED_ERROR;
    await sendPasswordResetEmail(auth, email);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, subscription, isEntitled, signUp, logIn, logOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
