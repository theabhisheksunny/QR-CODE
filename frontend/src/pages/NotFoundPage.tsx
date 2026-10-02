import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export const NotFoundPage = () => (
  <div className="flex flex-col items-center gap-4 py-24 text-center">
    <p className="text-6xl font-bold text-indigo-600">404</p>
    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Page Not Found</h1>
    <p className="text-gray-500 dark:text-gray-400">The page you're looking for doesn't exist.</p>
    <Link to="/" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
      <Home className="w-4 h-4" />
      Go Home
    </Link>
  </div>
);
