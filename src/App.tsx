import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AssessmentProvider } from "@/context/AssessmentContext";
import Index from "./pages/Index";
import DetailedAnalysisView from "./pages/DetailedAnalysisView";
import LongitudinalView from "./pages/LongitudinalView";
import Dashboard from "./pages/Dashboard";
import ApiDebugView from "./pages/ApiDebugView";
import PanelPreview from "./pages/PanelPreview";
import AnalysisFailed from "./pages/AnalysisFailed";
import RecordingNotSupported from "./pages/RecordingNotSupported";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        // Matches Vite's base, so routes resolve whether the app is served from
        // a domain root or from a GitHub Pages project subpath.
        basename={import.meta.env.BASE_URL}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AssessmentProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/detailed-analysis" element={<DetailedAnalysisView />} />
            <Route path="/history" element={<LongitudinalView />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/api-debug" element={<ApiDebugView />} />
            <Route path="/panel-preview" element={<PanelPreview />} />
            <Route path="/analysis-failed" element={<AnalysisFailed onRestart={() => window.location.href = "/"} />} />
            <Route path="/recording-not-supported" element={<RecordingNotSupported onBack={() => window.location.href = "/"} />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AssessmentProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
