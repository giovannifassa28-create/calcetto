import React from 'react';
import { PlayerProfile, CardTier, PlayerRole } from '../types';

interface PlayerCardProps {
  player: PlayerProfile;
  size?: 'sm' | 'md' | 'lg';
  isMvp?: boolean;
  deltaOverall?: number;
  onClick?: () => void;
}

export const PlayerCardComponent: React.FC<PlayerCardProps> = ({
  player,
  size = 'md',
  isMvp = false,
  deltaOverall,
  onClick,
}) => {
  const { card, fullName, nickname, avatarUrl } = player;

  // Stili visivi per Tier (Bronzo, Argento, Oro)
  const tierThemes: Record<CardTier, {
    cardBg: string;
    borderGlow: string;
    badgeBg: string;
    textTier: string;
    accentColor: string;
    ovrText: string;
  }> = {
    BRONZO: {
      cardBg: 'from-amber-950 via-zinc-900 to-stone-950',
      borderGlow: 'border-amber-700/60 shadow-[0_0_18px_rgba(180,83,9,0.25)]',
      badgeBg: 'bg-gradient-to-r from-amber-700 to-amber-900 border-amber-500/40',
      textTier: 'text-amber-300',
      accentColor: '#d97706',
      ovrText: 'text-amber-200',
    },
    ARGENTO: {
      cardBg: 'from-slate-800 via-zinc-900 to-neutral-950',
      borderGlow: 'border-slate-400/60 shadow-[0_0_20px_rgba(148,163,184,0.3)]',
      badgeBg: 'bg-gradient-to-r from-slate-400 to-slate-600 border-slate-300/40',
      textTier: 'text-slate-100',
      accentColor: '#94a3b8',
      ovrText: 'text-slate-100',
    },
    ORO: {
      cardBg: 'from-yellow-950 via-zinc-900 to-stone-950',
      borderGlow: 'border-yellow-400/70 shadow-[0_0_25px_rgba(250,204,21,0.35)]',
      badgeBg: 'bg-gradient-to-r from-yellow-500 to-amber-600 border-yellow-300/50',
      textTier: 'text-yellow-300',
      accentColor: '#eab308',
      ovrText: 'text-yellow-300',
    },
  };

  const theme = tierThemes[card.tier];

  // Abbreviazione Ruolo
  const roleBadges: Record<PlayerRole, { label: string; color: string }> = {
    ATTACCANTE: { label: 'ATT', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
    DIFENSORE: { label: 'DIF', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
    PORTIERE: { label: 'POR', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    UNIVERSALE: { label: 'UNI', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  };

  const roleInfo = roleBadges[card.preferredPosition];

  // Dimensioni responsive
  const sizeClasses = {
    sm: 'w-44 p-3 text-xs',
    md: 'w-64 p-4 text-sm',
    lg: 'w-72 p-5 text-base',
  }[size];

  return (
    <div
      onClick={onClick}
      className={`relative rounded-3xl bg-gradient-to-b ${theme.cardBg} border-2 ${theme.borderGlow} ${sizeClasses} 
        transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(34,197,94,0.3)] 
        cursor-pointer select-none overflow-hidden group`}
    >
      {/* Pattern olografico di sfondo */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/10 via-transparent to-black/60 pointer-events-none" />

      {/* Badge MVP se applicabile */}
      {isMvp && (
        <div className="absolute -top-1 right-5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-black text-[10px] uppercase tracking-widest px-3 py-0.5 rounded-b-md shadow-lg z-20 animate-pulse">
          ★ MVP ★
        </div>
      )}

      {/* Header Carta: Overall + Ruolo */}
      <div className="relative z-10 flex items-start justify-between">
        <div className="flex flex-col items-center">
          <span className={`font-black text-4xl sm:text-5xl tracking-tighter leading-none ${theme.ovrText} drop-shadow-md`}>
            {card.overall}
          </span>
          <span className={`mt-1 font-bold tracking-wider px-2 py-0.5 rounded text-[11px] border ${roleInfo.color}`}>
            {roleInfo.label}
          </span>
          {deltaOverall !== undefined && deltaOverall !== 0 && (
            <span
              className={`text-xs font-black mt-1 ${
                deltaOverall > 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {deltaOverall > 0 ? `+${deltaOverall}` : deltaOverall}
            </span>
          )}
        </div>

        {/* Avatar Giocatore / Foto */}
        <div className="relative">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-emerald-500/40 shadow-inner bg-zinc-950 flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-black text-emerald-400/80">
                {fullName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {/* Badge Tier piccolo */}
          <div className={`absolute -bottom-2 -right-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${theme.badgeBg} ${theme.textTier}`}>
            {card.tier}
          </div>
        </div>
      </div>

      {/* Nome e Nickname */}
      <div className="relative z-10 text-center my-3 border-b border-zinc-800/80 pb-2">
        <h3 className="font-extrabold text-white text-base tracking-wide uppercase truncate">
          {nickname || fullName}
        </h3>
        {nickname && (
          <p className="text-zinc-400 text-[11px] truncate">{fullName}</p>
        )}
      </div>

      {/* Statistiche Principali (ATT, DIF, POR) */}
      <div className="relative z-10 grid grid-cols-3 gap-2 bg-black/40 backdrop-blur-sm rounded-xl p-2.5 border border-zinc-800">
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-zinc-400 tracking-wider">ATT</span>
          <span className="text-lg font-black text-rose-400">{card.attack}</span>
          <div className="w-full bg-zinc-800 h-1 rounded-full mt-1 overflow-hidden">
            <div className="bg-rose-500 h-full rounded-full" style={{ width: `${card.attack}%` }} />
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-zinc-400 tracking-wider">DIF</span>
          <span className="text-lg font-black text-sky-400">{card.defense}</span>
          <div className="w-full bg-zinc-800 h-1 rounded-full mt-1 overflow-hidden">
            <div className="bg-sky-500 h-full rounded-full" style={{ width: `${card.defense}%` }} />
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-zinc-400 tracking-wider">POR</span>
          <span className="text-lg font-black text-emerald-400">{card.goalkeeper}</span>
          <div className="w-full bg-zinc-800 h-1 rounded-full mt-1 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${card.goalkeeper}%` }} />
          </div>
        </div>
      </div>

      {/* Statistiche Partite & Win-rate */}
      <div className="relative z-10 flex items-center justify-between text-[11px] text-zinc-400 mt-3 px-1 font-medium">
        <span>Partite: <strong className="text-white">{card.matchesPlayed}</strong></span>
        <span>
          Win Rate:{' '}
          <strong className="text-emerald-400">
            {card.matchesPlayed > 0
              ? `${Math.round((card.matchesWon / card.matchesPlayed) * 100)}%`
              : '0%'}
          </strong>
        </span>
      </div>
    </div>
  );
};
