export type MusicStyleGroup = {
  readonly name: string;
  readonly styles: readonly string[];
};

export const musicStyleGroups: readonly MusicStyleGroup[] = [
  { name: "Pop", styles: ["J-pop", "K-pop", "City Pop", "Indie Pop", "Synthpop"] },
  { name: "Rock", styles: ["Classic Rock", "Indie Rock", "Punk Rock", "Hard Rock", "Post-Rock"] },
  {
    name: "Hip-hop and R&B",
    styles: ["Boom Bap", "Trap", "Lo-fi Hip-hop", "Contemporary R&B", "Neo-soul"],
  },
  { name: "Electronic", styles: ["House", "Techno", "Trance", "Drum and Bass", "Synthwave"] },
  { name: "Jazz and Blues", styles: ["Swing", "Bebop", "Cool Jazz", "Jazz Fusion", "Blues"] },
  { name: "Brazilian and Latin", styles: ["Bossa Nova", "Samba", "Salsa", "Tango", "Reggaeton"] },
  {
    name: "African and Caribbean",
    styles: ["Afrobeats", "Amapiano", "Highlife", "Reggae", "Soca"],
  },
  {
    name: "Folk and Country",
    styles: ["Acoustic Folk", "Celtic Folk", "Country", "Bluegrass", "Americana"],
  },
  {
    name: "Classical and Screen",
    styles: [
      "Baroque",
      "Romantic Classical",
      "Minimalism",
      "Orchestral Film Score",
      "Chamber Music",
    ],
  },
  {
    name: "Regional Traditions",
    styles: [
      "Hindustani Classical",
      "Carnatic Classical",
      "Flamenco",
      "Gamelan",
      "Arabic Classical",
    ],
  },
];

export const musicStyles = musicStyleGroups.flatMap(({ styles }) => styles);
