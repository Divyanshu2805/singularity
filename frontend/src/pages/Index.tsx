import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatedLogo } from "@/components/VibeCraftLogo";
import { isAuthenticated } from "@/lib/api";

/** Briefly shown while deciding where to send someone: their projects, or sign-in. */
const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(isAuthenticated() ? "/projects" : "/login", { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <AnimatedLogo />
      <p className="mt-6 text-sm text-muted-foreground">Loading your workspace&hellip;</p>
    </div>
  );
};

export default Index;
