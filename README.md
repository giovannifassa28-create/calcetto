# ⚽ Calcetto Manager & Fanta-Calcetto Real-Life

Applicazione Web Mobile-First in stile videogioco sportivo (FUT / EA Sports FC) per la gestione delle partite di calcetto settimanali tra amici con algoritmo di bilanciamento matematico, predittore di vittoria e sistema di pagelle peer-to-peer con sicurezza database (RLS).

---

## 🏗️ Architettura & Stack Tecnologico

- **Frontend**: Next.js 14+ (App Router) / React, Tailwind CSS, Lucide Icons, TypeScript
- **Backend & Database**: Supabase (PostgreSQL, Realtime, Row Level Security, RPC Security Definer Functions)
- **UI/UX Theme**: Dark Mode nativo con accenti Neon Green `#22c55e`, schede Bronzo, Argento, Oro in base all'Overall.

---

## 🛡️ La "Regola d'Oro" e la Sicurezza (PostgreSQL & RLS)

Per garantire l'integrità del gioco ed evitare che gli utenti gonfino le proprie statistiche o si autovotino, la sicurezza è imposta a **doppio livello** (Database CHECK Constraints + Row Level Security Policies):

1. **Impossibile modificare la propria carta**:
   ```sql
   CREATE POLICY "Gli altri amici possono aggiornare la carta, MAI l'utente stesso"
   ON player_cards FOR UPDATE TO authenticated
   USING (auth.uid() <> user_id)
   WITH CHECK (auth.uid() <> user_id);
   ```

2. **Impossibile votare se stessi nelle pagelle**:
   ```sql
   -- Vincolo relazionale a livello di tabella:
   CONSTRAINT cannot_vote_self CHECK (voter_id <> rated_player_id)
   
   -- Policy RLS per verificare identità e divieto:
   CREATE POLICY "Inserimento pagella: vietato autovoto ed identità verificata"
   ON match_ratings FOR INSERT TO authenticated
   WITH CHECK (
       auth.uid() = voter_id AND
       voter_id <> rated_player_id
   );
   ```

---

## 🧠 Algoritmo di Bilanciamento & Predittore di Vittoria (`src/lib/balancer.ts`)

Per 10 giocatori (5 vs 5 standard), il numero di partizioni possibili è esatto:
$$\frac{1}{2} \binom{10}{5} = 126 \text{ combinazioni}$$

L'algoritmo calcola in meno di **1 millisecondo** l'ottimo globale minimizzando una funzione di costo multiobiettivo:

$$Cost = 3.5 \cdot |\Delta OVR| + 0.35 \cdot |\Delta GK| + 0.8 \cdot |\Delta ATK| + 0.8 \cdot |\Delta DEF| + 4.0 \cdot |\Delta Ruoli| + Penalty_{GK}$$

- **Gestione Portieri**: Se sono presenti 2 portieri, vengono rigorosamente divisi in squadre opposte. Se c'è 1 solo portiere, l'altra squadra riceve il miglior giocatore con statistica di porta più elevata e viene compensata con un overall di movimento leggermente superiore.
- **Predittore di Vittoria**: Utilizza un modello logistico calibrato (derivato da Elo) combinato con la sinergia dei ruoli per assegnare la percentuale di vittoria a Squadra A e Squadra B.

---

## ⭐ Motore di Aggiornamento Dinamico delle Carte (`src/lib/rating-engine.ts`)

I voti post-partita (1.0 - 10.0) aggiornano dinamicamente le carte (1 - 99):

$$\Delta S = \text{Clamp}(K \cdot (V_{medio} - 6.5) + \text{BonusVittoria}, -4.0, +4.0)$$

- **Benchmark 6.5**: Voti pari a 6.5 mantengono le statistiche stabili.
- **Voti > 6.5**: Fanno crescere il giocatore (+1, +2, +3 punti).
- **Voti < 6.5**: Fanno calare la forma (-1, -2 punti).
- **Bonus Risultato**: +0.5 se la squadra ha vinto, -0.2 se ha perso.
- **Ricalcolo Overall Pesato**:
  - Attaccante: $55\% \text{ ATT} + 35\% \text{ DIF} + 10\% \text{ POR}$
  - Difensore: $30\% \text{ ATT} + 60\% \text{ DIF} + 10\% \text{ POR}$
  - Portiere: $10\% \text{ ATT} + 20\% \text{ DIF} + 70\% \text{ POR}$
  - Universale: $45\% \text{ ATT} + 45\% \text{ DIF} + 10\% \text{ POR}$
- **Tier FUT**:
  - 🥉 **Bronzo**: Overall $\le 69$
  - 🥈 **Argento**: Overall $70 - 84$
  - 🥇 **Oro**: Overall $\ge 85$
