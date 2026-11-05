import React, { useState } from 'react';
import { PlayerProfile, MatchRatingSubmission } from '../types';

interface MatchRatingModalProps {
  currentUserId: string;
  matchId: string;
  players: PlayerProfile[];
  onSubmitRatings: (ratings: MatchRatingSubmission[]) => Promise<void>;
  onClose: () => void;
}

export const MatchRatingModal: React.FC<MatchRatingModalProps> = ({
  currentUserId,
  matchId,
  players,
  onSubmitRatings,
  onClose,
}) => {
  // Filtra automaticamente l'utente loggato: NON PUÒ VOTARE SE STESSO!
  const rateablePlayers = players.filter((p) => p.id !== currentUserId);

  const [ratings, setRatings] = useState<Record<string, { attack: number; defense: number; goalkeeper: number; comment: string }>>(
    () => {
      const init: Record<string, { attack: number; defense: number; goalkeeper: number; comment: string }> = {};
      rateablePlayers.forEach((p) => {
        init[p.id] = { attack: 6.5, defense: 6.5, goalkeeper: 6.5, comment: '' };
      });
      return init;
    }
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStatChange = (
    playerId: string,
    stat: 'attack' | 'defense' | 'goalkeeper',
    val: number
  ) => {
    setRatings((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [stat]: val,
      },
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    const payload: MatchRatingSubmission[] = rateablePlayers.map((p) => ({
      matchId,
      voterId: currentUserId,
      ratedPlayerId: p.id,
      ratingAttack: ratings[p.id].attack,
      ratingDefense: ratings[p.id].defense,
      ratingGoalkeeper: ratings[p.id].goalkeeper,
      comment: ratings[p.id].comment || undefined,
    }));

    try {
      await onSubmitRatings(payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Errore durante il salvataggio dei voti.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header Modal */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span className="text-emerald-400">⚡</span> Pagelle Post-Partita
            </h2>
            <p className="text-xs text-zinc-400">
              Vota le prestazioni dei compagni (il tuo profilo è escluso).
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center font-bold"
          >
            ✕
          </button>
        </div>

        {/* Lista Giocatori da Votare */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {rateablePlayers.map((player) => {
            const currentVotes = ratings[player.id];
            return (
              <div
                key={player.id}
                className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3.5 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-400">
                    {player.fullName.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      {player.nickname || player.fullName}
                    </h4>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {player.card.preferredPosition} • OVR {player.card.overall}
                    </span>
                  </div>
                </div>

                {/* Slider Voto Attacco */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-rose-400 font-semibold">Attacco</span>
                    <span className="font-mono font-bold text-white">
                      {currentVotes.attack.toFixed(1)} / 10
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="10.0"
                    step="0.5"
                    value={currentVotes.attack}
                    onChange={(e) => handleStatChange(player.id, 'attack', parseFloat(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg appearance-none"
                  />
                </div>

                {/* Slider Voto Difesa */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-sky-400 font-semibold">Difesa</span>
                    <span className="font-mono font-bold text-white">
                      {currentVotes.defense.toFixed(1)} / 10
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="10.0"
                    step="0.5"
                    value={currentVotes.defense}
                    onChange={(e) => handleStatChange(player.id, 'defense', parseFloat(e.target.value))}
                    className="w-full accent-sky-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg appearance-none"
                  />
                </div>

                {/* Slider Voto Porta */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-400 font-semibold">Porta</span>
                    <span className="font-mono font-bold text-white">
                      {currentVotes.goalkeeper.toFixed(1)} / 10
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="10.0"
                    step="0.5"
                    value={currentVotes.goalkeeper}
                    onChange={(e) => handleStatChange(player.id, 'goalkeeper', parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg appearance-none"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer con Bottone Salva */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/80">
          {error && <p className="text-rose-400 text-xs mb-2 text-center">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-black font-black text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Salvataggio in corso...' : 'Invia Pagelle Ufficiali ⚽'}
          </button>
        </div>
      </div>
    </div>
  );
};
