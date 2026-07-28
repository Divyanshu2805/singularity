/**
 * The entry route: decides where to send someone.
 *
 * Handles: redirecting to their projects or to sign-in, showing the mark briefly while it decides. Kept eagerly
 * loaded, since it is what the very first paint renders.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatedLogo } from "@/components/VibeCraftLogo";
import { isAuthenticated } from "@/lib/api";

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
