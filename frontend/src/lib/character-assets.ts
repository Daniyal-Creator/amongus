const CHARACTER_ASSETS = [
  "character-base.gif",
  "character-dude.gif",
  "character-helmet.gif",
  "character-knight.gif",
  "character-orc.gif",
];

export function getCharacterAsset(playerId: string) {
  const sum = Array.from(playerId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const name = CHARACTER_ASSETS[sum % CHARACTER_ASSETS.length];
  return `/Char/${name}`;
}
