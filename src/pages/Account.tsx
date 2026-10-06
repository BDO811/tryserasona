import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { openBillingPortal } from "@/lib/billing-client";
import { toast } from "sonner";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  core: "Core",
  plus: "Plus",
  executive: "Executive",
};

const Account = () => {
  const { user, subscription, logOut } = useAuth();
  const navigate = useNavigate();
  const [openingPortal, setOpeningPortal] = useState(false);

  const handleManageBilling = async () => {
    setOpeningPortal(true);
    try {
      await openBillingPortal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't open billing.");
      setOpeningPortal(false);
    }
  };

  const handleLogOut = async () => {
    await logOut();
    navigate("/", { replace: true });
  };

  const hasActivePlan = subscription.status === "active" || subscription.status === "trialing";

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-md mx-auto space-y-8">
        <h1 className="font-serif text-3xl text-foreground">Account</h1>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Signed in as</p>
          <p className="text-foreground">{user?.email}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Plan</p>
            <p className="text-foreground text-lg">{PLAN_LABEL[subscription.planId] ?? subscription.planId}</p>
            {subscription.currentPeriodEnd && (
              <p className="text-sm text-muted-foreground">
                {subscription.status === "canceled" ? "Ends" : "Renews"}{" "}
                {new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString()}
              </p>
            )}
          </div>
          {hasActivePlan ? (
            <Button variant="outline" className="w-full" onClick={handleManageBilling} disabled={openingPortal}>
              {openingPortal ? "Opening…" : "Manage billing"}
            </Button>
          ) : (
            <Button asChild className="w-full">
              <Link to="/pricing">Choose a plan</Link>
            </Button>
          )}
        </div>

        <Button variant="ghost" className="w-full" onClick={handleLogOut}>
          Log out
        </Button>
      </div>
    </div>
  );
};

export default Account;
