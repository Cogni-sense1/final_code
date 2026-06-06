import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setUserRole } from "@/utils/userProfile";

const RoleSelection = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-select user role and navigate to welcome
    setUserRole("user");
    navigate("/welcome", { replace: true });
  }, [navigate]);

  // Show nothing as we're redirecting immediately
  return null;
};

export default RoleSelection;
