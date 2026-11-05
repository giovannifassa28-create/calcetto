-- ==============================================================================
-- CALCETTO MANAGER & FANTA-CALCETTO - SUPABASE DATABASE SCHEMA
-- ==============================================================================
-- Include: Tabelle, Vincoli di Integrità, RLS (Row Level Security),
-- Funzioni e Trigger per Overall e Regola d'Oro (Anti-Autovoto e Anti-Automodifica)
-- ==============================================================================

-- 1. ENUMS E TIPI PERSONALIZZATI
CREATE TYPE player_role AS ENUM ('ATTACCANTE', 'DIFENSORE', 'PORTIERE', 'UNIVERSALE');
CREATE TYPE card_tier AS ENUM ('BRONZO', 'ARGENTO', 'ORO');
CREATE TYPE match_status AS ENUM ('DRAFT', 'IN_PROGRESS', 'WAITING_RATINGS', 'COMPLETED');
CREATE TYPE match_team AS ENUM ('A', 'B');

-- 2. TABELLA PROFILI (Estende auth.users di Supabase)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    nickname TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 3. TABELLA CARTE GIOCATORE (Le "FUT Cards" dei giocatori)
CREATE TABLE player_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    preferred_position player_role NOT NULL DEFAULT 'UNIVERSALE',
    stat_attack INTEGER NOT NULL CHECK (stat_attack BETWEEN 1 AND 100) DEFAULT 60,
    stat_defense INTEGER NOT NULL CHECK (stat_defense BETWEEN 1 AND 100) DEFAULT 60,
    stat_goalkeeper INTEGER NOT NULL CHECK (stat_goalkeeper BETWEEN 1 AND 100) DEFAULT 50,
    overall INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 100) DEFAULT 59,
    tier card_tier NOT NULL DEFAULT 'BRONZO',
    matches_played INTEGER NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
    matches_won INTEGER NOT NULL DEFAULT 0 CHECK (matches_won >= 0),
    mvp_awards INTEGER NOT NULL DEFAULT 0 CHECK (mvp_awards >= 0),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 4. FUNZIONE E TRIGGER PER CALCOLO OVERALL E TIER AUTOMATICO
CREATE OR REPLACE FUNCTION calculate_player_overall_and_tier()
RETURNS TRIGGER AS $$
DECLARE
    calculated_ovr INTEGER;
BEGIN
    -- Calcolo Overall pesato in base al ruolo preferito
    IF NEW.preferred_position = 'ATTACCANTE' THEN
        calculated_ovr := ROUND((NEW.stat_attack * 0.55) + (NEW.stat_defense * 0.35) + (NEW.stat_goalkeeper * 0.10));
    ELSIF NEW.preferred_position = 'DIFENSORE' THEN
        calculated_ovr := ROUND((NEW.stat_attack * 0.30) + (NEW.stat_defense * 0.60) + (NEW.stat_goalkeeper * 0.10));
    ELSIF NEW.preferred_position = 'PORTIERE' THEN
        calculated_ovr := ROUND((NEW.stat_attack * 0.10) + (NEW.stat_defense * 0.20) + (NEW.stat_goalkeeper * 0.70));
    ELSE -- UNIVERSALE
        calculated_ovr := ROUND((NEW.stat_attack * 0.45) + (NEW.stat_defense * 0.45) + (NEW.stat_goalkeeper * 0.10));
    END IF;

    -- Clamp tra 1 e 99
    IF calculated_ovr < 1 THEN calculated_ovr := 1; END IF;
    IF calculated_ovr > 99 THEN calculated_ovr := 99; END IF;

    NEW.overall := calculated_ovr;

    -- Assegnazione Tier (FUT Style)
    IF calculated_ovr >= 85 THEN
        NEW.tier := 'ORO';
    ELSIF calculated_ovr >= 70 THEN
        NEW.tier := 'ARGENTO';
    ELSE
        NEW.tier := 'BRONZO';
    END IF;

    NEW.updated_at := TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_player_overall
BEFORE INSERT OR UPDATE OF stat_attack, stat_defense, stat_goalkeeper, preferred_position
ON player_cards
FOR EACH ROW
EXECUTE FUNCTION calculate_player_overall_and_tier();

-- 5. TABELLA PARTITE
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES profiles(id),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    status match_status NOT NULL DEFAULT 'DRAFT',
    score_team_a INTEGER DEFAULT 0 CHECK (score_team_a >= 0),
    score_team_b INTEGER DEFAULT 0 CHECK (score_team_b >= 0),
    win_probability_a NUMERIC(5,2) DEFAULT 50.00 CHECK (win_probability_a BETWEEN 0 AND 100),
    win_probability_b NUMERIC(5,2) DEFAULT 50.00 CHECK (win_probability_b BETWEEN 0 AND 100),
    mvp_player_id UUID REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 6. TABELLA GIOCATORI CONVOCATI / SQUADRE DELLA PARTITA
CREATE TABLE match_lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    team match_team NOT NULL,
    assigned_role player_role NOT NULL DEFAULT 'UNIVERSALE',
    goals_scored INTEGER DEFAULT 0 CHECK (goals_scored >= 0),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    CONSTRAINT unique_player_per_match UNIQUE (match_id, player_id)
);

-- 7. TABELLA PAGELLE / VALUTAZIONI PEER-TO-PEER
CREATE TABLE match_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    rated_player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    rating_attack NUMERIC(3,1) NOT NULL CHECK (rating_attack BETWEEN 1.0 AND 10.0),
    rating_defense NUMERIC(3,1) NOT NULL CHECK (rating_defense BETWEEN 1.0 AND 10.0),
    rating_goalkeeper NUMERIC(3,1) NOT NULL CHECK (rating_goalkeeper BETWEEN 1.0 AND 10.0),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    
    -- VINCOLO FONDAMENTALE DI INTEGRITA' DATABASE:
    -- UN GIOCATORE NON PUO' ASSOLUTAMENTE VOTARE SE STESSO!
    CONSTRAINT cannot_vote_self CHECK (voter_id <> rated_player_id),
    CONSTRAINT unique_vote_per_match_and_player UNIQUE (match_id, voter_id, rated_player_id)
);

-- ==============================================================================
-- 8. SICUREZZA: ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_ratings ENABLE ROW LEVEL SECURITY;

-- Profiles: chiunque autenticato può leggere i profili, l'utente può aggiornare solo il proprio
CREATE POLICY "Profili visibili a tutti gli utenti autenticati"
ON profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Utente modifica solo il proprio profilo di base"
ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Player Cards:
-- Regola d'oro 1: Tutti possono vedere le carte.
CREATE POLICY "Carte visibili a tutti gli utenti autenticati"
ON player_cards FOR SELECT TO authenticated USING (true);

-- Regola d'oro 2: UN GIOCATORE NON PUÒ MODIFICARE LA PROPRIA CARTA!
-- Possono farlo solo gli altri amici (es. calibrazione iniziale) o funzioni di sistema
CREATE POLICY "Gli altri amici possono aggiornare la carta, MAI l'utente stesso"
ON player_cards FOR UPDATE TO authenticated
USING (auth.uid() <> user_id)
WITH CHECK (auth.uid() <> user_id);

-- Matches & Lineups:
CREATE POLICY "Partite visibili a tutti"
ON matches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Utenti autenticati possono creare e aggiornare partite"
ON matches FOR ALL TO authenticated USING (true);

CREATE POLICY "Formazioni visibili a tutti"
ON match_lineups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestione formazioni consentita ad utenti autenticati"
ON match_lineups FOR ALL TO authenticated USING (true);

-- Match Ratings (Pagelle):
-- Regola d'oro 3: Il voter deve essere l'utente loggato E NON può votare se stesso
CREATE POLICY "Lettura pagelle consentita a tutti gli autenticati"
ON match_ratings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Inserimento pagella: vietato autovoto ed identità verificata"
ON match_ratings FOR INSERT TO authenticated
WITH CHECK (
    auth.uid() = voter_id AND
    voter_id <> rated_player_id
);

-- ==============================================================================
-- 9. FUNZIONE RPC: AGGIORNAMENTO DINAMICO DELLE CARTE POST-PARTITA
-- ==============================================================================
-- Calcola la media dei voti ricevuti per ogni giocatore nella partita,
-- aggiorna le statistiche della carta (Attacco, Difesa, Porta) con una formula
-- bilanciata a progressione graduale (K-factor) e incrementa presenze e vittorie.
-- ==============================================================================

CREATE OR REPLACE FUNCTION finalize_match_and_update_cards(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Esegue con permessi elevati per garantire transazionalità sicura
AS $$
DECLARE
    v_match RECORD;
    v_player RECORD;
    v_stats RECORD;
    v_winning_team match_team;
    v_is_winner BOOLEAN;
    v_delta_atk NUMERIC;
    v_delta_def NUMERIC;
    v_delta_gk NUMERIC;
    v_k_factor NUMERIC := 1.2; -- Sensibilità dell'aggiornamento
    v_updated_count INTEGER := 0;
BEGIN
    -- 1. Verifica esistenza e stato partita
    SELECT * INTO v_match FROM matches WHERE id = p_match_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Partita con ID % non trovata.', p_match_id;
    END IF;

    -- Determina la squadra vincitrice
    IF v_match.score_team_a > v_match.score_team_b THEN
        v_winning_team := 'A';
    ELSIF v_match.score_team_b > v_match.score_team_a THEN
        v_winning_team := 'B';
    ELSE
        v_winning_team := NULL; -- Pareggio
    END IF;

    -- 2. Itera su tutti i giocatori che hanno disputato la partita
    FOR v_player IN (SELECT * FROM match_lineups WHERE match_id = p_match_id) LOOP
        v_is_winner := (v_winning_team IS NOT NULL AND v_player.team = v_winning_team);

        -- Calcola la media delle pagelle ricevute (escludendo eventuali autovoti)
        SELECT 
            COALESCE(AVG(rating_attack), 6.5) AS avg_atk,
            COALESCE(AVG(rating_defense), 6.5) AS avg_def,
            COALESCE(AVG(rating_goalkeeper), 6.5) AS avg_gk,
            COUNT(*) AS total_votes
        INTO v_stats
        FROM match_ratings
        WHERE match_id = p_match_id AND rated_player_id = v_player.player_id;

        -- Se il giocatore ha ricevuto almeno 1 voto valido
        IF v_stats.total_votes > 0 THEN
            -- Formula: Delta = K * (VotoMedio - 6.5) + (Bonus Vittoria: +0.5 se ha vinto, -0.2 se ha perso)
            v_delta_atk := v_k_factor * (v_stats.avg_atk - 6.5) + (CASE WHEN v_is_winner THEN 0.5 WHEN v_winning_team IS NOT NULL THEN -0.2 ELSE 0.0 END);
            v_delta_def := v_k_factor * (v_stats.avg_def - 6.5) + (CASE WHEN v_is_winner THEN 0.5 WHEN v_winning_team IS NOT NULL THEN -0.2 ELSE 0.0 END);
            v_delta_gk  := v_k_factor * (v_stats.avg_gk - 6.5)  + (CASE WHEN v_is_winner THEN 0.5 WHEN v_winning_team IS NOT NULL THEN -0.2 ELSE 0.0 END);

            -- Aggiorna la carta del giocatore
            UPDATE player_cards
            SET 
                stat_attack = GREATEST(1, LEAST(99, ROUND(stat_attack + v_delta_atk))),
                stat_defense = GREATEST(1, LEAST(99, ROUND(stat_defense + v_delta_def))),
                stat_goalkeeper = GREATEST(1, LEAST(99, ROUND(stat_goalkeeper + v_delta_gk))),
                matches_played = matches_played + 1,
                matches_won = matches_won + (CASE WHEN v_is_winner THEN 1 ELSE 0 END),
                updated_at = TIMEZONE('utc', NOW())
            WHERE user_id = v_player.player_id;

            v_updated_count := v_updated_count + 1;
        END IF;
    END LOOP;

    -- 3. Aggiorna lo stato della partita a 'COMPLETED'
    UPDATE matches
    SET status = 'COMPLETED', updated_at = TIMEZONE('utc', NOW())
    WHERE id = p_match_id;

    RETURN jsonb_build_object(
        'success', true,
        'match_id', p_match_id,
        'cards_updated', v_updated_count
    );
END;
$$;
