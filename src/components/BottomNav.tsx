import React from 'react';

export type ActiveTab = 'my-stats' | 'locker-room' | 'match' | 'leaderboard';

interface BottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: ActiveTab; label: string; icon: string }[] = [
    { id: 'my-stats', label: 'La Mia Carta', icon: '👤' },
    { id: 'locker-room', label: 'Spogliatoio', icon: '👥' },
    { id: 'match', label: 'Partita', icon: '⚽' },
    { id: 'leaderboard', label: 'Classifica', icon: '🏆' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/80 px-2 pb-safe pt-2">
      <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all duration-200 ${
                isActive
                  ? 'text-emerald-400 bg-emerald-500/10 shadow-[0_0_12px_rgba(34,197,94,0.15)] font-bold'
                  : 'text-zinc-500 hover:text-zinc-300 font-medium'
              }`}
            >
              <span className={`text-xl transition-transform ${isActive ? 'scale-110' : ''}`}>
                {tab.icon}
              </span>
              <span className="text-[11px] mt-1 tracking-tight truncate w-full text-center">
                {tab.label}
              </span>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-0.5 shadow-[0_0_6px_#34d399]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
