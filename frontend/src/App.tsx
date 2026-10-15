/**
 * The application shell: the providers every page needs, and the route table.
 *
 * Handles: the query client, the tooltip context and the two toast outlets; the whole-page "can't reach Singularity"
 * screen (ServerUnreachable), shown over any page while the server does not answer; the top-level error boundary that keeps a
 * render failure from blanking the page; the routes themselves; and installing the sign-out slide's arrival listener
 * (lib/page-slide) when this module loads, before the first paint.
 *
 * Every page but the entry redirect is loaded on demand. Eagerly importing them put the code editor, the charting
 * library and the auth pages in one bundle that every visitor downloaded before seeing anything, including someone
 * who only wanted the pricing page. While a page's code arrives the app shows its own night (AppLoading) - the sky
 * with the horizon mark building itself - rather than a blank screen.
 *
 * The root (Index) has no landing page: it sends visitors to /login and signed-in people to /projects.
 *
 * /p/:slug is the one public page: the read-only view of a shared app's code, open to anyone with the link and
 * without signing in (pages/SharedApp).
 *
 * /account and /settings/security are old addresses: both now lead to the one Settings page, the second scrolled to its
 * security boxes.
 *
 * Route order matters: the catch-all must stay last, or it would swallow everything after it.
 */
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLoading } from "@/components/app/AppLoading";
import { ServerUnreachable } from "@/components/app/ServerUnreachable";
import { slideInFromLeft } from "@/lib/page-slide";
import Index from "./pages/Index";

slideInFromLeft();

const AuthPage = lazy(() => import("./pages/AuthPage"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const AuthAction = lazy(() => import("./pages/AuthAction"));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const ProjectView = lazy(() => import("./pages/ProjectView").then((m) => ({ default: m.ProjectView })));
const ProjectsDashboard = lazy(() => import("./pages/ProjectsDashboard").then((m) => ({ default: m.ProjectsDashboard })));
const AllProjects = lazy(() => import("./pages/AllProjects").then((m) => ({ default: m.AllProjects })));
const Pricing = lazy(() => import("./pages/Pricing").then((m) => ({ default: m.Pricing })));
const BillingSettings = lazy(() => import("./pages/BillingSettings").then((m) => ({ default: m.BillingSettings })));
const UsageInsights = lazy(() => import("./pages/UsageInsights").then((m) => ({ default: m.UsageInsights })));
const SharedApp = lazy(() => import("./pages/SharedApp").then((m) => ({ default: m.SharedApp })));
const GitHubCallback = lazy(() => import("./pages/GitHubCallback").then((m) => ({ default: m.GitHubCallback })));
const NotFound = lazy(() => import("./pages/NotFound"));
const Legal = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Legal })));

const queryClient = new QueryClient();

const RouteFallback = () => <AppLoading />;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ServerUnreachable />
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
              <Route path="/settings" element={<Settings />} />
              <Route path="/account" element={<Navigate to="/settings" replace />} />
              <Route path="/settings/billing" element={<BillingSettings />} />
              <Route path="/usage" element={<UsageInsights />} />
              <Route path="/settings/security" element={<Navigate to="/settings#security" replace />} />
              <Route path="/privacy" element={<Legal />} />
              <Route path="/terms" element={<Legal />} />
              <Route path="/p/:slug" element={<SharedApp />} />
              <Route path="/github/callback" element={<GitHubCallback />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
