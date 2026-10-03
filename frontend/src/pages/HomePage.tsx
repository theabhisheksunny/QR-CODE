import { useNavigate } from 'react-router-dom';
import { QrCode, Upload, ArrowRight } from 'lucide-react';
import { NetworkStatusBar } from '../components/NetworkStatusBar';

export const HomePage = () => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <div className="text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Universal QR Generator</h1>
        <p className="mt-3 text-gray-500 dark:text-gray-400 text-lg">Generate QR codes instantly. Share files between devices.</p>
      </div>
      <NetworkStatusBar />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        <button
          onClick={() => navigate('/text')}
          className="group bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-8 text-left transition-all shadow-sm hover:shadow-md"
        >
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mb-4">
            <QrCode className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Text / Value</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400 text-sm">Generate a QR code from text, URL, number, JSON, email, phone, or any string.</p>
          <div className="mt-4 flex items-center gap-1 text-indigo-600 dark:text-indigo-400 text-sm font-medium">
            Get started <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
        <button
          onClick={() => navigate('/file')}
          className="group bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-8 text-left transition-all shadow-sm hover:shadow-md"
        >
          <div className="w-12 h-12 bg-violet-50 dark:bg-violet-900/30 rounded-xl flex items-center justify-center mb-4">
            <Upload className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">File Share</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400 text-sm">Upload any file and share it between devices with a QR code. Works with PDFs, images, documents, and more.</p>
          <div className="mt-4 flex items-center gap-1 text-violet-600 dark:text-violet-400 text-sm font-medium">
            Share a file <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>
    </div>
  );
};
