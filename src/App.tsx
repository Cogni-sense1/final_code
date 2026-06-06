import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { hasCompletedOnboarding, hasSelectedRole, getUserRole } from "@/utils/userProfile";
import RoleSelection from "./pages/RoleSelection";
import Welcome from "./pages/Welcome";
import HomeDashboard from "./pages/HomeDashboard";
import DoctorDashboard from "./pages/DoctorDashboard";
import CaregiverDashboard from "./pages/CaregiverDashboard";
import VoiceTest from "./pages/VoiceTest";
import FaceTest from "./pages/FaceTest";
import FingerTapTest from "./pages/FingerTapTest";
import History from "./pages/History";
import Insights from "./pages/Insights";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import SleepMonitoring from "./pages/SleepMonitoring";
import PatientNetwork from "./pages/PatientNetwork";
import MedicationTracking from "./pages/MedicationTracking";
import WalkingTest from "./pages/WalkingTest";
import LSVTBigTest from "./pages/LSVTBigTest";

const queryClient = new QueryClient();

// Role Selection Route - Check if role is selected
const RoleSelectionRoute = ({ children }: { children: React.ReactNode }) => {
  const hasRole = hasSelectedRole();
  const hasOnboarded = hasCompletedOnboarding();
  
  if (hasRole && hasOnboarded) {
    // Always redirect to home for onboarded users
    return <Navigate to="/home" replace />;
  }
  
  if (hasRole) return <Navigate to="/welcome" replace />;
  
  return <>{children}</>;
};

// Welcome Route - Check if name is entered
const WelcomeRoute = ({ children }: { children: React.ReactNode }) => {
  const hasRole = hasSelectedRole();
  const hasOnboarded = hasCompletedOnboarding();
  
  if (!hasRole) return <Navigate to="/" replace />;
  
  if (hasOnboarded) {
    // Always redirect to home for onboarded users
    return <Navigate to="/home" replace />;
  }
  
  return <>{children}</>;
};

// Protected Route Component - For User Dashboard
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const hasOnboarded = hasCompletedOnboarding();
  
  if (!hasOnboarded) return <Navigate to="/" replace />;
  
  return <>{children}</>;
};

// Testing Route - Allows access to testing dashboards only if user has completed onboarding
const TestingRoute = ({ children }: { children: React.ReactNode }) => {
  const hasOnboarded = hasCompletedOnboarding();
  
  if (!hasOnboarded) return <Navigate to="/" replace />;
  
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RoleSelectionRoute><RoleSelection /></RoleSelectionRoute>} />
          <Route path="/welcome" element={<WelcomeRoute><Welcome /></WelcomeRoute>} />
          
          {/* User Routes */}
          <Route path="/home" element={<ProtectedRoute><HomeDashboard /></ProtectedRoute>} />
          <Route path="/voice-test" element={<ProtectedRoute><VoiceTest /></ProtectedRoute>} />
          <Route path="/face-test" element={<ProtectedRoute><FaceTest /></ProtectedRoute>} />
          <Route path="/finger-tap" element={<ProtectedRoute><FingerTapTest /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
          <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          
          {/* New Feature Routes */}
          <Route path="/sleep-monitoring" element={<ProtectedRoute><SleepMonitoring /></ProtectedRoute>} />
          <Route path="/patient-network" element={<ProtectedRoute><PatientNetwork /></ProtectedRoute>} />
          <Route path="/medication-tracking" element={<ProtectedRoute><MedicationTracking /></ProtectedRoute>} />
          <Route path="/walking-test" element={<ProtectedRoute><WalkingTest /></ProtectedRoute>} />
          <Route path="/lsvt-big" element={<ProtectedRoute><LSVTBigTest /></ProtectedRoute>} />

          {/* Testing Routes - Open access for preview */}
          <Route path="/doctor" element={<TestingRoute><DoctorDashboard /></TestingRoute>} />
          <Route path="/caregiver" element={<TestingRoute><CaregiverDashboard /></TestingRoute>} />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
