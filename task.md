# Analisis Fitur: Docs vs Codebase

Dokumen ini membandingkan fitur-fitur yang tercantum di `docs/tech-spec.md` dan `docs/sum.md` dengan implementasi yang ada di codebase saat ini.

---

## Ringkasan Status

| Status | Jumlah |
|--------|--------|
| ✅ Selesai (Fully Implemented) | 13 |
| 🔄 Partial (Partially Implemented) | 6 |
| ❌ Belum Ada (Not Implemented) | 11 |

---

## ✅ Fitur yang Sudah Selesai (Fully Implemented)

### 1. Sistem Lobby & Role
- **Buat Lobby** - Host membuat lobby dan mendapatkan kode unik 6 karakter
- **Gabung Lobby** - Pemain lain bergabung lewat kode lobby
- **Distribusi Role** - Sistem secara acak menetapkan 1 Imposter dan 3 Civilian
- **Pemilihan Kategori** - Pemain melakukan vote untuk memilih kategori soal
- **Status Player** - Ready/Waiting, Host indicator

**Lokasi:**
- Backend: `backend/src/index.ts` (line ~1389-1738)
- Frontend: `frontend/src/components/lobby/LobbyRoomClient.tsx`

### 2. Live Collaborative Code Editor
- **Editor real-time** - Menggunakan CodeMirror
- **Warna pemain berbeda** - Setiap pemain dibedakan dengan warna cursor
- **Sinkronisasi** - via WebSocket

**Lokasi:**
- Backend: `backend/src/index.ts` (line ~1058-1080) - editor.update handler
- Frontend: `frontend/src/components/editor/CodeEditor.tsx`

### 3. Sistem Round
- **Total 4 Round** per sesi permainan
- **Kategori voting** - Setiap round memilih kategori baru
- **Timer** - countdown untuk voting dan playing phase

**Lokasi:**
- Backend: `backend/src/index.ts` (line ~764-925) - game logic

### 4. Tugas Civilian
- **Objectives panel** - Menampilkan task yang harus dikerjakan
- **Test cases** - Ditampilkan di challenge

**Lokasi:**
- Frontend: `frontend/src/components/game/GameSessionClient.tsx` (line ~243-261)

### 5. Tugas Imposter
- **5 sabotage charges** per sesi
- **Sabotage mutations** - Berbagai teknik sabotase (strict to loose equality, swap return, dll)
- **Covert Feed** - Channel khusus untuk Imposter

**Lokasi:**
- Backend: `backend/src/index.ts` (line ~24-150) - SABOTAGE_MUTATIONS, line ~1283-1335 - sabotage handler

### 6. Chat & Social Deduction
- **Fitur chat** - Pesan antar pemain
- **Emergency Meeting** - Pemicu meeting untuk voting
- **Voting system** - Eject pemain berdasarkan vote

**Lokasi:**
- Backend: `backend/src/index.ts` - chat, meeting handlers
- Frontend: `frontend/src/components/game/GameSessionClient.tsx`

### 7. Database Schema
- **Semua tabel** yang tercantum di tech-spec sudah dibuat
- **Categories, Challenges, Lobbies, Sessions** - lengkap dengan seed data

**Lokasi:**
- Backend: `backend/src/db.ts` (line ~32-154)

### 8. WebSocket - Server Side
- **Lobby WebSocket** - `/ws/lobbies/:code`
- **Session WebSocket** - `/ws/sessions/:sessionId`
- **Event handlers** - chat, editor, vote, sabotage

**Lokasi:**
- Backend: `backend/src/index.ts` (line ~940-1351)

### 9. REST API - Backend
- **GET /api/categories** - List kategori
- **GET /api/leaderboard** - Leaderboard & Hall of Fame
- **POST /api/lobbies** - Buat lobby
- **POST /api/lobbies/:code/join** - Gabung lobby
- **GET /api/lobbies/:code** - Get lobby
- **POST /api/lobbies/:code/players/:playerId/ready** - Toggle ready
- **POST /api/lobbies/:code/start** - Start game
- **GET /api/sessions/:sessionId** - Get session

**Lokasi:**
- Backend: `backend/src/index.ts`

### 10. UI/UX - Pixel Art Style
- **Desain retro/pixel art** - Sesuai spec
- **Pixel components** - buttons, panels, inputs
- **Responsive** - Support desktop dan mobile

**Lokasi:**
- Frontend: global.css (Tailwind theme)

### 11. Leaderboard
- **Global leaderboard** - Dengan score dan record
- **Hall of Fame** - Achievement special entries
- **Wall of Shame** - Included in Hall of Fame

**Lokasi:**
- Backend: `backend/src/index.ts` (line ~1353-1387)

### 12. Emergency Code Review
- **Snippet capture** - Kode di-capture saat emergency meeting dipicu
- **Ditampilkan** di meeting overlay

**Lokasi:**
- Backend: `backend/src/index.ts` (line ~1129-1150)
- Frontend: `frontend/src/components/game/GameSessionClient.tsx` (line ~414-420)

### 13. Game State Machine
- **Phase transitions** - waiting → category → playing → meeting → game_over
- **Round advancement** - Otomatis setelah timer habis
- **Win conditions** - Civilian/Imposter wins

**Lokasi:**
- Backend: `backend/src/index.ts` - finishGame, advanceToNextRound

---

## 🔄 Fitur Partial (Partially Implemented)

### 1. Security Scanner Task (MedBay Equivalent)
- **Status:** ⚠️ Partial
- **Yang ada:** -
- **Yang belum:** Task khusus untuk scan kerentanan, "Verified Developer" badge

**Catatan:** Challenge objectives menampilkan task tapi tidak ada Security Scanner khusus.

### 2. Copilot Poisoning
- **Status:** ⚠️ Partial
- **Yang ada:** -
- **Yang belum:** Imposter bisa "meracuni" AI agar memberikan saran kode yang salah

**Catatan:** Di tech-spec ada `/api/ai/activate-poisoning` endpoint, belum ada.

### 3. AI Sabotage Co-Pilot ("Ghost in the Code")
- **Status:** ⚠️ Partial
- **Yang ada:** Imposter punya imposter_feed dengan predefined messages
- **Yang belum:** Integrasi Gemini/OpenAI untuk suggest sabotage

**Catatan:** Ada static imposter_feed dari seed data, belum ada AI integration.

### 4. AI Code Review Post-Game
- **Status:** ⚠️ Partial
- **Yang ada:** Game over screen menampilkan winner dan players
- **Yang belum:** AI-generated refactoring report

**Catatan:** `GET /api/game/:sessionId/review` endpoint belum ada.

### 5. Tournament & Leaderboard System
- **Status:** ⚠️ Partial
- **Yang ada:** Static leaderboard dari seed data
- **Yang belum:**
  - Ranking mingguan dinamis
  - Skor perhitungan otomatis
  - Weekly update jobs

### 6. Editor Collaboration Features
- **Status:** ⚠️ Partial
- **Yang ada:** Basic sync via WebSocket (300ms debounce)
- **Yang belum:**
  - Cursor presence (melihat posisi cursor pemain lain)
  - Selection highlighting
  - OT/CRDT untuk conflict resolution

**Catatan:** Saat ini hanya sync content, belum ada cursor overlay.

---

## ❌ Fitur yang Belum Ada (Not Implemented)

### 1. Authentication System
- **Tech Spec:** POST /api/auth/register, login, logout dengan JWT
- **Status:** ❌ BELUM ADA
- **Catatan:** Tidak ada user registration, login, JWT token management

### 2. User Accounts & Profiles
- **Tech Spec:** Tabel users dengan username, email, password_hash, avatar_color
- **Status:** ❌ BELUM ADA
- **Catatan:** Player identification via session storage local, bukan user accounts

### 3. Code Execution / Sandbox
- **Tech Spec:** Judge0 atau Piston API untuk eksekusi kode aman
- **Status:** ❌ BELUM ADA
- **Catatan:** Tidak ada endpoint untuk run test cases, validate solution

### 4. AI Integration (Gemini/OpenAI)
- **Tech Spec:**
  - POST /api/ai/sabotage-suggest
  - POST /api/ai/activate-poisoning
  - AI Code Review Post-Game
- **Status:** ❌ BELUM ADA
- **Catatan:** Tidak ada AI service, semua data statis dari seed

### 5. Rate Limiting (Bagian dari Security)
- **Tech Spec:**
  - Chat: 10 pesan per 10 detik
  - AI request: 5 per menit
  - Sabotage: 5 per sesi
- **Status:** ⚠️ PARTIAL
- **Yang ada:** Chat rate limiting (CHAT_RATE_LIMIT_MAX = 10)
- **Yang belum:** AI request rate limiting

### 6. Role Validation di Server
- **Tech Spec:** Validasi role sensitif di server, bukan dari payload client
- **Status:** ⚠️ PARTIAL
- **Yang ada:** Role dicek dari database di WebSocket handler
- **Yang belum:** Validasi lebih strict untuk semua aksi sensitif

### 7. WebSocket Authentication
- **Tech Spec:** JWT verification pada WebSocket handshake
- **Status:** ❌ BELUM ADA
- **Catatan:** WebSocket tidak menggunakan JWT, playerId dari query parameter

### 8. Category Filter untuk Leaderboard
- **Tech Spec:** GET /api/leaderboard/:category
- **Status:** ❌ BELUM ADA
- **Catatan:** Hanya ada GET /api/leaderboard global

### 9. Detailed Game Reviews API
- **Tech Spec:** GET /api/game/:sessionId/review
- **Status:** ❌ BELUM ADA
- **Catatan:** Endpoint tidak ada

### 10. Persistent Game State (Redis)
- **Tech Spec:** Session dan game state di Redis untuk performance
- **Status:** ❌ BELUM ADA
- **Catatan:** Hanya menggunakan PostgreSQL, Redis tidak digunakan

### 11. Proper File/Project Structure sesuai Tech Spec
- **Tech Spec:** Struktur direktori dengan controllers/, services/, models/, dll
- **Status:** ⚠️ PARTIAL
- **Yang ada:** Flat structure di backend/src/
- **Yang belum:** Modular structure dengan controller/service separation

---

## 📋 Detail per Fitur

### Authentication
| Method | Endpoint | Status |
|--------|----------|--------|
| POST | /api/auth/register | ❌ |
| POST | /api/auth/login | ❌ |
| POST | /api/auth/logout | ❌ |

### Lobby API
| Method | Endpoint | Status |
|--------|----------|--------|
| POST | /api/lobby/create | ✅ |
| POST | /api/lobby/join | ✅ |
| GET | /api/lobby/:code | ✅ |
| POST | /api/lobby/:code/ready | ✅ |
| POST | /api/lobby/:code/vote-category | ✅ (via WebSocket) |
| POST | /api/lobby/:code/start | ✅ |

### Game API
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | /api/game/:sessionId | ✅ |
| POST | /api/game/:sessionId/sabotage | ✅ (via WebSocket) |
| POST | /api/game/:sessionId/emergency-meeting | ✅ (via WebSocket) |
| POST | /api/game/:sessionId/vote | ✅ (via WebSocket) |
| GET | /api/game/:sessionId/review | ❌ |

### Leaderboard API
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | /api/leaderboard | ✅ |
| GET | /api/leaderboard/:category | ❌ |
| GET | /api/leaderboard/hall-of-fame | ✅ (combined) |

### AI API
| Method | Endpoint | Status |
|--------|----------|--------|
| POST | /api/ai/sabotage-suggest | ❌ |
| POST | /api/ai/activate-poisoning | ❌ |

---

## 📊 Kesimpulan

### Kekuatan (Strengths)
1. **Game engine lengkap** - Game logic, round management, win conditions berfungsi
2. **Real-time communication** - WebSocket bekerja dengan baik
3. **UI yang menarik** - Pixel art style sudah sesuai spec
4. **Database schema** - Lengkap sesuai tech spec

### Perlu Ditambahkan (Gaps)
1. **Auth system** - Tidak ada user accounts
2. **AI integration** - Tidak ada Gemini/OpenAI
3. **Code execution** - Tidak ada sandbox untuk run kode
4. **Advanced features** - Security Scanner, Copilot Poisoning belum ada
5. **Real leaderboard** - Masih static seed data

### Prioritas Implementasi

**High Priority:**
1. Authentication system (register, login, JWT)
2. Code execution sandbox (Judge0/Piston)
3. AI integration (Gemini/OpenAI)

**Medium Priority:**
4. Security Scanner task
5. Copilot Poisoning
6. AI Code Review Post-Game

**Low Priority:**
7. Category-specific leaderboard
8. Redis untuk session caching
9. Advanced editor features (cursor presence, OT/CRDT)