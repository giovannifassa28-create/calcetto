'use client';

import React, { useState } from 'react';
import { PlayerProfile, PlayerRole, TeamBalanceResult, MatchRatingSubmission } from '../types';
import { INITIAL_PLAYERS } from '../lib/mockData';
import { balanceTeams } from '../lib/balancer';
import { processMatchRatings, validateRatingsSubmissions } from '../lib/rating-engine';
import { PlayerCardComponent } from '../components/PlayerCard';
import { BottomNav, ActiveTab } from '../components/BottomNav';
import { MatchRatingModal } from '../components/MatchRatingModal';

export default function HomePage() {
  // Utente loggato corrente (Giovanni Rossi)
  const currentUserId = 'user-gio';

  // Stato giocatori & carte
  const [players, setPlayers] = useState<PlayerProfile[]>(INITIAL_PLAYERS);
  const [activeTab, setActiveTab] = useState<ActiveTab>('my-stats');

  // Filtro spogliatoio
  const [roleFilter, setRoleFilter] = useState<'ALL' | PlayerRole>('ALL');

  // Selezione convocati per la partita (default 10 convocati)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    new Set(['user-gio', 'user-marco', 'user-alessandro', 'user-luca', 'user-matteo', 'user-federico', 'user-davide', 'user-simone', 'user-andrea', 'user-gabriele'])
  );

  // Risultato bilanciamento squadre
  const [balanceResult, setBalanceResult] = useState<TeamBalanceResult | null>(null);

  // Risultato partita (punteggio)
  const [scoreA, setScoreA] = useState<number>(7);
  const [scoreB, setScoreB] = useState<number>(5);

  // Modal pagelle
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [ratingSuccessMessage, setRatingSuccessMessage] = useState<string | null>(null);

  // Giocatore corrente
  const myPlayer = players.find((p) => p.id === currentUserId) || players[0];

  // Gestione selezione convocati
  const togglePlayerSelection = (id: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Esecuzione algoritmo di bilanciamento
  const handleBalance = () => {
    const selected = players.filter((p) => selectedPlayerIds.has(p.id));
    if (selected.length < 4 || selected.length % 2 !== 0) {
      alert('Seleziona un numero pari di giocatori (minimo 4, ideale 10 per calcetto 5 vs 5).');
      return;
    }
    const result = balanceTeams(selected);
    setBalanceResult(result);
  };

  // Invio e processamento pagelle peer-to-peer
  const handleRatingSubmit = async (submissions: MatchRatingSubmission[]) => {
    // 1. Validazione di sicurezza (impedisce autovoto)
    const check = validateRatingsSubmissions(currentUserId, submissions);
    if (!check.isValid) {
      throw new Error(check.error);
    }

    if (!balanceResult) return;

    // 2. Mappatura squadre per calcolo vittoria
    const playerTeams: Record<string, 'A' | 'B'> = {};
    balanceResult.teamA.players.forEach((p) => (playerTeams[p.id] = 'A'));
    balanceResult.teamB.players.forEach((p) => (playerTeams[p.id] = 'B'));

    const matchPlayers = [...balanceResult.teamA.players, ...balanceResult.teamB.players];

    // 3. Elaborazione pagelle e aggiornamento carte
    const processResult = processMatchRatings({
      matchId: 'match-current',
      players: matchPlayers,
      ratings: submissions,
      teamAWon: scoreA > scoreB,
      teamBWon: scoreB > scoreA,
      playerTeams,
    });

    // 4. Aggiorna stato globale giocatori con nuove carte e statistiche
    setPlayers((prev) =>
      prev.map((p) => {
        const updatedSummary = processResult.summaries.find((s) => s.playerId === p.id);
        if (updatedSummary) {
          return {
            ...p,
            card: updatedSummary.updatedCard,
          };
        }
        return p;
      })
    );

    setRatingSuccessMessage('Pagelle registrate! Le carte sono state aggiornate dinamicamente.');
    setActiveTab('my-stats');
    setTimeout(() => setRatingSuccessMessage(null), 5000);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header Top Bar */}
      <header className="px-5 pt-4 pb-3 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-green-400 flex items-center justify-center font-black text-black text-lg shadow-[0_0_15px_rgba(34,197,94,0.4)]">
            ⚽
          </div>
          <div>
            <h1 className="font-black text-base tracking-wide text-white flex items-center gap-1.5">
              CALCETTO <span className="text-emerald-400 font-mono text-xs px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40">FUT</span>
            </h1>
            <p className="text-[11px] text-zinc-400">Mercoledì Ore 21:00 • Campo 2</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-2.5 py-1">
          <div className="w-5 h-5 rounded-full bg-emerald-500 text-black text-[11px] font-black flex items-center justify-center">
            {myPlayer.fullName.charAt(0)}
          </div>
          <span className="text-xs font-bold text-zinc-200">{myPlayer.nickname || myPlayer.fullName}</span>
        </div>
      </header>

      {/* Alert Notifica Aggiornamento Pagelle */}
      {ratingSuccessMessage && (
        <div className="mx-4 mt-3 p-3 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-bold text-center animate-bounce">
          ⚡ {ratingSuccessMessage}
        </div>
      )}

      {/* Main Tab Views */}
      <main className="flex-1 p-4 space-y-4">
        
        {/* ================= TAB 1: LA MIA CARTA ================= */}
        {activeTab === 'my-stats' && (
          <div className="space-y-4">
            {/* Banner Regola d'oro */}
            <div className="bg-gradient-to-r from-emerald-950/60 to-zinc-900 border border-emerald-500/40 rounded-2xl p-3.5 flex items-start gap-3">
              <span className="text-emerald-400 text-xl font-bold">🛡️</span>
              <div className="text-xs">
                <strong className="text-emerald-300 block font-bold mb-0.5">Regola d'Oro Attiva:</strong>
                <span className="text-zinc-300">
                  Non puoi modificare la tua carta. I tuoi attributi salgono o scendono solo in base alle pagelle dei compagni.
                </span>
              </div>
            </div>

            {/* Carta del Giocatore (FUT Component) */}
            <div className="flex justify-center py-1">
              <PlayerCardComponent player={myPlayer} size="md" />
            </div>

            {/* Riepilogo Rapido Statistiche */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-center">
                <span className="text-xs text-zinc-400 font-semibold block">Partite</span>
                <span className="text-xl font-black text-white">{myPlayer.card.matchesPlayed}</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-center">
                <span className="text-xs text-zinc-400 font-semibold block">Vittorie</span>
                <span className="text-xl font-black text-emerald-400">
                  {myPlayer.card.matchesWon} ({myPlayer.card.matchesPlayed > 0 ? Math.round((myPlayer.card.matchesWon / myPlayer.card.matchesPlayed) * 100) : 0}%)
                </span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-center">
                <span className="text-xs text-zinc-400 font-semibold block">MVP Awards</span>
                <span className="text-xl font-black text-amber-400">{myPlayer.card.mvpAwards} 🏆</span>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: SPOGLIATOIO (TUTTE LE CARTE) ================= */}
        {activeTab === 'locker-room' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-white uppercase tracking-wider">Tutte le Carte ({players.length})</h2>
              <span className="text-xs font-mono text-emerald-400">Spogliatoio Ufficiale</span>
            </div>

            {/* Filtri per Ruolo */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {(['ALL', 'ATTACCANTE', 'DIFENSORE', 'PORTIERE', 'UNIVERSALE'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => setRoleFilter(role)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    roleFilter === role
                      ? 'bg-emerald-500 text-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  {role === 'ALL' ? 'Tutti' : role.slice(0, 3)}
                </button>
              ))}
            </div>

            {/* Grid Carte Giocatori */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {players
                .filter((p) => roleFilter === 'ALL' || p.card.preferredPosition === roleFilter)
                .map((player) => (
                  <div key={player.id} className="flex justify-center">
                    <PlayerCardComponent player={player} size="sm" />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ================= TAB 3: PARTITA (TEAM GENERATOR & PAGELLE) ================= */}
        {activeTab === 'match' && (
          <div className="space-y-4">
            {/* Step 1: Convocazioni */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-white">Convocazioni Partita</h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40">
                  {selectedPlayerIds.size} Selezionati
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Seleziona i presenti per oggi. L'algoritmo bilancerà ruoli e overall minimizzando le disparità.
              </p>

              {/* Checklist convocati */}
              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {players.map((p) => {
                  const isChecked = selectedPlayerIds.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all ${
                        isChecked ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-950/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePlayerSelection(p.id)}
                          className="w-4 h-4 accent-emerald-500 rounded"
                        />
                        <span className="text-xs font-bold text-white">{p.nickname || p.fullName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        <span className="text-zinc-500">{p.card.preferredPosition.slice(0, 3)}</span>
                        <span className="font-bold text-emerald-400 bg-zinc-900 px-1.5 py-0.5 rounded">
                          {p.card.overall}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              <button
                onClick={handleBalance}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-black font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all"
              >
                ⚡ Bilancia Squadre & Predici Vittoria
              </button>
            </div>

            {/* Step 2: Squadre Generate e Predizione Vittoria */}
            {balanceResult && (
              <div className="space-y-4">
                {/* Visualizzatore Probabilità di Vittoria */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                    <span className="text-emerald-400">Squadra Verde</span>
                    <span className="text-zinc-500 font-mono text-[11px]">PREDIZIONE VITTORIA</span>
                    <span className="text-sky-400">Squadra Blu</span>
                  </div>

                  <div className="space-y-1">
                    <div className="w-full h-3 rounded-full overflow-hidden bg-zinc-800 flex">
                      <div
                        className="bg-emerald-500 transition-all duration-700"
                        style={{ width: `${balanceResult.winProbabilityA}%` }}
                      />
                      <div
                        className="bg-sky-500 transition-all duration-700"
                        style={{ width: `${balanceResult.winProbabilityB}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs font-black">
                      <span className="text-emerald-400">{balanceResult.winProbabilityA}%</span>
                      <span className="text-[10px] text-zinc-400 font-normal bg-zinc-800 px-2 py-0.5 rounded">
                        Equità {balanceResult.balanceFairness}%
                      </span>
                      <span className="text-sky-400">{balanceResult.winProbabilityB}%</span>
                    </div>
                  </div>
                </div>

                {/* Formazioni Squadra A e Squadra B */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-zinc-950 border border-emerald-500/40 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                      <span className="font-black text-xs text-emerald-400 uppercase">Verdi</span>
                      <span className="text-xs font-mono font-bold text-white bg-zinc-900 px-1.5 py-0.5 rounded">
                        OVR {balanceResult.teamA.averageOverall}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      {balanceResult.teamA.players.map((p) => (
                        <div key={p.id} className="flex justify-between p-1.5 rounded-lg bg-zinc-900">
                          <span className="font-bold text-zinc-200">{p.nickname || p.fullName}</span>
                          <span className="font-mono text-emerald-400 font-bold">{p.card.overall}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-zinc-950 border border-sky-500/40 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                      <span className="font-black text-xs text-sky-400 uppercase">Blu</span>
                      <span className="text-xs font-mono font-bold text-white bg-zinc-900 px-1.5 py-0.5 rounded">
                        OVR {balanceResult.teamB.averageOverall}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      {balanceResult.teamB.players.map((p) => (
                        <div key={p.id} className="flex justify-between p-1.5 rounded-lg bg-zinc-900">
                          <span className="font-bold text-zinc-200">{p.nickname || p.fullName}</span>
                          <span className="font-mono text-sky-400 font-bold">{p.card.overall}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Inserimento Risultato & Votazione Pagelle */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-black uppercase text-zinc-300 text-center">
                    Risultato Finale del Match
                  </h4>
                  <div className="flex items-center justify-center gap-4">
                    <div className="text-center">
                      <span className="text-[11px] text-emerald-400 font-bold block mb-1">Verdi</span>
                      <input
                        type="number"
                        min="0"
                        value={scoreA}
                        onChange={(e) => setScoreA(parseInt(e.target.value) || 0)}
                        className="w-16 h-12 text-center text-2xl font-black bg-zinc-950 border border-emerald-500/50 rounded-xl text-white"
                      />
                    </div>
                    <span className="text-xl font-black text-zinc-600">-</span>
                    <div className="text-center">
                      <span className="text-[11px] text-sky-400 font-bold block mb-1">Blu</span>
                      <input
                        type="number"
                        min="0"
                        value={scoreB}
                        onChange={(e) => setScoreB(parseInt(e.target.value) || 0)}
                        className="w-16 h-12 text-center text-2xl font-black bg-zinc-950 border border-sky-500/50 rounded-xl text-white"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setIsRatingModalOpen(true)}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-xs uppercase tracking-wider shadow-lg transition-all"
                  >
                    ⭐ Salva Risultato & Vota Pagelle
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: STORICO & CLASSIFICA ================= */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-black text-sm text-white flex items-center gap-1.5">
                  <span>🏆</span> Classifica Generale Overall
                </h3>
                <span className="text-[11px] text-zinc-500">Stagione Attiva</span>
              </div>

              <div className="space-y-1.5 text-xs">
                {[...players]
                  .sort((a, b) => b.card.overall - a.card.overall)
                  .map((player, idx) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-zinc-950 border border-zinc-800/80"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 font-bold text-center text-xs text-amber-400">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
                        </span>
                        <div>
                          <strong className="text-white text-xs block">{player.nickname || player.fullName}</strong>
                          <span className="text-[10px] text-zinc-500">
                            {player.card.preferredPosition} • {player.card.matchesWon} Vittorie • {player.card.mvpAwards} MVP
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                            player.card.tier === 'ORO'
                              ? 'bg-amber-500 text-black'
                              : player.card.tier === 'ARGENTO'
                              ? 'bg-slate-300 text-black'
                              : 'bg-amber-900 text-amber-200'
                          }`}
                        >
                          {player.card.tier}
                        </span>
                        <span className="font-black text-white text-sm font-mono">{player.card.overall}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Modal Pagelle Peer-to-Peer (Con esclusione autovoto) */}
      {isRatingModalOpen && balanceResult && (
        <MatchRatingModal
          currentUserId={currentUserId}
          matchId="match-current"
          players={[...balanceResult.teamA.players, ...balanceResult.teamB.players]}
          onSubmitRatings={handleRatingSubmit}
          onClose={() => setIsRatingModalOpen(false)}
        />
      )}

      {/* Bottom Bar Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
