import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { AuthGuard } from '@/components/AuthGuard';
import { Starfield } from '@/components/Starfield';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NewProjectPage } from '@/pages/NewProjectPage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { initAuth } from '@/lib/authStore';

function App() {
  useEffect(() => {
    initAuth();
  }, []);

  return (
    <>
      {/* Starfield global — derrière tout, sur toutes les routes y compris /login. */}
      <Starfield />
      <HashRouter>
        <Routes>
          {/* Route publique : login standalone, pas de Layout. */}
          <Route path="login" element={<LoginPage />} />

          {/* Tout le reste passe par AuthGuard + Layout. */}
          <Route element={<AuthGuard />}>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="projects" element={<Navigate to="/" replace />} />
              <Route path="projects/new" element={<NewProjectPage />} />
              <Route path="projects/:projectId" element={<ProjectDetailPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </>
  );
}

export default App;
