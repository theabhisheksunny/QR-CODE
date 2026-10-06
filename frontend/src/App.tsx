import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { TextQrPage } from './pages/TextQrPage';
import { FileQrPage } from './pages/FileQrPage';
import { SharePage } from './pages/SharePage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { RoomCreatePage } from './pages/RoomCreatePage';
import { RoomPage } from './pages/RoomPage';
import { ScanPage } from './pages/ScanPage';
import { PastePage } from './pages/PastePage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  useEffect(() => {
    const theme = localStorage.getItem('qrshare_theme');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/text" element={<TextQrPage />} />
          <Route path="/file" element={<FileQrPage />} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="/room" element={<RoomCreatePage />} />
          <Route path="/room/:token" element={<RoomPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/paste" element={<PastePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
