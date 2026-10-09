import { useState, FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";

const Login = () => {
  const { logIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Two ways to arrive with a destination: bounced here by ProtectedRoute
  // (which puts it in location state), or sent from signup, which carries it as
  // ?next so an existing user who clicked "Start" still lands on the check-in.
  // Same-site paths only — an absolute URL would make this an open redirect.
  const nextParam = new URLSearchParams(location.search).get("next");
  const safeNext = nextParam && /^\/[^/]/.test(nextParam) ? nextParam : null;
  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? safeNext ?? "/dashboard";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await logIn(email, password);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toast.error("That email and password didn't match. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="font-serif text-3xl text-foreground">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Log in to see your trend.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/reset-password" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot it?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          New to Serasona?{" "}
          <Link
            to={safeNext ? `/signup?next=${encodeURIComponent(safeNext)}` : "/signup"}
            className="text-foreground underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
    </div>
  );
};

export default Login;
