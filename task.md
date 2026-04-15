# Backend Task Breakdown — Code Mafia

## 1. Foundation

- Scaffold `backend/` dengan `Node.js + Fastify + TypeScript`.
- Setup `tsconfig`, linting, env parsing, folder structure sesuai spec.
- Tambahkan health check dan error handler global.
- Siapkan Docker Compose untuk PostgreSQL, Redis, dan backend app.

## 2. Database & Prisma

- Inisialisasi Prisma untuk PostgreSQL.
- Implement schema untuk tabel: `users`, `lobbies`, `lobby_players`, `game_sessions`, `rounds`, `challenges`, `sabotage_logs`, `votes`, `leaderboard`, `game_reviews`.
- Buat migration awal dan seed data challenge per kategori.
- Tambahkan index yang relevan untuk `lobbies.code`, `leaderboard.week_start`, `votes` uniqueness, dan lookup game state.

## 3. Auth

- Implement `POST /api/auth/register`.
- Implement `POST /api/auth/login`.
- Implement `POST /api/auth/logout`.
- Hash password dengan aman dan keluarkan JWT.
- Tambahkan auth middleware untuk REST dan handshake WebSocket.

## 4. Lobby REST API

- Implement `POST /api/lobby/create`.
- Implement `POST /api/lobby/join`.
- Implement `GET /api/lobby/:code`.
- Implement `POST /api/lobby/:code/ready`.
- Implement `POST /api/lobby/:code/vote-category`.
- Implement `POST /api/lobby/:code/start`.
- Validasi minimal player, host-only actions, dan transisi state `waiting -> category_vote -> in_progress`.

## 5. Game REST API

- Implement `GET /api/game/:sessionId`.
- Implement `POST /api/game/:sessionId/sabotage`.
- Implement `POST /api/game/:sessionId/emergency-meeting`.
- Implement `POST /api/game/:sessionId/vote`.
- Implement `GET /api/game/:sessionId/review`.
- Buat service untuk state machine round, eject flow, winner calculation, dan rotasi round sampai maksimal 4.

## 6. WebSocket Layer

- Setup Socket.io server dengan auth handshake JWT.
- Implement event `editor:change` dan broadcast `editor:update`.
- Implement event `chat:message` dan broadcast `chat:broadcast`.
- Implement event `game:sabotage`.
- Implement event `game:scan`.
- Implement event `game:emergency`.
- Implement event `game:vote`.
- Broadcast state `game:state`, `game:meeting-start`, `game:eject`, `game:round-end`, dan `game:end`.

## 7. Collaborative Editor & Execution

- Pilih strategi sinkronisasi editor: OT atau CRDT.
- Simpan state editor aktif per session/round di Redis.
- Integrasikan sandbox runner via Judge0 atau Piston untuk run test case.
- Pastikan timeout, memory limit, dan isolasi network/file sesuai spec keamanan.

## 8. AI Integration

- Implement service Gemini utama dengan fallback OpenAI.
- Implement `POST /api/ai/sabotage-suggest`.
- Implement `POST /api/ai/activate-poisoning`.
- Buat pipeline poisoned prompt saat civilian meminta bantuan AI.
- Implement post-game AI review dan simpan hasil ke `game_reviews`.

## 9. Security & Validation

- Tambahkan rate limiter untuk chat, AI request, dan sabotage.
- Validasi role-sensitive action di server, bukan dari payload klien.
- Simpan role/game flag sensitif di Redis + database.
- Pastikan tidak ada logging PII/token sensitif.
- Tambahkan schema validation untuk semua request dan socket payload.

## 10. Leaderboard & Weekly Ranking

- Implement `GET /api/leaderboard`.
- Implement `GET /api/leaderboard/:category`.
- Implement `GET /api/leaderboard/hall-of-fame`.
- Buat job/update service untuk kalkulasi skor mingguan, achievement, wall of shame, dan hall of fame.

## 11. Testing

- Tambahkan unit test untuk auth, lobby flow, winner calculation, dan score calculation.
- Tambahkan integration test untuk REST API utama.
- Tambahkan socket integration test untuk editor/chat/game events.
- Tambahkan test untuk validasi role, rate limit, dan sabotage charge limit.

## 12. Frontend Integration Follow-up

- Sambungkan frontend ke REST API dan socket yang sudah jadi.
- Ganti mock data di frontend dengan store + fetch real state.
- Hook lobby/game pages ke loading, error, dan reconnect states.
- Implement submit actions nyata untuk create/join/ready/vote/sabotage/chat/meeting.
