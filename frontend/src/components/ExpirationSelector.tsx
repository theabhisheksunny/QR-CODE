import { EXPIRATION_OPTIONS } from '../utils/format';

interface ExpirationSelectorProps {
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}

export const ExpirationSelector = ({ value, onChange, disabled }: ExpirationSelectorProps) => {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">File expires in:</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {EXPIRATION_OPTIONS.map((opt) => (
          <option key={opt.minutes} value={opt.minutes}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
};
