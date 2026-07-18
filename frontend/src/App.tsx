import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import ForgotPassword from "./pages/ForgotPassword";
import AuthAction from "./pages/AuthAction";
import SecuritySettings from "./pages/SecuritySettings";
import { ProjectView } from "./pages/ProjectView";
import { ProjectsDashboard } from "./pages/ProjectsDashboard";
import { AllProjects } from "./pages/AllProjects";
import { Pricing } from "./pages/Pricing";
import { BillingSettings } from "./pages/BillingSettings";
import { UsageInsights } from "./pages/UsageInsights";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* Same component for both, so switching between them animates instead of swapping pages */}
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          {/* Firebase email links (reset, verify, recover) - the templates' custom action URL in the Firebase console. */}
          <Route path="/auth/action" element={<AuthAction />} />
          <Route path="/projects" element={<ProjectsDashboard />} />
          <Route path="/projects/all" element={<AllProjects />} />
          <Route path="/projects/:projectId" element={<ProjectView />} />
          {/* Public: someone deciding whether to sign up should be able to read the prices first. */}
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/settings/billing" element={<BillingSettings />} />
          <Route path="/usage" element={<UsageInsights />} />
          <Route path="/settings/security" element={<SecuritySettings />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
