import { useLocation } from "react-router-dom";
import { ReactNode } from "react";

/**
 * Applies a smooth enter animation on every route change by re-keying the
 * wrapper on the pathname (so the `page-enter` animation re-runs). Enter-only
 * (no exit animation) keeps it dependency-free and jank-free. Honors
 * prefers-reduced-motion via the CSS media query in index.css.
 */
const PageTransition = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter">
      {children}
    </div>
  );
};

export default PageTransition;
