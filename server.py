import os
import json
import sqlite3
import hashlib
import itertools
from typing import List, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr

# ==============================================================================
# CONFIGURAZIONE & DATABASE (SQLite Locale Persistente)
# ==============================================================================

DB_PATH = os.path.join(os.path.dirname(__file__), 'calcetto.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Tabella Utenti
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            nickname TEXT,
            avatar_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Tabella Carte Giocatore
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS player_cards (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            preferred_position TEXT NOT NULL CHECK (preferred_position IN ('ATTACCANTE', 'DIFENSORE', 'PORTIERE', 'UNIVERSALE')),
            stat_attack INTEGER NOT NULL CHECK (stat_attack BETWEEN 1 AND 99) DEFAULT 60,
            stat_defense INTEGER NOT NULL CHECK (stat_defense BETWEEN 1 AND 99) DEFAULT 60,
            stat_goalkeeper INTEGER NOT NULL CHECK (stat_goalkeeper BETWEEN 1 AND 99) DEFAULT 50,
            overall INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 99) DEFAULT 59,
            tier TEXT NOT NULL CHECK (tier IN ('BRONZO', 'ARGENTO', 'ORO')) DEFAULT 'BRONZO',
            matches_played INTEGER NOT NULL DEFAULT 0,
            matches_won INTEGER NOT NULL DEFAULT 0,
            mvp_awards INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    # Tabella Partite
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS matches (
            id TEXT PRIMARY KEY,
            scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT NOT NULL DEFAULT 'COMPLETED',
            score_team_a INTEGER DEFAULT 0,
            score_team_b INTEGER DEFAULT 0,
            win_prob_a REAL DEFAULT 50.0,
            win_prob_b REAL DEFAULT 50.0,
            mvp_player_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Tabella Pagelle
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS match_ratings (
            id TEXT PRIMARY KEY,
            match_id TEXT NOT NULL,
            voter_id TEXT NOT NULL,
            rated_player_id TEXT NOT NULL,
            rating_attack REAL NOT NULL CHECK (rating_attack BETWEEN 1.0 AND 10.0),
            rating_defense REAL NOT NULL CHECK (rating_defense BETWEEN 1.0 AND 10.0),
            rating_goalkeeper REAL NOT NULL CHECK (rating_goalkeeper BETWEEN 1.0 AND 10.0),
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CHECK (voter_id != rated_player_id),
            UNIQUE (match_id, voter_id, rated_player_id)
        )
    ''')

    # Tabelle Sondaggio Giorni Partita
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS polls (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS poll_options (
            id TEXT PRIMARY KEY,
            poll_id TEXT NOT NULL,
            day_label TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS poll_votes (
            id TEXT PRIMARY KEY,
            option_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (option_id, user_id),
            FOREIGN KEY (option_id) REFERENCES poll_options (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    # Inizializza sondaggio settimanale se non esiste
    cursor.execute('SELECT COUNT(*) as count FROM polls')
    if cursor.fetchone()['count'] == 0:
        cursor.execute("INSERT INTO polls (id, title) VALUES ('poll-settimanale', 'Quali giorni sei disponibile questa settimana?')")
        days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
        for i, day in enumerate(days):
            cursor.execute(
                "INSERT INTO poll_options (id, poll_id, day_label, sort_order) VALUES (?, 'poll-settimanale', ?, ?)",
                (f"opt-{day.lower()}", day, i)
            )

    conn.commit()
    conn.close()

def clear_fake_demo_users():
    """Elimina tutti i finti utenti demo per lasciare SOLO le persone che si registrano davvero."""
    conn = get_db()
    cursor = conn.cursor()
    # Elimina utenti che hanno email @calcetto.app create dal vecchio seed
    cursor.execute("DELETE FROM users WHERE email LIKE '%@calcetto.app'")
    cursor.execute("DELETE FROM player_cards WHERE user_id NOT IN (SELECT id FROM users)")
    conn.commit()
    conn.close()

def hash_password(password: str) -> str:
    return hashlib.sha256(f"calcetto_salt_{password}".encode()).hexdigest()

def calculate_overall(atk: int, def_: int, gk: int, pos: str) -> int:
    if pos == 'ATTACCANTE':
        ovr = round(atk * 0.55 + def_ * 0.35 + gk * 0.10)
    elif pos == 'DIFENSORE':
        ovr = round(atk * 0.30 + def_ * 0.60 + gk * 0.10)
    elif pos == 'PORTIERE':
        ovr = round(atk * 0.10 + def_ * 0.20 + gk * 0.70)
    else:  # UNIVERSALE
        ovr = round(atk * 0.45 + def_ * 0.45 + gk * 0.10)
    return max(1, min(99, ovr))

def calculate_tier(ovr: int) -> str:
    if ovr >= 85:
        return 'ORO'
    elif ovr >= 70:
        return 'ARGENTO'
    return 'BRONZO'

# ==============================================================================
# FASTAPI APPLICATION SETUP
# ==============================================================================

app = FastAPI(title="Calcetto Manager", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_tokens = {}

# ==============================================================================
# SCHEMI PYDANTIC
# ==============================================================================

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    fullName: str
    nickname: Optional[str] = None
    preferredPosition: str  # ATTACCANTE, DIFENSORE, PORTIERE, UNIVERSALE
    statAttack: int         # Autovalutazione iniziale Attacco (1-99)
    statDefense: int        # Autovalutazione iniziale Difesa (1-99)
    statGoalkeeper: int     # Autovalutazione iniziale Porta (1-99)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class BalanceRequest(BaseModel):
    playerIds: List[str]

class RatingItem(BaseModel):
    ratedPlayerId: str
    ratingAttack: float
    ratingDefense: float
    ratingGoalkeeper: float
    comment: Optional[str] = None

class SubmitRatingsRequest(BaseModel):
    matchId: str
    scoreTeamA: int
    scoreTeamB: int
    teamAPlayerIds: List[str]
    teamBPlayerIds: List[str]
    ratings: List[RatingItem]

class PollVoteRequest(BaseModel):
    optionIds: List[str]

# ==============================================================================
# AUTENTICAZIONE DEPENDENCY
# ==============================================================================

def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    user_id = active_tokens.get(token)
    if not user_id:
        return None
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    if not user:
        return None
    return dict(user)

def require_current_user(current_user: Optional[dict] = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Accesso richiesto: effettua il login.")
    return current_user

# ==============================================================================
# ENDPOINT AUTENTICAZIONE & REGISTRAZIONE CON AUTOVALUTAZIONE
# ==============================================================================

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM users WHERE email = ?', (req.email,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Un account con questa email esiste già.")

    user_id = f"user-{int(datetime.now().timestamp()*1000)}"
    p_hash = hash_password(req.password)

    cursor.execute('''
        INSERT INTO users (id, email, password_hash, full_name, nickname)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, req.email, p_hash, req.fullName, req.nickname or req.fullName))

    # Clamp delle statistiche di autovalutazione tra 1 e 99
    atk = max(1, min(99, req.statAttack))
    def_ = max(1, min(99, req.statDefense))
    gk = max(1, min(99, req.statGoalkeeper))

    ovr = calculate_overall(atk, def_, gk, req.preferredPosition)
    tier = calculate_tier(ovr)
    card_id = f"card-{user_id}"

    cursor.execute('''
        INSERT INTO player_cards (
            id, user_id, preferred_position, stat_attack, stat_defense,
            stat_goalkeeper, overall, tier, matches_played, matches_won, mvp_awards
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
    ''', (card_id, user_id, req.preferredPosition, atk, def_, gk, ovr, tier))

    conn.commit()
    conn.close()

    token = hashlib.sha256(f"{user_id}_{datetime.now().timestamp()}".encode()).hexdigest()
    active_tokens[token] = user_id

    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": req.email,
            "fullName": req.fullName,
            "nickname": req.nickname or req.fullName,
            "card": {
                "id": card_id,
                "preferredPosition": req.preferredPosition,
                "attack": atk,
                "defense": def_,
                "goalkeeper": gk,
                "overall": ovr,
                "tier": tier,
                "matchesPlayed": 0,
                "matchesWon": 0,
                "mvpAwards": 0,
            }
        }
    }

@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_db()
    cursor = conn.cursor()

    p_hash = hash_password(req.password)
    cursor.execute('SELECT * FROM users WHERE email = ? AND password_hash = ?', (req.email, p_hash))
    user = cursor.fetchone()

    if not user:
        conn.close()
        raise HTTPException(status_code=400, detail="Credenziali errate. Controlla email e password.")

    user_dict = dict(user)
    cursor.execute('SELECT * FROM player_cards WHERE user_id = ?', (user_dict['id'],))
    card = cursor.fetchone()
    conn.close()

    token = hashlib.sha256(f"{user_dict['id']}_{datetime.now().timestamp()}".encode()).hexdigest()
    active_tokens[token] = user_dict['id']

    return {
        "token": token,
        "user": {
            "id": user_dict['id'],
            "email": user_dict['email'],
            "fullName": user_dict['full_name'],
            "nickname": user_dict['nickname'],
            "card": dict(card) if card else None
        }
    }

@app.get("/api/auth/me")
def get_me(current_user: Optional[dict] = Depends(get_current_user)):
    if not current_user:
        return {"authenticated": False}

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM player_cards WHERE user_id = ?', (current_user['id'],))
    card = cursor.fetchone()
    conn.close()

    return {
        "authenticated": True,
        "user": current_user,
        "card": dict(card) if card else None
    }

# ==============================================================================
# SONDAGGIO ORGANIZZAZIONE GIORNI PARTITA
# ==============================================================================

@app.get("/api/poll")
def get_active_poll(current_user: Optional[dict] = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM polls WHERE status = 'OPEN' ORDER BY created_at DESC LIMIT 1")
    poll = cursor.fetchone()
    if not poll:
        conn.close()
        return {"hasPoll": False}

    poll_dict = dict(poll)
    cursor.execute("SELECT * FROM poll_options WHERE poll_id = ? ORDER BY sort_order ASC", (poll_dict['id'],))
    options = [dict(r) for r in cursor.fetchall()]

    for opt in options:
        # Recupera tutti i giocatori che hanno votato questa opzione
        cursor.execute('''
            SELECT u.id, u.full_name, u.nickname, c.preferred_position, c.overall
            FROM poll_votes v
            JOIN users u ON v.user_id = u.id
            JOIN player_cards c ON u.id = c.user_id
            WHERE v.option_id = ?
        ''', (opt['id'],))
        voters = [dict(r) for r in cursor.fetchall()]
        opt['voters'] = voters
        opt['voteCount'] = len(voters)
        opt['hasVoted'] = any(v['id'] == current_user['id'] for v in voters) if current_user else False

    conn.close()
    return {
        "hasPoll": True,
        "poll": poll_dict,
        "options": options
    }

@app.post("/api/poll/vote")
def vote_poll(req: PollVoteRequest, current_user: dict = Depends(require_current_user)):
    user_id = current_user['id']
    conn = get_db()
    cursor = conn.cursor()

    # Rimuovi i voti precedenti dell'utente per questo sondaggio
    cursor.execute('''
        DELETE FROM poll_votes
        WHERE user_id = ? AND option_id IN (
            SELECT id FROM poll_options WHERE poll_id = 'poll-settimanale'
        )
    ''', (user_id,))

    # Inserisci i nuovi voti per i giorni scelti
    for opt_id in req.optionIds:
        vote_id = f"pv-{user_id}-{opt_id}"
        cursor.execute('''
            INSERT OR IGNORE INTO poll_votes (id, option_id, user_id)
            VALUES (?, ?, ?)
        ''', (vote_id, opt_id, user_id))

    conn.commit()
    conn.close()
    return {"success": True}

# ==============================================================================
# SPOGLIATOIO & CARTE (SOLO PERSONE REALI REGISTRATE)
# ==============================================================================

@app.get("/api/players")
def list_players():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.id, u.email, u.full_name, u.nickname, u.avatar_url,
               c.id as card_id, c.preferred_position, c.stat_attack, c.stat_defense,
               c.stat_goalkeeper, c.overall, c.tier, c.matches_played, c.matches_won, c.mvp_awards
        FROM users u
        JOIN player_cards c ON u.id = c.user_id
        ORDER BY c.overall DESC, c.matches_won DESC
    ''')
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "email": r["email"],
            "fullName": r["full_name"],
            "nickname": r["nickname"] or r["full_name"],
            "avatarUrl": r["avatar_url"],
            "card": {
                "id": r["card_id"],
                "preferredPosition": r["preferred_position"],
                "attack": r["stat_attack"],
                "defense": r["stat_defense"],
                "goalkeeper": r["stat_goalkeeper"],
                "overall": r["overall"],
                "tier": r["tier"],
                "matchesPlayed": r["matches_played"],
                "matchesWon": r["matches_won"],
                "mvpAwards": r["mvp_awards"],
            }
        })
    return result

# ==============================================================================
# ALGORITMO DI BILANCIAMENTO SQUADRE
# ==============================================================================

@app.post("/api/matches/generate")
def balance_match(req: BalanceRequest):
    if len(req.playerIds) < 2 or len(req.playerIds) % 2 != 0:
        raise HTTPException(status_code=400, detail="Seleziona un numero pari di giocatori (es. 10 per calcetto 5 vs 5).")

    conn = get_db()
    cursor = conn.cursor()
    placeholders = ",".join("?" * len(req.playerIds))
    cursor.execute(f'''
        SELECT u.id, u.full_name, u.nickname,
               c.preferred_position, c.stat_attack, c.stat_defense,
               c.stat_goalkeeper, c.overall, c.tier
        FROM users u
        JOIN player_cards c ON u.id = c.user_id
        WHERE u.id IN ({placeholders})
    ''', req.playerIds)
    players = [dict(r) for r in cursor.fetchall()]
    conn.close()

    half = len(players) // 2
    all_combos = list(itertools.combinations(players, half))
    eval_count = len(all_combos) // 2 if len(all_combos) > 1 else 1

    best_team_a = None
    best_team_b = None
    lowest_cost = float('inf')

    for i in range(eval_count):
        team_a = all_combos[i]
        team_a_ids = {p['id'] for p in team_a}
        team_b = [p for p in players if p['id'] not in team_a_ids]

        ovr_a = sum(p['overall'] for p in team_a) / half
        ovr_b = sum(p['overall'] for p in team_b) / half

        best_gk_a = max(p['stat_goalkeeper'] for p in team_a)
        best_gk_b = max(p['stat_goalkeeper'] for p in team_b)

        atk_a = sum(1 for p in team_a if p['preferred_position'] == 'ATTACCANTE')
        atk_b = sum(1 for p in team_b if p['preferred_position'] == 'ATTACCANTE')

        gk_a = sum(1 for p in team_a if p['preferred_position'] == 'PORTIERE')
        gk_b = sum(1 for p in team_b if p['preferred_position'] == 'PORTIERE')

        delta_ovr = abs(ovr_a - ovr_b)
        delta_gk = abs(best_gk_a - best_gk_b)
        delta_atk = abs(atk_a - atk_b)
        keeper_penalty = 50.0 if (gk_a > 1 or gk_b > 1) else 0.0

        cost = (delta_ovr * 3.5) + (delta_gk * 0.4) + (delta_atk * 4.0) + keeper_penalty

        if cost < lowest_cost:
            lowest_cost = cost
            best_team_a = team_a
            best_team_b = team_b

    ovr_a = round(sum(p['overall'] for p in best_team_a) / half, 1)
    ovr_b = round(sum(p['overall'] for p in best_team_b) / half, 1)
    diff = ovr_a - ovr_b

    prob_a = round(1.0 / (1.0 + 10 ** (-diff / 18.0)) * 100, 1)
    prob_a = max(25.0, min(75.0, prob_a))
    prob_b = round(100.0 - prob_a, 1)

    fairness = max(0, min(100, round(100.0 - lowest_cost)))

    return {
        "teamA": best_team_a,
        "teamB": best_team_b,
        "teamAOverall": ovr_a,
        "teamBOverall": ovr_b,
        "winProbabilityA": prob_a,
        "winProbabilityB": prob_b,
        "overallDelta": round(abs(ovr_a - ovr_b), 1),
        "balanceFairness": fairness,
    }

# ==============================================================================
# PAGELLE & AGGIORNAMENTO DINAMICO
# ==============================================================================

@app.post("/api/matches/submit-ratings")
def submit_ratings(req: SubmitRatingsRequest, current_user: dict = Depends(require_current_user)):
    voter_id = current_user['id']

    # Vietato votare se stessi
    for r in req.ratings:
        if r.ratedPlayerId == voter_id:
            raise HTTPException(status_code=400, detail="Non puoi votare te stesso nelle pagelle!")

    conn = get_db()
    cursor = conn.cursor()

    team_a_won = req.scoreTeamA > req.scoreTeamB
    team_b_won = req.scoreTeamB > req.scoreTeamA
    is_draw = req.scoreTeamA == req.scoreTeamB
    team_a_set = set(req.teamAPlayerIds)

    for r in req.ratings:
        rating_id = f"rat-{voter_id}-{r.ratedPlayerId}-{int(datetime.now().timestamp())}"
        try:
            cursor.execute('''
                INSERT INTO match_ratings (id, match_id, voter_id, rated_player_id, rating_attack, rating_defense, rating_goalkeeper, comment)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (rating_id, req.matchId, voter_id, r.ratedPlayerId, r.ratingAttack, r.ratingDefense, r.ratingGoalkeeper, r.comment))
        except sqlite3.IntegrityError:
            pass

    all_players = set(req.teamAPlayerIds + req.teamBPlayerIds)
    updated_players = []

    for p_id in all_players:
        cursor.execute('''
            SELECT AVG(rating_attack) as avg_atk, AVG(rating_defense) as avg_def, AVG(rating_goalkeeper) as avg_gk, COUNT(*) as cnt
            FROM match_ratings
            WHERE rated_player_id = ?
        ''', (p_id,))
        stats = cursor.fetchone()

        cursor.execute('SELECT * FROM player_cards WHERE user_id = ?', (p_id,))
        card = cursor.fetchone()
        if not card:
            continue

        is_winner = team_a_won if p_id in team_a_set else team_b_won
        win_bonus = 0.5 if is_winner else (0.0 if is_draw else -0.2)

        if stats and stats['cnt'] > 0:
            avg_atk = stats['avg_atk']
            avg_def = stats['avg_def']
            avg_gk = stats['avg_gk']

            delta_atk = max(-4, min(4, round((avg_atk - 6.5) * 1.25 + win_bonus)))
            delta_def = max(-4, min(4, round((avg_def - 6.5) * 1.25 + win_bonus)))
            delta_gk = max(-4, min(4, round((avg_gk - 6.5) * 1.25 + win_bonus)))

            new_atk = max(1, min(99, card['stat_attack'] + delta_atk))
            new_def = max(1, min(99, card['stat_defense'] + delta_def))
            new_gk = max(1, min(99, card['stat_goalkeeper'] + delta_gk))

            new_ovr = calculate_overall(new_atk, new_def, new_gk, card['preferred_position'])
            new_tier = calculate_tier(new_ovr)

            cursor.execute('''
                UPDATE player_cards
                SET stat_attack = ?, stat_defense = ?, stat_goalkeeper = ?,
                    overall = ?, tier = ?, matches_played = matches_played + 1,
                    matches_won = matches_won + ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            ''', (new_atk, new_def, new_gk, new_ovr, new_tier, 1 if is_winner else 0, p_id))

            updated_players.append({
                "userId": p_id,
                "newOverall": new_ovr,
                "newTier": new_tier,
                "delta": new_ovr - card['overall']
            })

    cursor.execute('''
        INSERT INTO matches (id, status, score_team_a, score_team_b)
        VALUES (?, 'COMPLETED', ?, ?)
    ''', (req.matchId, req.scoreTeamA, req.scoreTeamB))

    conn.commit()
    conn.close()

    return {"success": True, "updatedPlayers": updated_players}

# ==============================================================================
# CLASSIFICA
# ==============================================================================

@app.get("/api/leaderboard")
def get_leaderboard():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.id, u.full_name, u.nickname, c.overall, c.tier,
               c.preferred_position, c.matches_played, c.matches_won, c.mvp_awards
        FROM users u
        JOIN player_cards c ON u.id = c.user_id
        ORDER BY c.overall DESC, c.matches_won DESC
    ''')
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

# ==============================================================================
# FRONTEND HTML
# ==============================================================================

@app.get("/", response_class=HTMLResponse)
def serve_index():
    index_html_path = os.path.join(os.path.dirname(__file__), 'public', 'index.html')
    if os.path.exists(index_html_path):
        with open(index_html_path, 'r', encoding='utf-8') as f:
            return f.read()
    return "<h1>Calcetto FUT Manager in esecuzione</h1>"

if __name__ == "__main__":
    init_db()
    clear_fake_demo_users()
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
