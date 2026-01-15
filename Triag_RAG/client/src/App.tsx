import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/Home";
import Assessment from "@/pages/Assessment";
import AssessmentResult from "@/pages/AssessmentResult";
import ClinicianDashboard from "@/pages/ClinicianDashboard";
import ClinicianCaseView from "@/pages/ClinicianCaseView";
import AdminDocs from "@/pages/AdminDocs";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/assessment" component={Assessment} />
      <Route path="/assessment/result" component={AssessmentResult} />
      <Route path="/clinician" component={ClinicianDashboard} />
      <Route path="/clinician/submission/:id" component={ClinicianCaseView} />
      <Route path="/admin" component={AdminDocs} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
