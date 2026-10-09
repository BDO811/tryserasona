import { Link, useLocation } from "react-router-dom";
import { asset } from "@/lib/asset";
import { useAuth } from "@/context/AuthContext";

/**
 * The site chrome. Logo home, pricing, and the one action that changes with who
 * is looking: sign in, or go to your account.
 *
 * This exists because until now there was no way to reach the login or pricing
 * pages from anywhere in the product. They were built, routed and unreachable —
 * the homepage had a logo and a single "Try Serasona" button, so the only path
 * to an account was typing the URL. A signup funnel you cannot click into is not
 * a funnel.
 *
 * Deliberately not on the capture or results screens. Once someone is recording
 * or reading their result, navigation out of it is a distraction, and those
 * screens carry their own exits.
 */

interface SiteHeaderProps {
  /** Lay it over a full-bleed hero instead of taking its own band of space. */
  overlay?: boolean;
}

export const SiteHeader = ({ overlay = false }: SiteHeaderProps) => {
  const { user, subscription } = useAuth();
  const { pathname } = useLocation();

  const hasPlan = subscription.planId !== "free";
  // On the auth pages themselves the generic actions are noise at best and a
  // link to the current page at worst, and they drop any ?next the funnel is
  // carrying. Those pages cross-link to each other already.
  const onAuthPage = ["/login", "/signup", "/reset-password"].includes(pathname);
  // whitespace-nowrap is load-bearing: at 375px "Log in" wraps to two lines and
  // the bar grows to twice its height.
  const link =
    "font-mono text-[11px] uppercase tracking-[0.14em] md:tracking-[0.18em] whitespace-nowrap transition-colors";

  return (
    <header
      className={
        overlay
          ? "absolute inset-x-0 top-0 z-30 px-5 pt-4 md:px-10"
          : "sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur px-5 md:px-10"
      }
    >
      <nav className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-2 py-3 md:px-4">
        <Link to="/" aria-label="Serasona home" className="shrink-0">
          <img
            src={asset("brand/serasona-logo-full.svg")}
            alt="Serasona"
            className="h-6 w-auto md:h-8"
          />
        </Link>

        <div className="flex items-center gap-4 sm:gap-5 md:gap-7">
          {/* Someone already paying does not need to be sold to.
              Hidden on the narrowest screens, where four items do not fit and
              the hero's own call to action already reaches pricing. */}
          {!hasPlan && pathname !== "/pricing" && (
            <Link
              to="/pricing"
              className={`${link} hidden sm:inline text-muted-foreground hover:text-foreground`}
            >
              Plans
            </Link>
          )}

          {user ? (
            <Link to="/account" className={`${link} text-foreground hover:text-primary`}>
              Account
            </Link>
          ) : onAuthPage ? null : (
            <>
              <Link to="/login" className={`${link} text-muted-foreground hover:text-foreground`}>
                Log in
              </Link>
              <Link
                to="/signup"
                className={`${link} rounded-full bg-primary px-3.5 py-2 md:px-4 text-primary-foreground hover:opacity-90`}
              >
                Start
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};

export default SiteHeader;
