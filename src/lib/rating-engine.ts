import { CardTier, MatchRatingSubmission, PlayerCard, PlayerProfile, PlayerRole } from '../types';
import { calculateRoleOverall } from './balancer';

/**
 * Motore di Valutazione Peer-to-Peer & Aggiornamento Dinamico delle Carte
 */

export interface PlayerMatchSummary {
  playerId: string;
  fullName: string;
  receivedVotesCount: number;
  averageAttackVote: number;
  averageDefenseVote: number;
  averageGoalkeeperVote: number;
  overallMatchRating: number; // Media totale della partita (1-10)
  isMvp: boolean;
  statDeltas: {
    attack: number;
    defense: number;
    goalkeeper: number;
    overall: number;
  };
  updatedCard: PlayerCard;
}

export interface PostMatchProcessResult {
  matchId: string;
  mvpPlayerId: string | null;
  summaries: PlayerMatchSummary[];
}

/**
 * Valida un set di voti inviati prima dell'elaborazione
 */
export function validateRatingsSubmissions(
  currentUserId: string,
  submissions: MatchRatingSubmission[]
): { isValid: boolean; error?: string } {
  for (const sub of submissions) {
    // 1. Regola d'oro: Impossibile votare se stessi
    if (sub.voterId === sub.ratedPlayerId || currentUserId === sub.ratedPlayerId) {
      return {
        isValid: false,
        error: `Violazione sicurezza: Non puoi valutare te stesso! (Player: ${sub.ratedPlayerId})`,
      };
    }

    // 2. Controllo coerenza voterId con l'utente autenticato
    if (sub.voterId !== currentUserId) {
      return {
        isValid: false,
        error: 'Identità non valida: voterId non corrisponde all\'utente autenticato.',
      };
    }

    // 3. Range voti tra 1.0 e 10.0
    const ratings = [sub.ratingAttack, sub.ratingDefense, sub.ratingGoalkeeper];
    for (const r of ratings) {
      if (typeof r !== 'number' || isNaN(r) || r < 1.0 || r > 10.0) {
        return {
          isValid: false,
          error: `I voti devono essere compresi tra 1.0 e 10.0. Ricevuto: ${r}`,
        };
      }
    }
  }

  return { isValid: true };
}

/**
 * Calcola il Tier FUT in base all'Overall
 */
export function determineTier(overall: number): CardTier {
  if (overall >= 85) return 'ORO';
  if (overall >= 70) return 'ARGENTO';
  return 'BRONZO';
}

/**
 * Calcola la nuova carta di un giocatore in base ai voti ricevuti nella partita
 * 
 * Formula:
 * Delta = Clamp(K * (VotoMedio - VotoBenchmark) + BonusVittoria, -MaxDelta, +MaxDelta)
 */
export function computeUpdatedCard(
  card: PlayerCard,
  avgAtk: number,
  avgDef: number,
  avgGk: number,
  isWinner: boolean,
  isDraw: boolean
): { updatedCard: PlayerCard; deltas: { attack: number; defense: number; goalkeeper: number; overall: number } } {
  const K_FACTOR = 1.25;      // Sensibilità dell'aggiornamento
  const BENCHMARK = 6.5;      // Sufficienza standard
  const MAX_DELTA = 4.0;      // Massima oscillazione consentita per partita (+4 / -4)
  const WIN_BONUS = isWinner ? 0.5 : isDraw ? 0.0 : -0.2;

  // Calcolo delta grezzo
  const rawDeltaAtk = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, (avgAtk - BENCHMARK) * K_FACTOR + WIN_BONUS));
  const rawDeltaDef = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, (avgDef - BENCHMARK) * K_FACTOR + WIN_BONUS));
  const rawDeltaGk  = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, (avgGk - BENCHMARK) * K_FACTOR + WIN_BONUS));

  // Nuove statistiche (clampate tra 1 e 99)
  const newAtk = Math.max(1, Math.min(99, Math.round(card.attack + rawDeltaAtk)));
  const newDef = Math.max(1, Math.min(99, Math.round(card.defense + rawDeltaDef)));
  const newGk  = Math.max(1, Math.min(99, Math.round(card.goalkeeper + rawDeltaGk)));

  // Ricalcolo Overall basato sul ruolo preferito
  const newOverall = calculateRoleOverall(newAtk, newDef, newGk, card.preferredPosition);
  const newTier = determineTier(newOverall);

  const updatedCard: PlayerCard = {
    ...card,
    attack: newAtk,
    defense: newDef,
    goalkeeper: newGk,
    overall: newOverall,
    tier: newTier,
    matchesPlayed: card.matchesPlayed + 1,
    matchesWon: card.matchesWon + (isWinner ? 1 : 0),
  };

  return {
    updatedCard,
    deltas: {
      attack: newAtk - card.attack,
      defense: newDef - card.defense,
      goalkeeper: newGk - card.goalkeeper,
      overall: newOverall - card.overall,
    },
  };
}

/**
 * Elabora tutte le pagelle della partita e restituisce i resoconti e le carte aggiornate
 */
export function processMatchRatings(params: {
  matchId: string;
  players: PlayerProfile[];
  ratings: MatchRatingSubmission[];
  teamAWon: boolean;
  teamBWon: boolean;
  playerTeams: Record<string, 'A' | 'B'>;
}): PostMatchProcessResult {
  const { matchId, players, ratings, teamAWon, teamBWon, playerTeams } = params;

  // Raggruppa i voti per giocatore votato
  const votesByPlayer: Record<string, MatchRatingSubmission[]> = {};
  for (const player of players) {
    votesByPlayer[player.id] = [];
  }

  for (const r of ratings) {
    if (votesByPlayer[r.ratedPlayerId]) {
      votesByPlayer[r.ratedPlayerId].push(r);
    }
  }

  const summaries: PlayerMatchSummary[] = [];
  let highestMatchRating = -1;
  let mvpPlayerId: string | null = null;

  for (const player of players) {
    const received = votesByPlayer[player.id] || [];
    const team = playerTeams[player.id] || 'A';
    const isWinner = team === 'A' ? teamAWon : teamBWon;
    const isDraw = !teamAWon && !teamBWon;

    let avgAtk = 6.5;
    let avgDef = 6.5;
    let avgGk = 6.5;

    if (received.length > 0) {
      avgAtk = received.reduce((acc, v) => acc + v.ratingAttack, 0) / received.length;
      avgDef = received.reduce((acc, v) => acc + v.ratingDefense, 0) / received.length;
      avgGk = received.reduce((acc, v) => acc + v.ratingGoalkeeper, 0) / received.length;
    }

    // Media pesata della pagella della partita in base al ruolo del giocatore
    const role = player.card.preferredPosition;
    let overallMatchRating = 0;
    if (role === 'ATTACCANTE') overallMatchRating = avgAtk * 0.55 + avgDef * 0.35 + avgGk * 0.10;
    else if (role === 'DIFENSORE') overallMatchRating = avgAtk * 0.30 + avgDef * 0.60 + avgGk * 0.10;
    else if (role === 'PORTIERE') overallMatchRating = avgAtk * 0.10 + avgDef * 0.20 + avgGk * 0.70;
    else overallMatchRating = avgAtk * 0.45 + avgDef * 0.45 + avgGk * 0.10;

    overallMatchRating = Math.round(overallMatchRating * 10) / 10;

    if (overallMatchRating > highestMatchRating) {
      highestMatchRating = overallMatchRating;
      mvpPlayerId = player.id;
    }

    const { updatedCard, deltas } = computeUpdatedCard(
      player.card,
      avgAtk,
      avgDef,
      avgGk,
      isWinner,
      isDraw
    );

    summaries.push({
      playerId: player.id,
      fullName: player.fullName,
      receivedVotesCount: received.length,
      averageAttackVote: Math.round(avgAtk * 10) / 10,
      averageDefenseVote: Math.round(avgDef * 10) / 10,
      averageGoalkeeperVote: Math.round(avgGk * 10) / 10,
      overallMatchRating,
      isMvp: false, // impostato dopo
      statDeltas: deltas,
      updatedCard,
    });
  }

  // Segna l'MVP
  for (const s of summaries) {
    if (s.playerId === mvpPlayerId) {
      s.isMvp = true;
      s.updatedCard.mvpAwards += 1;
    }
  }

  return {
    matchId,
    mvpPlayerId,
    summaries,
  };
}
