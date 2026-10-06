import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { startCheckout } from "@/lib/billing-client";
import { toast } from "sonner";
import type { PlanId } from "@/context/AuthContext";

interface Tier {
  id: PlanId;
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Try it",
    price: "$0",
    cadence: "one check-in",
    description: "See what your voice says today. No card required.",
    features: ["One 20-second check-in", "Your seven signals, this time only", "No history or trend yet"],
  },
  {
    id: "core",
    name: "Core",
    price: "$29",
    cadence: "/month",
    description: "Daily check-ins in the app, compared to your own 30-day baseline.",
    features: [
      "Unlimited daily check-ins",
      "Your 30-day baseline across all seven signals",
      "Clear / Watch / Strained trend over time",
      "Daylight and Dusk themes",
    ],
    highlighted: true,
  },
  {
    id: "plus",
    name: "Plus",
    price: "$49",
    cadence: "/month",
    description: "Everything in Core, plus Serasona calls you, on any phone.",
    features: [
      "Everything in Core",
      "Serasona calls you weekly, no app required",
      "Works on a landline or flip phone",
      "Priority email delivery of results",
    ],
  },
  {
    id: "executive",
    name: "Executive",
    price: "$149",
    cadence: "/month",
    description: "Daily phone check-ins for people who want the closest watch.",
    features: ["Everything in Plus", "Daily call-in option", "Fastest report delivery", "Priority support"],
  },
];

const Pricing = () => {
  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);

  const handleSelect = async (planId: PlanId) => {
    if (planId === "free") {
      navigate(user ? "/dashboard" : "/signup");
      return;
    }
    if (!user) {
      navigate(`/signup?plan=${planId}`);
      return;
    }
    setLoadingPlan(planId);
    try {
      await startCheckout(planId as Exclude<PlanId, "free">);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start checkout.");
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background px-6 py-16 md:py-24">
      <div className="max-w-5xl mx-auto">
        <div className="text-center space-y-3 mb-12">
          <h1 className="font-serif text-4xl md:text-5xl text-foreground">Choose how you check in</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Every plan compares you to your own baseline, never a population average. Cancel any time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {TIERS.map((tier) => {
            const isCurrentPlan =
              tier.id === "free" ? subscription.status === "none" : subscription.planId === tier.id && subscription.status !== "none";
            return (
              <div
                key={tier.id}
                className={cn(
                  "rounded-2xl border p-6 flex flex-col gap-4 bg-card",
                  tier.highlighted ? "border-primary shadow-[0_0_0_1px_hsl(var(--primary))]" : "border-border"
                )}
              >
                {tier.highlighted && (
                  <span className="text-xs font-mono tracking-wider uppercase text-primary">Most popular</span>
                )}
                <div>
                  <h2 className="font-serif text-2xl text-foreground">{tier.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{tier.description}</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-serif text-3xl text-foreground">{tier.price}</span>
                  <span className="text-sm text-muted-foreground">{tier.cadence}</span>
                </div>
                <ul className="space-y-2 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground/90">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => handleSelect(tier.id)}
                  disabled={loadingPlan === tier.id || isCurrentPlan}
                  variant={tier.highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  {isCurrentPlan ? "Your current plan" : loadingPlan === tier.id ? "Redirecting…" : tier.id === "free" ? "Start free" : "Subscribe"}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10 max-w-md mx-auto">
          Secure checkout via Stripe. Serasona is a wellness product. It is not a medical device and does not
          diagnose, treat, prevent or cure any condition.
        </p>
      </div>
    </div>
  );
};

export default Pricing;
