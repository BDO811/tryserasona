import { useState, FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/context/AuthContext";
import { startCheckout } from "@/lib/billing-client";
import { toast } from "sonner";
import type { PlanId } from "@/context/AuthContext";
import { SiteHeader } from "@/components/SiteHeader";

const Signup = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Carries the tier a visitor picked on /pricing through signup, so creating
  // an account and starting checkout is one flow instead of two.
  const selectedPlan = searchParams.get("plan") as PlanId | null;
  // Where to land after the account exists. The marketing home sends people
  // here to do a check-in, so dropping them on the dashboard instead loses the
  // one thing they came to do. Only same-site paths are honoured: an absolute
  // URL here would turn signup into an open redirect.
  const nextParam = searchParams.get("next");
  const nextPath = nextParam && /^\/[^/]/.test(nextParam) ? nextParam : "/dashboard";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!consentGiven) {
      toast.error("You'll need to accept the terms to continue.");
      return;
    }
    setSubmitting(true);
    try {
      await signUp(email, password, fullName);
      if (selectedPlan && selectedPlan !== "free") {
        await startCheckout(selectedPlan);
        return; // startCheckout redirects the browser to Stripe
      }
      navigate(nextPath, { replace: true });
    } catch (error) {
      toast.error("Couldn't create that account. Check your details and try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="font-serif text-3xl text-foreground">Create your account</h1>
          <p className="text-sm text-muted-foreground">
            {selectedPlan && selectedPlan !== "free"
              ? "One more step, then on to checkout."
              : "Twenty seconds a day is all it takes."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="fullName">Name</Label>
            <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="consent"
              checked={consentGiven}
              onCheckedChange={(checked) => setConsentGiven(checked === true)}
            />
            <Label htmlFor="consent" className="text-xs font-normal text-muted-foreground leading-relaxed">
              I'm 18+ and agree to the Terms and Privacy Policy. Serasona is a wellness product and does not
              diagnose, treat, prevent or cure any condition.
            </Label>
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to={nextParam ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}
            className="text-foreground underline underline-offset-4"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
    </div>
  );
};

export default Signup;
