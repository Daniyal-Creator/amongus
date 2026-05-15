# Sound Assets

The game expects these sound files to exist in this folder. If a file is missing, `useSoundSafe` will silently no-op.

| File | Triggered when |
|------|----------------|
| `click.mp3`     | UI button click |
| `success.mp3`   | Test passes / sabotage validated |
| `fail.mp3`      | Test fails / wrong vote |
| `emergency.mp3` | Emergency meeting triggered |
| `victory.mp3`   | Game over — your team won |
| `defeat.mp3`    | Game over — your team lost |
| `tick.mp3`      | Last 5 seconds of timer |
| `notify.mp3`    | New chat message arrived |
| `eject.mp3`     | Player ejected after vote |

Recommended free CC0 sources:
- https://freesound.org/
- https://kenney.nl/assets/category:Audio
- https://opengameart.org/

Drop in any `.mp3` (or `.wav`/`.ogg`) with the names above.
The audio system gracefully handles missing files — gameplay is never blocked by a 404.
