import { NavLink } from "react-router-dom";
import { Home, RotateCcw, BarChart3, User } from "lucide-react";

const BottomNav = () => {
  const navItems = [
    { to: "/home", icon: Home, label: "HOME" },
    { to: "/history", icon: RotateCcw, label: "HISTORY" },
    { to: "/insights", icon: BarChart3, label: "INSIGHTS" },
    { to: "/profile", icon: User, label: "PROFILE" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E0E0E0] z-50">
      <div className="max-w-md mx-auto flex justify-around py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1.5 px-3 py-1 transition-colors duration-200 active:scale-90 ${
                isActive ? "text-[#FF8C42]" : "text-[#B8B8B8] hover:text-[#8A8A8A]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`absolute -top-3 h-1 rounded-full bg-[#FF8C42] transition-all duration-300 ${
                    isActive ? "w-6 opacity-100" : "w-0 opacity-0"
                  }`}
                />
                <Icon
                  size={24}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={`transition-transform duration-200 ${isActive ? "scale-110" : "scale-100"}`}
                />
                <span className="text-[10px] font-semibold tracking-wider">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
