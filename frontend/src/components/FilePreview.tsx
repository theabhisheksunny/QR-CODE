import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { getMimeCategory } from '../utils/format';

interface FilePreviewProps {
  token: string;
  contentType: string;
  fileName: string;
}

export const FilePreview = ({ token, contentType, fileName }: FilePreviewProps) => {
  const category = getMimeCategory(contentType);
  const fileUrl = `/api/files/share/${token}`;
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    if (category === 'text') {
      fetch(fileUrl)
        .then((r) => r.text())
        .then(setTextContent)
        .catch(() => setTextContent('Could not load text content'));
    }
  }, [fileUrl, category]);

  if (category === 'image') {
    return <img src={fileUrl} alt={fileName} className="max-w-full max-h-96 rounded-lg shadow-md mx-auto" />;
  }
  if (category === 'video') {
    return <video src={fileUrl} controls className="max-w-full rounded-lg shadow-md mx-auto" />;
  }
  if (category === 'audio') {
    return <audio src={fileUrl} controls className="w-full" />;
  }
  if (category === 'pdf') {
    return (
      <iframe
        src={fileUrl}
        title={fileName}
        className="w-full h-96 rounded-lg border border-gray-200 dark:border-slate-700"
      />
    );
  }
  if (category === 'text' && textContent !== null) {
    return (
      <pre className="w-full max-h-64 overflow-auto p-4 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
        {textContent}
      </pre>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-gray-500 dark:text-gray-400">
      <FileText className="w-12 h-12" />
      <p className="text-sm">Preview unavailable for this file type</p>
    </div>
  );
};
