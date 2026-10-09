import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * Password reset.
 *
 * The login page has linked to /reset-password since it was written and the
 * route never existed, so anyone who forgot their password landed on the 404
 * page. The auth call itself was already there on the context, unused.
 *
 * The confirmation is deliberately the same whether or not the address has an
 * account. Telling an anonymous visitor "no account with that email" turns the
 * form into a way to test which addresses are registered.
 */
const ResetPassword = () => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch {
      // Same reasoning as above: a failure here must not reveal whether the
      // address exists, so this only ever reports a generic problem.
      setError("Could not send the email just now. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-6">
          {sent ? (
            <>
              <h1 className="font-serif text-3xl text-foreground">Check your email</h1>
              <p className="text-muted-foreground leading-relaxed">
                If there is an account for {email}, a link to set a new password is on its way.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Back to log in</Link>
              </Button>
            </>
          ) : (
            <>
              <div>
                <h1 className="font-serif text-3xl text-foreground">Reset your password</h1>
                <p className="text-muted-foreground mt-2 leading-relaxed">
                  We will email you a link to set a new one.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-xs font-mono uppercase tracking-wider text-muted-foreground"
                  >
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
                  {busy ? "Sending…" : "Send the link"}
                </Button>
              </form>

              <p className="text-sm text-muted-foreground text-center">
                Remembered it?{" "}
                <Link to="/login" className="text-foreground underline underline-offset-4">
                  Log in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
