import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@x10/shared/runtime';

import { AboutPage } from './pages/AboutPage';
import { BenchPage } from './pages/BenchPage';
import { DockPage } from './pages/DockPage';
import { FlyersPage } from './pages/FlyersPage';
import { ForkPage } from './pages/ForkPage';
import { HomePage } from './pages/HomePage';
import { WriteOffPage } from './pages/WriteOffPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell immersive><HomePage /></AppShell>} />
      <Route path="/dock" element={<AppShell><DockPage /></AppShell>} />
      <Route path="/bench" element={<AppShell><BenchPage /></AppShell>} />
      <Route path="/fork" element={<AppShell><ForkPage /></AppShell>} />
      <Route path="/write-offs" element={<AppShell><WriteOffPage /></AppShell>} />
      <Route path="/flyers" element={<AppShell><FlyersPage /></AppShell>} />
      <Route path="/about" element={<AppShell><AboutPage /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
