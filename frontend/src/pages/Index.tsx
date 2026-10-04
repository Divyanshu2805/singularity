/**
 * The entry route: the landing page for visitors, the workspace for everyone signed in.
 *
 * Handles: sending a signed-in person straight to their projects, and showing everyone else the landing page. Kept
 * eagerly loaded, since it is what the very first paint renders - the landing page itself is loaded on demand, so a
 * returning user being redirected never downloads it, and the sky with the horizon mark (AppLoading) shows while it
 * arrives, so the landing page's night is there from the first paint.
 *
 * The landing page is pages/Home.tsx, the content-first page.
 */
import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { AppLoading } from "@/components/app/AppLoading";
import { isAuthenticated } from "@/lib/api";

const Landing = lazy(() => import("./Home"));

const Index = () => {
  if (isAuthenticated()) return <Navigate to="/projects" replace />;

  return (
    <Suspense fallback={<AppLoading />}>
      <Landing />
    </Suspense>
  );
};

export default Index;
