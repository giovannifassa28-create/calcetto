import { PlayerProfile, PlayerRole, TeamBalanceResult, TeamStatsSummary } from '../types';

/**
 * Algoritmo Avanzato di Bilanciamento Squadre & Predittore di Vittoria per Calcetto
 * 
 * Risolve i 3 problemi tipici del calcetto a 5:
 * 1. Portiere: distribuzione equa dei portieri di ruolo o dei migliori portieri di emergenza.
 * 2. Posizioni: evita squadre sbilanciate (es. 4 attaccanti vs 4 difensori).
 * 3. Forza globale: minimizza lo scarto di Overall e calcola la sinergia e la % di vittoria.
 */

interface PartitionEvaluation {
  teamA: PlayerProfile[];
  teamB: PlayerProfile[];
  cost: number;
  statsA: TeamStatsSummary;
  statsB: TeamStatsSummary;
}

/**
 * Calcola l'Overall effettivo basato sui pesi del ruolo
 */
export function calculateRoleOverall(
  attack: number,
  defense: number,
  goalkeeper: number,
  role: PlayerRole
): number {
  switch (role) {
    case 'ATTACCANTE':
      return Math.round(attack * 0.55 + defense * 0.35 + goalkeeper * 0.10);
    case 'DIFENSORE':
      return Math.round(attack * 0.30 + defense * 0.60 + goalkeeper * 0.10);
    case 'PORTIERE':
      return Math.round(attack * 0.10 + defense * 0.20 + goalkeeper * 0.70);
    case 'UNIVERSALE':
    default:
      return Math.round(attack * 0.45 + defense * 0.45 + goalkeeper * 0.10);
  }
}

/**
 * Analizza le statistiche, i ruoli e la sinergia di una squadra
 */
export function analyzeTeam(players: PlayerProfile[]): TeamStatsSummary {
  const count = players.length;
  if (count === 0) {
    return {
      players: [],
      averageOverall: 0,
      totalAttack: 0,
      totalDefense: 0,
      bestGoalkeeperScore: 0,
      goalkeeperAssigned: null,
      roleDistribution: { ATTACCANTE: 0, DIFENSORE: 0, PORTIERE: 0, UNIVERSALE: 0 },
      synergyScore: 0,
    };
  }

  let totalOvr = 0;
  let totalAtk = 0;
  let totalDef = 0;

  const roleDistribution: Record<PlayerRole, number> = {
    ATTACCANTE: 0,
    DIFENSORE: 0,
    PORTIERE: 0,
    UNIVERSALE: 0,
  };

  // Cerca portiere di ruolo o giocatore con abilità porta più alta
  let assignedGk: PlayerProfile | null = null;
  let maxGkStat = -1;

  for (const player of players) {
    const card = player.card;
    totalOvr += card.overall;
    totalAtk += card.attack;
    totalDef += card.defense;
    roleDistribution[card.preferredPosition]++;

    if (card.preferredPosition === 'PORTIERE') {
      if (!assignedGk || card.goalkeeper > assignedGk.card.goalkeeper) {
        assignedGk = player;
      }
    }

    if (card.goalkeeper > maxGkStat) {
      maxGkStat = card.goalkeeper;
      if (!assignedGk) {
        assignedGk = player;
      }
    }
  }

  // Calcolo Sinergia (da 0 a 100):
  // Squadra ideale nel calcetto a 5: 1 Portiere, almeno 1 Difensore, almeno 1 Attaccante
  let synergy = 100;

  // Penalità se non c'è un portiere con stat decente (>65)
  if (maxGkStat < 65) {
    synergy -= (65 - maxGkStat) * 0.5;
  }

  // Penalità se mancano difensori
  if (roleDistribution.DIFENSORE === 0) {
    synergy -= 15;
  }

  // Penalità se mancano attaccanti
  if (roleDistribution.ATTACCANTE === 0) {
    synergy -= 12;
  }

  // Penalità se troppi attaccanti (es. 3 o più su 5 giocatori)
  if (roleDistribution.ATTACCANTE >= 3) {
    synergy -= 10;
  }

  synergy = Math.max(20, Math.min(100, Math.round(synergy)));

  return {
    players,
    averageOverall: Math.round((totalOvr / count) * 10) / 10,
    totalAttack: totalAtk,
    totalDefense: totalDef,
    bestGoalkeeperScore: maxGkStat,
    goalkeeperAssigned: assignedGk,
    roleDistribution,
    synergyScore: synergy,
  };
}

/**
 * Funzione di costo per valutare l'equilibrio tra Team A e Team B
 * Più il costo è vicino a 0, più le squadre sono perfettamente speculari ed equilibrate.
 */
function evaluatePartitionCost(teamA: PlayerProfile[], teamB: PlayerProfile[]): PartitionEvaluation {
  const statsA = analyzeTeam(teamA);
  const statsB = analyzeTeam(teamB);

  // 1. Delta Overall Medio (peso: 3.5)
  const deltaOvr = Math.abs(statsA.averageOverall - statsB.averageOverall);

  // 2. Delta Portieri (fondamentale nel calcetto, peso: 2.5)
  const deltaGk = Math.abs(statsA.bestGoalkeeperScore - statsB.bestGoalkeeperScore);

  // 3. Delta Attacco e Difesa complessivi (peso: 1.0)
  const deltaAtk = Math.abs(statsA.totalAttack - statsB.totalAttack) / teamA.length;
  const deltaDef = Math.abs(statsA.totalDefense - statsB.totalDefense) / teamA.length;

  // 4. Delta Distribuzione Ruoli
  const deltaAttackers = Math.abs(statsA.roleDistribution.ATTACCANTE - statsB.roleDistribution.ATTACCANTE);
  const deltaDefenders = Math.abs(statsA.roleDistribution.DIFENSORE - statsB.roleDistribution.DIFENSORE);
  const deltaKeepers = Math.abs(statsA.roleDistribution.PORTIERE - statsB.roleDistribution.PORTIERE);

  // Penalità se due portieri di ruolo finiscono nella stessa squadra
  const keeperPenalty = deltaKeepers > 1 ? 50 : (deltaKeepers === 1 && statsA.roleDistribution.PORTIERE + statsB.roleDistribution.PORTIERE === 2 ? 60 : 0);

  // Costo Totale
  const totalCost =
    deltaOvr * 3.5 +
    deltaGk * 0.35 +
    deltaAtk * 0.8 +
    deltaDef * 0.8 +
    deltaAttackers * 4.0 +
    deltaDefenders * 4.0 +
    keeperPenalty;

  return {
    teamA,
    teamB,
    cost: totalCost,
    statsA,
    statsB,
  };
}

/**
 * Calcola tutte le combinazioni possibili di dimensione K da un array N
 */
function getCombinations<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];

  function helper(start: number, combo: T[]) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      combo.push(array[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }

  helper(0, []);
  return result;
}

/**
 * Calcola la probabilità di vittoria delle due squadre basandosi su OVR, portieri e sinergie
 */
function calculateWinProbabilities(
  statsA: TeamStatsSummary,
  statsB: TeamStatsSummary
): { probA: number; probB: number } {
  // Potenza effettiva = (Overall * 0.6) + (GK * 0.25) + (Sinergia * 0.15)
  const powerA =
    statsA.averageOverall * 0.60 +
    statsA.bestGoalkeeperScore * 0.25 +
    (statsA.synergyScore * 0.85) * 0.15;

  const powerB =
    statsB.averageOverall * 0.60 +
    statsB.bestGoalkeeperScore * 0.25 +
    (statsB.synergyScore * 0.85) * 0.15;

  const diff = powerA - powerB;

  // Modello Logistico / Elo (scala di 18 punti)
  const rawProbA = 1 / (1 + Math.pow(10, -diff / 18));
  let probA = Math.round(rawProbA * 1000) / 10;
  let probB = Math.round((100 - probA) * 10) / 10;

  // Clamp per evitare percentuali ridicole tra amici (range realistico 25% - 75%)
  probA = Math.max(25.0, Math.min(75.0, probA));
  probB = Math.round((100 - probA) * 10) / 10;

  return { probA, probB };
}

/**
 * Genera il bilanciamento ottimale delle squadre tra i convocati
 */
export function balanceTeams(players: PlayerProfile[]): TeamBalanceResult {
  const total = players.length;
  if (total < 2) {
    throw new Error('Almeno 2 giocatori sono necessari per creare le squadre.');
  }

  const teamSizeA = Math.floor(total / 2);

  // Per N <= 12 (calcetto a 5 o a 6 standard): Combinatoria Esatta Globale
  // Per 10 giocatori: C(10, 5) / 2 = 126 partizioni valutate in < 1ms
  if (total <= 12) {
    const allCombos = getCombinations(players, teamSizeA);
    const halfLen = Math.floor(allCombos.length / 2);

    let bestEvaluation: PartitionEvaluation | null = null;

    for (let i = 0; i < halfLen; i++) {
      const teamA = allCombos[i];
      const teamASet = new Set(teamA.map((p) => p.id));
      const teamB = players.filter((p) => !teamASet.has(p.id));

      const evaluation = evaluatePartitionCost(teamA, teamB);

      if (!bestEvaluation || evaluation.cost < bestEvaluation.cost) {
        bestEvaluation = evaluation;
      }
    }

    if (!bestEvaluation) {
      throw new Error('Impossibile calcolare la combinazione ottimale.');
    }

    const { probA, probB } = calculateWinProbabilities(bestEvaluation.statsA, bestEvaluation.statsB);
    const overallDelta = Math.abs(bestEvaluation.statsA.averageOverall - bestEvaluation.statsB.averageOverall);
    
    // Indice di Equità (100% = identiche)
    const balanceFairness = Math.max(0, Math.min(100, Math.round(100 - bestEvaluation.cost)));

    return {
      teamA: bestEvaluation.statsA,
      teamB: bestEvaluation.statsB,
      winProbabilityA: probA,
      winProbabilityB: probB,
      overallDelta: Math.round(overallDelta * 10) / 10,
      balanceFairness,
    };
  }

  // Fallback Greedy / Randomized per N > 12 (es. calcetto a 7 o a 8)
  return balanceTeamsGreedy(players, teamSizeA);
}

/**
 * Algoritmo Greedy con Local Search per gruppi numerosi (> 12 giocatori)
 */
function balanceTeamsGreedy(players: PlayerProfile[], teamSizeA: number): TeamBalanceResult {
  // Ordina per Overall decrescente
  const sorted = [...players].sort((a, b) => b.card.overall - a.card.overall);

  let teamA: PlayerProfile[] = [];
  let teamB: PlayerProfile[] = [];

  // Distribuisci a serpente (Snake Draft: 1A, 2B, 3B, 4A, ...)
  for (let i = 0; i < sorted.length; i++) {
    const cycle = Math.floor(i / 2) % 2;
    if (cycle === 0) {
      if (i % 2 === 0) teamA.push(sorted[i]);
      else teamB.push(sorted[i]);
    } else {
      if (i % 2 === 0) teamB.push(sorted[i]);
      else teamA.push(sorted[i]);
    }
  }

  // 1000 iterazioni di Local Search per minimizzare il costo
  let currentEval = evaluatePartitionCost(teamA, teamB);

  for (let iter = 0; iter < 1000; iter++) {
    const idxA = Math.floor(Math.random() * teamA.length);
    const idxB = Math.floor(Math.random() * teamB.length);

    // Swap di prova
    const newTeamA = [...teamA];
    const newTeamB = [...teamB];
    const temp = newTeamA[idxA];
    newTeamA[idxA] = newTeamB[idxB];
    newTeamB[idxB] = temp;

    const newEval = evaluatePartitionCost(newTeamA, newTeamB);
    if (newEval.cost < currentEval.cost) {
      teamA = newTeamA;
      teamB = newTeamB;
      currentEval = newEval;
    }
  }

  const { probA, probB } = calculateWinProbabilities(currentEval.statsA, currentEval.statsB);
  const overallDelta = Math.abs(currentEval.statsA.averageOverall - currentEval.statsB.averageOverall);
  const balanceFairness = Math.max(0, Math.min(100, Math.round(100 - currentEval.cost)));

  return {
    teamA: currentEval.statsA,
    teamB: currentEval.statsB,
    winProbabilityA: probA,
    winProbabilityB: probB,
    overallDelta: Math.round(overallDelta * 10) / 10,
    balanceFairness,
  };
}
