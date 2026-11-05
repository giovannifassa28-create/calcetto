export type PlayerRole = 'ATTACCANTE' | 'DIFENSORE' | 'PORTIERE' | 'UNIVERSALE';
export type CardTier = 'BRONZO' | 'ARGENTO' | 'ORO';
export type MatchStatus = 'DRAFT' | 'IN_PROGRESS' | 'WAITING_RATINGS' | 'COMPLETED';
export type MatchTeam = 'A' | 'B';

export interface PlayerProfile {
  id: string;
  fullName: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  card: PlayerCard;
}

export interface PlayerCard {
  id: string;
  userId: string;
  preferredPosition: PlayerRole;
  attack: number;     // 1 - 100
  defense: number;    // 1 - 100
  goalkeeper: number; // 1 - 100
  overall: number;    // 1 - 99
  tier: CardTier;
  matchesPlayed: number;
  matchesWon: number;
  mvpAwards: number;
}

export interface MatchLineupItem {
  id: string;
  matchId: string;
  playerId: string;
  team: MatchTeam;
  assignedRole: PlayerRole;
  goalsScored?: number;
}

export interface MatchRatingSubmission {
  matchId: string;
  voterId: string;        // Chi vota (auth.uid)
  ratedPlayerId: string;  // Chi riceve il voto (diverso da voterId)
  ratingAttack: number;    // 1.0 - 10.0
  ratingDefense: number;   // 1.0 - 10.0
  ratingGoalkeeper: number;// 1.0 - 10.0
  comment?: string;
}

export interface TeamStatsSummary {
  players: PlayerProfile[];
  averageOverall: number;
  totalAttack: number;
  totalDefense: number;
  bestGoalkeeperScore: number;
  goalkeeperAssigned: PlayerProfile | null;
  roleDistribution: Record<PlayerRole, number>;
  synergyScore: number; // 0 - 100
}

export interface TeamBalanceResult {
  teamA: TeamStatsSummary;
  teamB: TeamStatsSummary;
  winProbabilityA: number; // 0% - 100%
  winProbabilityB: number; // 0% - 100%
  overallDelta: number;    // Differenza assoluta di overall
  balanceFairness: number; // Indice di equità 0-100% (100% = squadre gemelle)
}
