import { Activity, Bell, HeartHandshake, Home as HomeIcon, LineChart, MessageCircleHeart, Pill, UserRound, Users, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import Big from './checks/Big';
import Draw from './checks/Draw';
import Face from './checks/Face';
import Gait from './checks/Gait';
import Tap from './checks/Tap';
import Voice from './checks/Voice';
import { useAuth } from './lib/api';
import Alerts from './pages/Alerts';
import Auth from './pages/Auth';
import Care from './pages/Care';
import Checks from './pages/Checks';
import Community from './pages/Community';
import Companion from './pages/Companion';
import Home from './pages/Home';
import Meds from './pages/Meds';
import Onboarding from './pages/Onboarding';
import PatientDetail from './pages/PatientDetail';
import Patients from './pages/Patients';
import Profile from './pages/Profile';
import Sleep from './pages/Sleep';
import Trends from './pages/Trends';
import { cx, Spinner } from './ui';

const PATIENT_NAV = [
  { to: '/', label: 'Today', icon: HomeIcon },
  { to: '/trends', label: 'Trends', icon: LineChart },
  { to: '/checks', label: 'Checks', icon: Activity },
  { to: '/meds', label: 'Meds', icon: Pill },
  { to: '/companion', label: 'Talk', icon: MessageCircleHeart },
];
const MEMBER_NAV = [
  { to: '/', label: 'Patients', icon: Users },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/community', label: 'Community', icon: HeartHandshake },
  { to: '/profile', label: 'Account', icon: UserRound },
];

function Shell({ children, nav, wide }: { children: ReactNode; nav: typeof PATIENT_NAV; wide: boolean }) {
  const { pathname } = useLocation();
  // Checks run full screen so nothing competes with the instructions.
  const immersive = pathname.startsWith('/check/');
  return (
    <div className="min-h-dvh">
      <main className={cx('mx-auto px-5 pt-6', wide ? 'max-w-5xl' : 'max-w-xl', immersive ? 'pb-8' : 'pb-28')}>{children}</main>
      {!immersive && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 backdrop-blur safe-bottom">
          <div className="mx-auto flex max-w-xl justify-around px-2 pt-2">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'}
                className={({ isActive }) => cx('flex min-w-[4rem] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-semibold transition', isActive ? 'text-brand-deep' : 'text-ink-faint')}>
                {({ isActive }) => (
                  <>
                    <span className={cx('flex h-9 w-14 items-center justify-center rounded-full transition', isActive && 'bg-brand-soft')}><Icon className="h-[22px] w-[22px]" /></span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

export default function App() {
  const { ready, profile, offline } = useAuth();
  const { pathname } = useLocation();

  if (!ready) return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;
  if (offline) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
        <WifiOff className="h-10 w-10 text-ink-faint" />
        <h1 className="text-xl font-extrabold">Can't reach NeuroVoice</h1>
        <p className="text-ink-soft">Check your connection and reload. If you are running locally, start the API with <code className="rounded bg-black/5 px-1.5 py-0.5 text-sm">npm run dev</code>.</p>
      </div>
    );
  }
  if (!profile) return <Auth />;
  if (profile.role === 'patient' && !profile.consent) return <Onboarding />;

  if (profile.role !== 'patient') {
    return (
      <Shell nav={MEMBER_NAV} wide={pathname === '/' || pathname.startsWith('/patients/')}>
        <Routes>
          <Route path="/" element={<Patients />} />
          <Route path="/patients/:id" element={<PatientDetail />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/community" element={<Community />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    );
  }

  return (
    <Shell nav={PATIENT_NAV} wide={false}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/checks" element={<Checks />} />
        <Route path="/check/voice" element={<Voice />} />
        <Route path="/check/face" element={<Face />} />
        <Route path="/check/tap" element={<Tap />} />
        <Route path="/check/draw/:task" element={<Draw />} />
        <Route path="/check/gait" element={<Gait />} />
        <Route path="/check/big" element={<Big />} />
        <Route path="/meds" element={<Meds />} />
        <Route path="/sleep" element={<Sleep />} />
        <Route path="/companion" element={<Companion />} />
        <Route path="/community" element={<Community />} />
        <Route path="/care" element={<Care />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
