import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { openBillingPortal } from "@/lib/billing-client";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  core: "Core",
  plus: "Plus",
  executive: "Executive",
};

const Account = () => {
  const { user, subscription, isEntitled, logOut } = useAuth();
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
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="px-6 py-16">
      <div className="max-w-md mx-auto space-y-8">
        <h1 className="font-serif text-3xl text-foreground">Account</h1>

        {isEntitled("core") && (
          <div className="rounded-2xl border border-primary bg-card p-6 space-y-3">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-primary">Today</p>
              <p className="text-foreground">Twenty seconds is all it takes.</p>
            </div>
            <div className="flex gap-3">
              <Button asChild className="flex-1">
                <Link to="/checkin">Check in now</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link to="/history">See my trend</Link>
              </Button>
            </div>
            {/* Plus is the tier that buys the phone check-in. Below it this
                would just be a link to a redirect, so it is not shown at all. */}
            {isEntitled("plus") && (
              <Button asChild variant="ghost" className="w-full">
                <Link to="/checkin/phone">Not at a screen? Check in by phone</Link>
              </Button>
            )}
          </div>
        )}

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
    </div>
  );
};

export default Account;
