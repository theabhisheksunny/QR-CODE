import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';
import { Toaster } from 'react-hot-toast';

export const Layout = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
      <Toaster
        position="top-right"
        toastOptions={{ className: 'dark:bg-slate-800 dark:text-white' }}
      />
    </div>
  );
};
