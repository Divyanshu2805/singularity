/**
 * The application shell: the providers every page needs, and the route table.
 *
 * Handles: the query client, the tooltip context and the two toast outlets; the top-level error boundary that keeps a
 * render failure from blanking the page; the routes themselves; and making the browser's Back and Forward buttons
 * between the landing page and the sign-in pages run the page slide (lib/page-slide). That listener is installed when
 * this module loads, before the router mounts and adds its own, because it has to see each popstate first.
 *
 * Every page but the entry redirect is loaded on demand. Eagerly importing them put the code editor, the charting
 * library and the auth pages in one bundle that every visitor downloaded before seeing anything, including someone
 * who only wanted the pricing page. While a page's code arrives the app shows its own night (AppLoading) - the sky
 * with the horizon mark building itself - rather than a blank screen.
 *
 * One route is registered in development only (import.meta.env.DEV), so a production build neither serves nor
 * bundles it: /genesis, the landing page being rebuilt as one continuous scene (pages/Genesis.tsx), there to be
 * reviewed section by section until the owner approves it to replace the page at the root (pages/Home.tsx, shown
 * by Index).
 *
 * /p/:slug is the one public page: the read-only view of a shared app's code, open to anyone with the link and
 * without signing in (pages/SharedApp).
 *
 * Route order matters: the catch-all must stay last, or it would swallow everything after it.
 */
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLoading } from "@/components/app/AppLoading";
import { slideOnHistoryMoves } from "@/lib/page-slide";
import Index from "./pages/Index";

slideOnHistoryMoves();

const AuthPage = lazy(() => import("./pages/AuthPage"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const AuthAction = lazy(() => import("./pages/AuthAction"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const ProjectView = lazy(() => import("./pages/ProjectView").then((m) => ({ default: m.ProjectView })));
const ProjectsDashboard = lazy(() => import("./pages/ProjectsDashboard").then((m) => ({ default: m.ProjectsDashboard })));
const AllProjects = lazy(() => import("./pages/AllProjects").then((m) => ({ default: m.AllProjects })));
const Pricing = lazy(() => import("./pages/Pricing").then((m) => ({ default: m.Pricing })));
const BillingSettings = lazy(() => import("./pages/BillingSettings").then((m) => ({ default: m.BillingSettings })));
const UsageInsights = lazy(() => import("./pages/UsageInsights").then((m) => ({ default: m.UsageInsights })));
const SharedApp = lazy(() => import("./pages/SharedApp").then((m) => ({ default: m.SharedApp })));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacy = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Terms })));
const Genesis = import.meta.env.DEV ? lazy(() => import("./pages/Genesis")) : null;

const queryClient = new QueryClient();

const RouteFallback = () => <AppLoading />;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/signup" element={<AuthPage />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/auth/action" element={<AuthAction />} />
              <Route path="/projects" element={<ProjectsDashboard />} />
              <Route path="/projects/all" element={<AllProjects />} />
              <Route path="/projects/:projectId" element={<ProjectView />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/settings/billing" element={<BillingSettings />} />
              <Route path="/usage" element={<UsageInsights />} />
              <Route path="/settings/security" element={<SecuritySettings />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/p/:slug" element={<SharedApp />} />
              {Genesis && <Route path="/genesis" element={<Genesis />} />}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
