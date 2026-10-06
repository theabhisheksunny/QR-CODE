import { Users } from 'lucide-react';
import { RoomParticipant } from '../types';

interface ParticipantListProps {
  participants: RoomParticipant[];
  onlineCount: number;
}

export const ParticipantList = ({ participants, onlineCount }: ParticipantListProps) => {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-indigo-500" />
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Connected Devices: {onlineCount}
        </h3>
      </div>
      <ul className="flex flex-col gap-2">
        {participants.length === 0 && (
          <li className="text-sm text-gray-400">No one has joined yet.</li>
        )}
        {participants.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                p.status === 'ONLINE' ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'
              }`}
              title={p.status}
            />
            <span className="text-gray-800 dark:text-gray-200">{p.displayName}</span>
            {p.status === 'OFFLINE' && (
              <span className="text-xs text-gray-400">(offline)</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
