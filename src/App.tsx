import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { hasCompletedOnboarding, hasSelectedRole } from "@/utils/userProfile";
import PageLoader from "@/components/PageLoader";
import PageTransition from "@/components/PageTransition";

// Route-based code splitting: each page is its own chunk so the initial bundle
// stays small and the camera/MediaPipe-heavy pages only load on demand.
const RoleSelection = lazy(() => import("./pages/RoleSelection"));
const Welcome = lazy(() => import("./pages/Welcome"));
const HomeDashboard = lazy(() => import("./pages/HomeDashboard"));
const DoctorDashboard = lazy(() => import("./pages/DoctorDashboard"));
const CaregiverDashboard = lazy(() => import("./pages/CaregiverDashboard"));
const VoiceTest = lazy(() => import("./pages/VoiceTest"));
const FaceTest = lazy(() => import("./pages/FaceTest"));
const FingerTapTest = lazy(() => import("./pages/FingerTapTest"));
const DrawingTest = lazy(() => import("./pages/DrawingTest"));
const History = lazy(() => import("./pages/History"));
const Insights = lazy(() => import("./pages/Insights"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SleepMonitoring = lazy(() => import("./pages/SleepMonitoring"));
const PatientNetwork = lazy(() => import("./pages/PatientNetwork"));
const MedicationTracking = lazy(() => import("./pages/MedicationTracking"));
const WalkingTest = lazy(() => import("./pages/WalkingTest"));
const LSVTBigTest = lazy(() => import("./pages/LSVTBigTest"));

const queryClient = new QueryClient();

// Role Selection Route - Check if role is selected
const RoleSelectionRoute = ({ children }: { children: React.ReactNode }) => {
  const hasRole = hasSelectedRole();
  const hasOnboarded = hasCompletedOnboarding();

  if (hasRole && hasOnboarded) return <Navigate to="/home" replace />;
  if (hasRole) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
};

// Welcome Route - Check if name is entered
const WelcomeRoute = ({ children }: { children: React.ReactNode }) => {
  const hasRole = hasSelectedRole();
  const hasOnboarded = hasCompletedOnboarding();

  if (!hasRole) return <Navigate to="/" replace />;
  if (hasOnboarded) return <Navigate to="/home" replace />;
  return <>{children}</>;
};

// Protected Route Component - For User Dashboard
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  if (!hasCompletedOnboarding()) return <Navigate to="/" replace />;
  return <>{children}</>;
};

// Testing Route - Allows access to testing dashboards only if onboarded
const TestingRoute = ({ children }: { children: React.ReactNode }) => {
  if (!hasCompletedOnboarding()) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <PageTransition>
            <Routes>
              <Route path="/" element={<RoleSelectionRoute><RoleSelection /></RoleSelectionRoute>} />
              <Route path="/welcome" element={<WelcomeRoute><Welcome /></WelcomeRoute>} />

              {/* User Routes */}
              <Route path="/home" element={<ProtectedRoute><HomeDashboard /></ProtectedRoute>} />
              <Route path="/voice-test" element={<ProtectedRoute><VoiceTest /></ProtectedRoute>} />
              <Route path="/face-test" element={<ProtectedRoute><FaceTest /></ProtectedRoute>} />
              <Route path="/finger-tap" element={<ProtectedRoute><FingerTapTest /></ProtectedRoute>} />
              <Route path="/drawing-test" element={<ProtectedRoute><DrawingTest /></ProtectedRoute>} />
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
          </PageTransition>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
