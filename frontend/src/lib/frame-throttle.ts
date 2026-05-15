export function shouldRunFrame(
  now: number,
  lastFrameAt: number,
  maxFps = 60,
) {
  return now - lastFrameAt >= 1000 / maxFps;
}
