import { createClient } from '@supabase/supabase-js';
import { MatchRatingSubmission, PlayerProfile } from '../types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Inizializza il client Supabase se le chiavi sono presenti
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Helper per verificare se il client è configurato con chiavi reali
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabase);
}

/**
 * Recupera tutte le carte giocatore con il relativo profilo utente
 */
export async function fetchAllPlayerProfiles(): Promise<PlayerProfile[]> {
  if (!supabase) {
    throw new Error('Supabase non è configurato. Inserisci le credenziali in .env.local');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      nickname,
      avatar_url,
      player_cards (
        id,
        user_id,
        preferred_position,
        stat_attack,
        stat_defense,
        stat_goalkeeper,
        overall,
        tier,
        matches_played,
        matches_won,
        mvp_awards
      )
    `);

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    card: {
      id: row.player_cards.id,
      userId: row.player_cards.user_id,
      preferredPosition: row.player_cards.preferred_position,
      attack: row.player_cards.stat_attack,
      defense: row.player_cards.stat_defense,
      goalkeeper: row.player_cards.stat_goalkeeper,
      overall: row.player_cards.overall,
      tier: row.player_cards.tier,
      matchesPlayed: row.player_cards.matches_played,
      matchesWon: row.player_cards.matches_won,
      mvpAwards: row.player_cards.mvp_awards,
    },
  }));
}

/**
 * Invia un blocco di pagelle per la partita.
 * La RLS di Supabase blocca qualsiasi tentativo di autovoto o voto contraffatto.
 */
export async function submitMatchRatings(ratings: MatchRatingSubmission[]): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato.');

  const dbRows = ratings.map((r) => ({
    match_id: r.matchId,
    voter_id: r.voterId,
    rated_player_id: r.ratedPlayerId,
    rating_attack: r.ratingAttack,
    rating_defense: r.ratingDefense,
    rating_goalkeeper: r.ratingGoalkeeper,
    comment: r.comment || null,
  }));

  const { error } = await supabase.from('match_ratings').insert(dbRows);
  if (error) throw error;
}

/**
 * Chiude la partita e attiva il ricalcolo automatico delle carte tramite RPC
 */
export async function finalizeMatchRatings(matchId: string): Promise<any> {
  if (!supabase) throw new Error('Supabase non configurato.');

  const { data, error } = await supabase.rpc('finalize_match_and_update_cards', {
    p_match_id: matchId,
  });

  if (error) throw error;
  return data;
}
