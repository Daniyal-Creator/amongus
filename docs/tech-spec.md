# Spesifikasi Teknis — CodeMole (Among Us for Coders)

> **Versi:** 1.0.0  
> **Tanggal:** April 2026  
> **Status:** Draft

---

## Daftar Isi

1. [Gambaran Umum Proyek](#1-gambaran-umum-proyek)
2. [Fitur Inti](#2-fitur-inti)
3. [Alur Pengguna (User Flow)](#3-alur-pengguna-user-flow)
4. [Arsitektur Sistem](#4-arsitektur-sistem)
5. [Struktur Direktori](#5-struktur-direktori)
6. [Skema Database](#6-skema-database)
7. [Spesifikasi API](#7-spesifikasi-api)
8. [Stack Teknologi](#8-stack-teknologi)
9. [Integrasi AI](#9-integrasi-ai)
10. [Keamanan & Validasi](#10-keamanan--validasi)
11. [Alur Permainan (Game Flow)](#11-alur-permainan-game-flow)

---

## 1. Gambaran Umum Proyek

**CodeMole** adalah permainan social deduction berbasis coding yang terinspirasi dari Among Us. Pemain dibagi menjadi dua kelompok — **Civilian** dan **Imposter** — di dalam sebuah sesi coding kolaboratif real-time. Civilian berusaha menyelesaikan tantangan kode, sementara Imposter berusaha menyabotase pekerjaan mereka secara tersembunyi.

### Tujuan Utama
- Platform game edukatif berbasis kompetisi coding
- Mendorong pemahaman kode, code review, dan social deduction
- Desain gaya retro/pixel art — minimalis dan fungsional

### Target Pengguna
- Mahasiswa dan developer junior yang ingin mengasah skill coding
- Komunitas kompetisi pemrograman

---

## 2. Fitur Inti

### 2.1 Sistem Lobby & Role

| Fitur | Deskripsi |
|---|---|
| Buat Lobby | Host membuat lobby dan mendapatkan kode unik 6 karakter |
| Gabung Lobby | Pemain lain bergabung lewat kode lobby |
| Distribusi Role | Sistem secara acak menetapkan 1 Imposter dan 3 Civilian |
| Pemilihan Kategori | Pemain melakukan vote untuk memilih kategori soal |

**Kategori Soal yang Didukung:**
- Data Structures & Algorithms (DSA)
- Object-Oriented Programming (OOP)
- Web Development (HTML, CSS, JavaScript)
- etc

### 2.2 Live Collaborative Code Editor

- Editor kode real-time berbasis WebSocket (Operational Transformation / CRDT)
- Setiap pemain dibedakan dengan warna yang berbeda
- Syntax highlighting sesuai bahasa yang dipilih
- Tampilan live preview output / terminal

### 2.3 Sistem Round

- **Total: 4 Round** per sesi permainan
- Setiap round memiliki tantangan kode baru
- Permainan berakhir lebih awal jika Imposter menang
- Kondisi akhir permainan:
  - **Imposter menang:** Berhasil menyabotase sebelum round ke-4 selesai
  - **Civilian menang:** Bertahan hingga round ke-4 dan mengidentifikasi Imposter, kalo civilian menang sampai 4 round imposter automatis kalah

### 2.4 Tugas Civilian

- Mengerjakan test cases yang harus diimplementasikan
- Memperbaiki broken code atau melengkapi fungsi yang belum selesai
- Ai copilot untuk membantu mengerjakan task
- Menjalankan **Security Scanner Task** (setara MedBay di Among Us):
  - Scan kode terhadap kerentanan yang di-inject Imposter
  - Mendapatkan badge visual **"Verified Developer"** jika berhasil

### 2.5 Tugas Imposter

- Memiliki **5 sabotage charges** per sesi
- Teknik sabotage:
  - Merusak fungsi yang sudah ada
  - Copilot Poisoning: Imposter bisa "meracuni" AI Assistant yang digunakan civilian agar memberikan saran kode yang sedikit salah atau tidak efisien kepada Civilian.
  - Mengubah logika di bagian kode yang sedang dikerjakan Civilian
  - Menggunakan **AI Sabotage Co-Pilot** untuk menyisipkan bug yang halus (contoh: mengganti strict equality `===` menjadi loose `==`, mengubah urutan parameter)

### 2.6 Chat & Social Deduction

- Fitur chat antar pemain (in-game messaging)
- **Emergency Meeting**: Pemain dapat memicu meeting darurat untuk berdiskusi dan voting
- **Emergency Code Review**: Saat meeting dipicu, sistem menampilkan snippet kode yang paling sering diubah sebelum tombol meeting ditekan, sebagai bahan diskusi

### 2.7 Sistem AI

| Fitur AI | Peran | Target |
|---|---|---|
| AI Sabotage Co-Pilot ("Ghost in the Code") | Menyarankan bug yang tidak terdeteksi linter | Imposter |
| Copilot untuk Civilian | Membantu Civilian dengan saran kode yang valid | Civilian |
| Copilot Poisoning | Imposter dapat "meracuni" AI agar memberikan saran kode yang salah | Civilian (dirugikan) |
| Security Scanner | Mendeteksi kerentanan yang di-inject Imposter | Civilian |
| AI Code Review Post-Game | Memberikan "Refactoring Report" setelah permainan selesai | Semua Pemain |

### 2.8 Leaderboard & Sistem Ranking

- **Tournament & Leaderboard System:** Ranking mingguan per kategori bahasa pemrograman (contoh: "Top 10 Java Developers of the Week")
- **Wall of Shame & Hall of Fame:** Leaderboard yang mencatat achievement unik seperti:
  - "Most Elegant Fix"
  - "Most Subtle Bug"

---

## 3. Alur Pengguna (User Flow)

```
[Pengguna Membuka App]
        |
        v
[Halaman Utama / Landing]
        |
   +---------+
   |         |
[Buat      [Gabung
 Lobby]     Lobby]
   |         |
   v         v
[Lobby Room - Menunggu Pemain]
        |
        v
[Vote Kategori Soal]
        |
        v
[Role Distribution (Acak)]
        |
        v
[Round 1 Dimulai]
        |
   +----+----+
   |         |
[Civilian] [Imposter]
   |         |
[Kerjakan  [Sabotase
 Task]      Kode]
   |         |
   +---------+
        |
        v
[Emergency Meeting? -- Ya --> [Vote & Eject Pemain]
        |                              |
        v                      (Kembali ke Round)
[Round Selesai?]
        |
   +----+----+
   |         |
[Round 4   [Round < 4 &
 Selesai]   Imposter
   |        Belum Menang]
   v         |
[End Game]  [Round Berikutnya]
   |
   v
[AI Refactoring Report]
   |
   v
[Leaderboard Update]
```

### 3.1 Alur Pembuatan Lobby

1. Host mengklik "Buat Lobby"
2. Sistem generate kode lobby unik (6 karakter)
3. Host membagikan kode ke pemain lain
4. Pemain lain bergabung menggunakan kode
5. Host memulai game ketika semua pemain siap (minimal 4 pemain)

### 3.2 Alur Voting Kategori

1. Seluruh pemain melihat pilihan kategori soal
2. Setiap pemain memberikan 1 suara
3. Kategori dengan suara terbanyak dipilih
4. Jika seri, sistem memilih secara acak

### 3.3 Alur Round

1. Soal/challenge ditampilkan ke semua pemain
2. Civilian mengerjakan task di live editor
3. Imposter berusaha menyabotase secara halus
4. Salah satu pemain dapat memicu Emergency Meeting
5. Jika meeting: diskusi → voting → pemain ter-vote terbanyak di-eject
6. Round selesai jika waktu habis atau kondisi kemenangan terpenuhi

---

## 4. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  React / Next.js + TypeScript                               │
│  - Live Code Editor (Monaco Editor / CodeMirror)            │
│  - Game UI (Retro/Pixel Art Style)                          │
│  - WebSocket Client                                          │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP / WebSocket
┌────────────────────────▼────────────────────────────────────┐
│                        BACKEND                              │
│  Node.js / Express atau Fastify + TypeScript                │
│  - REST API (Auth, Lobby, Leaderboard)                      │
│  - WebSocket Server (Game State, Chat, Editor Sync)         │
│  - AI Integration Layer (OpenAI / Gemini API)               │
└──────┬────────────────────────────────────────┬─────────────┘
       │                                        │
┌──────▼──────────┐                 ┌───────────▼────────────┐
│   PostgreSQL    │                 │        Redis           │
│  (Data Utama)   │                 │  (Session, Game State, │
│                 │                 │   Rate Limiting)       │
└─────────────────┘                 └────────────────────────┘
```

---

## 5. Struktur Direktori

```
amongus-coder/
├── docs/
│   ├── sum.md               # Ringkasan fitur game
│   └── tech-spec.md         # Dokumen ini
│
├── frontend/
│   ├── public/
│   │   └── assets/          # Aset pixel art, icon
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   │   ├── page.tsx             # Landing / Home
│   │   │   ├── lobby/
│   │   │   │   ├── create/page.tsx  # Buat lobby
│   │   │   │   └── [code]/page.tsx  # Ruang lobby
│   │   │   └── game/
│   │   │       └── [sessionId]/
│   │   │           └── page.tsx     # Halaman game utama
│   │   ├── components/
│   │   │   ├── editor/
│   │   │   │   ├── CodeEditor.tsx   # Live collaborative editor
│   │   │   │   └── CursorOverlay.tsx
│   │   │   ├── game/
│   │   │   │   ├── RoleReveal.tsx
│   │   │   │   ├── TaskPanel.tsx
│   │   │   │   ├── SabotagePanel.tsx
│   │   │   │   └── EmergencyMeeting.tsx
│   │   │   ├── chat/
│   │   │   │   └── ChatBox.tsx
│   │   │   ├── leaderboard/
│   │   │   │   └── Leaderboard.tsx
│   │   │   └── ui/              # Komponen UI reusable
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useGameState.ts
│   │   │   └── useEditor.ts
│   │   ├── lib/
│   │   │   ├── api.ts           # HTTP client
│   │   │   └── socket.ts        # WebSocket client
│   │   ├── store/               # State management (Zustand)
│   │   │   ├── gameStore.ts
│   │   │   └── userStore.ts
│   │   └── types/
│   │       └── index.ts         # TypeScript types & interfaces
│   ├── package.json
│   └── tsconfig.json
│
└── backend/
    ├── src/
    │   ├── config/
    │   │   ├── database.ts      # Konfigurasi PostgreSQL
    │   │   └── redis.ts         # Konfigurasi Redis
    │   ├── controllers/
    │   │   ├── authController.ts
    │   │   ├── lobbyController.ts
    │   │   ├── gameController.ts
    │   │   └── leaderboardController.ts
    │   ├── services/
    │   │   ├── aiService.ts         # Integrasi AI (OpenAI/Gemini)
    │   │   ├── gameService.ts       # Logika game utama
    │   │   ├── codeExecutionService.ts  # Eksekusi kode (sandbox)
    │   │   └── leaderboardService.ts
    │   ├── socket/
    │   │   ├── gameSocketHandler.ts # Handler WebSocket game
    │   │   ├── editorSocketHandler.ts # Handler sync editor
    │   │   └── chatSocketHandler.ts
    │   ├── models/
    │   │   ├── User.ts
    │   │   ├── Lobby.ts
    │   │   ├── GameSession.ts
    │   │   └── Leaderboard.ts
    │   ├── routes/
    │   │   ├── auth.ts
    │   │   ├── lobby.ts
    │   │   ├── game.ts
    │   │   └── leaderboard.ts
    │   ├── middleware/
    │   │   ├── authMiddleware.ts
    │   │   └── rateLimiter.ts
    │   └── index.ts             # Entry point server
    ├── package.json
    └── tsconfig.json
```

---

## 6. Skema Database

### 6.1 Tabel `users`

```sql
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    VARCHAR(50)  NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar_color VARCHAR(7)  NOT NULL DEFAULT '#00FF41', -- Warna kursor di editor
    total_wins  INTEGER      NOT NULL DEFAULT 0,
    total_games INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### 6.2 Tabel `lobbies`

```sql
CREATE TABLE lobbies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(6)   NOT NULL UNIQUE,    -- Kode lobby 6 karakter
    host_id     UUID         NOT NULL REFERENCES users(id),
    status      VARCHAR(20)  NOT NULL DEFAULT 'waiting',
                             -- waiting | category_vote | in_progress | finished
    category    VARCHAR(50),                     -- Kategori yang terpilih
    max_players INTEGER      NOT NULL DEFAULT 4,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### 6.3 Tabel `lobby_players`

```sql
CREATE TABLE lobby_players (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id    UUID         NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL REFERENCES users(id),
    role        VARCHAR(20),                     -- civilian | imposter (diisi saat game dimulai)
    is_ejected  BOOLEAN      NOT NULL DEFAULT FALSE,
    is_ready    BOOLEAN      NOT NULL DEFAULT FALSE,
    joined_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(lobby_id, user_id)
);
```

### 6.4 Tabel `game_sessions`

```sql
CREATE TABLE game_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id        UUID         NOT NULL REFERENCES lobbies(id),
    category        VARCHAR(50)  NOT NULL,
    current_round   INTEGER      NOT NULL DEFAULT 1,
    max_rounds      INTEGER      NOT NULL DEFAULT 4,
    winner_role     VARCHAR(20),                 -- civilian | imposter (diisi saat game berakhir)
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
                                 -- active | meeting | finished
    started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ
);
```

### 6.5 Tabel `rounds`

```sql
CREATE TABLE rounds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_session_id UUID         NOT NULL REFERENCES game_sessions(id),
    round_number    INTEGER      NOT NULL,
    challenge_id    UUID         NOT NULL REFERENCES challenges(id),
    initial_code    TEXT         NOT NULL,  -- Kode awal yang diberikan ke pemain
    final_code      TEXT,                   -- Kode akhir di akhir round
    started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    UNIQUE(game_session_id, round_number)
);
```

### 6.6 Tabel `challenges`

```sql
CREATE TABLE challenges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        VARCHAR(50)  NOT NULL,       -- DSA | OOP
    language        VARCHAR(30)  NOT NULL,        -- javascript | python | java
    title           VARCHAR(255) NOT NULL,
    description     TEXT         NOT NULL,
    initial_code    TEXT         NOT NULL,        -- Template kode awal
    test_cases      JSONB        NOT NULL,        -- Array test case { input, expected_output }
    difficulty      VARCHAR(20)  NOT NULL DEFAULT 'medium',
                                 -- easy | medium | hard
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

**Contoh `test_cases` JSONB:**
```json
[
    { "input": "[1, 2, 3]", "expected_output": "6" },
    { "input": "[0, -1, 5]", "expected_output": "4" }
]
```

### 6.7 Tabel `sabotage_logs`

```sql
CREATE TABLE sabotage_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_session_id UUID         NOT NULL REFERENCES game_sessions(id),
    round_id        UUID         NOT NULL REFERENCES rounds(id),
    imposter_id     UUID         NOT NULL REFERENCES users(id),
    sabotage_type   VARCHAR(50)  NOT NULL,
                    -- code_mutation | ai_poisoning | function_break
    description     TEXT,                        -- Deskripsi sabotase yang dilakukan
    detected        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### 6.8 Tabel `votes`

```sql
CREATE TABLE votes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_session_id UUID         NOT NULL REFERENCES game_sessions(id),
    voter_id        UUID         NOT NULL REFERENCES users(id),
    voted_for_id    UUID         NOT NULL REFERENCES users(id),
    round_number    INTEGER      NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(game_session_id, voter_id, round_number)
);
```

### 6.9 Tabel `leaderboard`

```sql
CREATE TABLE leaderboard (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users(id),
    category        VARCHAR(50)  NOT NULL,       -- DSA | OOP | global
    week_start      DATE         NOT NULL,
    wins_as_civilian INTEGER     NOT NULL DEFAULT 0,
    wins_as_imposter INTEGER     NOT NULL DEFAULT 0,
    elegant_fixes   INTEGER      NOT NULL DEFAULT 0,
    subtle_bugs     INTEGER      NOT NULL DEFAULT 0,
    score           INTEGER      NOT NULL DEFAULT 0,
    UNIQUE(user_id, category, week_start)
);
```

### 6.10 Tabel `game_reviews` (Post-Game AI Report)

```sql
CREATE TABLE game_reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_session_id UUID         NOT NULL REFERENCES game_sessions(id) UNIQUE,
    ai_report       JSONB        NOT NULL,
    -- Struktur: { summary, refactoring_suggestions[], code_quality_score, player_reviews[] }
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

**Contoh `ai_report` JSONB:**
```json
{
    "summary": "Sesi permainan kompetitif dengan sabotase halus terdeteksi",
    "code_quality_score": 72,
    "refactoring_suggestions": [
        {
            "player_id": "uuid-xxx",
            "original_code": "...",
            "suggested_code": "...",
            "reason": "Gunakan Array.reduce() untuk kode yang lebih bersih"
        }
    ],
    "player_reviews": [
        {
            "player_id": "uuid-xxx",
            "achievement": "Most Elegant Fix",
            "notes": "Penyelesaian fungsi rekursif sangat efisien"
        }
    ]
}
```

---

## 7. Spesifikasi API

### 7.1 Auth

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/auth/register` | Registrasi pengguna baru |
| `POST` | `/api/auth/login` | Login, mengembalikan JWT token |
| `POST` | `/api/auth/logout` | Logout & invalidasi session |

### 7.2 Lobby

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/lobby/create` | Membuat lobby baru |
| `POST` | `/api/lobby/join` | Bergabung ke lobby via kode |
| `GET` | `/api/lobby/:code` | Mendapatkan info lobby |
| `POST` | `/api/lobby/:code/ready` | Set status siap (ready) |
| `POST` | `/api/lobby/:code/vote-category` | Submit vote kategori soal |
| `POST` | `/api/lobby/:code/start` | Host memulai game |

### 7.3 Game

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/game/:sessionId` | Mendapatkan state game saat ini |
| `POST` | `/api/game/:sessionId/sabotage` | Imposter menggunakan sabotage charge |
| `POST` | `/api/game/:sessionId/emergency-meeting` | Memicu emergency meeting |
| `POST` | `/api/game/:sessionId/vote` | Submit vote untuk eject pemain |
| `GET` | `/api/game/:sessionId/review` | Mendapatkan AI post-game review |

### 7.4 Leaderboard

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/leaderboard` | Global leaderboard minggu ini |
| `GET` | `/api/leaderboard/:category` | Leaderboard per kategori |
| `GET` | `/api/leaderboard/hall-of-fame` | Hall of Fame & Wall of Shame |

### 7.5 WebSocket Events

**Client → Server:**

| Event | Payload | Deskripsi |
|---|---|---|
| `editor:change` | `{ delta, cursorPos }` | Perubahan kode di editor |
| `chat:message` | `{ message }` | Kirim pesan chat |
| `game:sabotage` | `{ sabotageType, targetLine }` | Imposter mengeksekusi sabotase |
| `game:scan` | `{}` | Civilian menjalankan Security Scanner |
| `game:emergency` | `{}` | Memicu Emergency Meeting |
| `game:vote` | `{ targetUserId }` | Submit vote di meeting |

**Server → Client:**

| Event | Payload | Deskripsi |
|---|---|---|
| `editor:update` | `{ delta, userId, cursorPos }` | Broadcast perubahan editor |
| `chat:broadcast` | `{ userId, message, timestamp }` | Broadcast pesan chat |
| `game:state` | `{ round, status, players }` | Update state game |
| `game:meeting-start` | `{ codeSnapshot }` | Meeting dimulai + snapshot kode |
| `game:eject` | `{ ejectedUserId, role }` | Pemain di-eject |
| `game:round-end` | `{ winner, nextRound }` | Round berakhir |
| `game:end` | `{ winner, reviewId }` | Game berakhir |

---

## 8. Stack Teknologi

### Frontend

| Teknologi | Kegunaan |
|---|---|
| **Next.js 15 / React 19** | Framework utama, App Router |
| **TypeScript** | Type safety |
| **Monaco Editor / CodeMirror 6** | Live collaborative code editor |
| **Socket.io Client** | WebSocket real-time |
| **Zustand** | State management global |
| **Tailwind CSS** | Styling utility-first |
| **Framer Motion** | Animasi UI |

### Backend

| Teknologi | Kegunaan |
|---|---|
| **Node.js + Fastify** | Server HTTP berkinerja tinggi |
| **TypeScript** | Type safety |
| **Socket.io** | WebSocket server |
| **PostgreSQL** | Database relasional utama |
| **Redis** | Session, game state cache, rate limit |
| **Prisma ORM** | Database query & migrations |
| **Docker** | Containerisasi code execution (sandbox) |

### AI & External Services

| Teknologi | Kegunaan |
|---|---|
| **Google Gemini API** | AI Sabotage Co-Pilot, AI Code Review |
| **OpenAI API (fallback)** | Cadangan jika Gemini tidak tersedia |
| **Judge0 / Piston API** | Eksekusi kode aman di sandbox |

---

## 9. Integrasi AI

### 9.1 AI Sabotage Co-Pilot (untuk Imposter)

**Endpoint:** `POST /api/ai/sabotage-suggest`

**Input:**
```json
{
    "code": "string",    // Kode saat ini di editor
    "language": "javascript",
    "difficulty": "subtle" // subtle | obvious
}
```

**Output:**
```json
{
    "suggestion": "string",     // Bug yang disarankan untuk disisipkan
    "mutated_code": "string",   // Kode yang sudah dimutasi
    "bug_description": "string" // Deskripsi bug (hanya untuk Imposter)
}
```

**Contoh Teknik Sabotase yang Dihasilkan AI:**
- Mengganti `===` menjadi `==` (strict vs loose equality)
- Mengubah urutan parameter di fungsi helper
- Mengganti `>` menjadi `>=` di kondisi loop (off-by-one error)
- Mengubah `return` menjadi `return null` di edge case

### 9.2 Copilot Poisoning (untuk Imposter)

Imposter dapat mengaktifkan "poisoning mode" yang menyebabkan AI assistant yang digunakan Civilian memberikan saran kode yang sedikit salah atau tidak efisien.

**Mekanisme:**
1. Imposter mengaktifkan Copilot Poisoning via `POST /api/ai/activate-poisoning`
2. Server menyimpan flag poisoning di Redis: `game:{sessionId}:poisoned = true`
3. Saat Civilian meminta saran AI, server memeriksa flag poisoning
4. Jika aktif, prompt AI dimodifikasi untuk menyertakan instruksi "subtle error"

### 9.3 AI Code Review Post-Game

**Trigger:** Otomatis dipanggil setelah `game:end`

**Proses:**
1. Server mengumpulkan seluruh riwayat perubahan kode dari round 1–4
2. Kode dikirimkan ke Gemini API dengan prompt review
3. Hasil review disimpan ke tabel `game_reviews`
4. Pemain dapat mengakses laporan via `GET /api/game/:sessionId/review`

---

## 10. Keamanan & Validasi

### 10.1 Eksekusi Kode (Sandbox)

- Kode pemain **tidak pernah dieksekusi langsung di server utama**
- Menggunakan **Judge0** atau **Piston API** sebagai sandboxed code runner
- Batasan: timeout 5 detik, memory 128MB, tidak ada akses file/network

### 10.2 WebSocket Authentication

- Token JWT diverifikasi pada saat handshake WebSocket
- Event sabotase divalidasi: hanya pemain dengan role `imposter` yang dapat mengirim event sabotase

### 10.3 Rate Limiting

- Chat: maksimal 10 pesan per 10 detik per pemain
- AI request: maksimal 5 request per menit per pemain
- Sabotage: maksimal 5 kali per sesi game (sesuai aturan)

### 10.4 Validasi Role di Server

- Semua aksi sensitif (sabotage, AI poisoning) divalidasi di sisi server
- Klien **tidak dipercaya** untuk melaporkan role-nya sendiri
- Role disimpan secara aman di Redis dan database, tidak dikirimkan ke klien lain

---

## 11. Alur Permainan (Game Flow)

### 11.1 State Machine Game

```
WAITING
  └─> CATEGORY_VOTE (setelah semua pemain ready)
        └─> ROLE_DISTRIBUTION (setelah voting selesai)
              └─> ROUND_ACTIVE (round dimulai)
                    ├─> EMERGENCY_MEETING (pemain memicu meeting)
                    │     └─> VOTE_RESULT → ROUND_ACTIVE atau GAME_END
                    └─> ROUND_END
                          ├─> GAME_END (imposter menang / round ke-4 selesai)
                          │     └─> POST_GAME_REVIEW
                          └─> ROUND_ACTIVE (round berikutnya)
```

### 11.2 Kondisi Kemenangan

| Kondisi | Pemenang |
|---|---|
| Civilian berhasil eject Imposter via voting | Civilian |
| Civilian menyelesaikan semua 4 round tanpa Imposter menang | Civilian |
| Imposter menggunakan 5 sabotage dan tidak terdeteksi hingga akhir | Imposter |
| Semua Civilian di-eject (termasuk yang salah di-vote) | Imposter |

### 11.3 Perhitungan Skor

```
Skor Dasar Menang: +100 poin
Skor Per Round Selesai (Civilian): +20 poin/round
Skor Sabotase Berhasil (Imposter): +30 poin/sabotase
Skor Deteksi Sabotase (Security Scanner): +15 poin
Achievement "Most Elegant Fix": +50 poin bonus
Achievement "Most Subtle Bug": +50 poin bonus
```

---

*Dokumen ini adalah living document dan akan diperbarui seiring perkembangan proyek.*
