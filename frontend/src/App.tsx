/**
 * The application shell: the providers every page needs, and the route table.
 *
 * Handles: the query client, the tooltip context and the two toast outlets; the top-level error boundary that keeps a
 * render failure from blanking the page; and the routes themselves.
 *
 * Every page but the entry redirect is loaded on demand. Eagerly importing them put the code editor, the charting
 * library and the auth pages in one bundle that every visitor downloaded before seeing anything, including someone
 * who only wanted the pricing page.
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
import Index from "./pages/Index";

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
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const RouteFallback = () => <div className="min-h-screen bg-background" aria-busy="true" />;

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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
