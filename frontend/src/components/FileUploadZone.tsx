import { useCallback, useState } from 'react';
import { Upload, File } from 'lucide-react';
import { formatFileSize } from '../utils/format';

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export const FileUploadZone = ({ onFileSelect, selectedFile, disabled }: FileUploadZoneProps) => {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
        dragging
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
          : 'border-gray-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {selectedFile ? (
        <div className="flex flex-col items-center gap-2">
          <File className="w-10 h-10 text-indigo-500" />
          <p className="font-medium text-gray-800 dark:text-gray-200">{selectedFile.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatFileSize(selectedFile.size)} • {selectedFile.type || 'Unknown type'}</p>
          <label className="text-sm text-indigo-600 dark:text-indigo-400 underline cursor-pointer">
            Change file
            <input type="file" className="hidden" onChange={handleChange} disabled={disabled} />
          </label>
        </div>
      ) : (
        <label className="cursor-pointer flex flex-col items-center gap-3">
          <Upload className="w-10 h-10 text-gray-400 dark:text-gray-500" />
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-300">Drag &amp; drop a file here</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">or click to browse</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">Any file type • Any size</p>
          <input type="file" className="hidden" onChange={handleChange} disabled={disabled} />
        </label>
      )}
    </div>
  );
};
