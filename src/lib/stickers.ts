const STICKER_BASE = 'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media';

export type Sticker = { id: string; label: string; source: { uri: string } };

export const STICKER_LIST: Sticker[] = [
  ...Array.from({ length: 14 }, (_, index) => ({
    id: `sticker-${index + 1}`,
    label: `Sticker ${index + 1}`,
    source: { uri: `${STICKER_BASE}/${index + 1}.png` },
  })),
  { id: 'sticker-rpp', label: 'RPP', source: { uri: `${STICKER_BASE}/rppnet.png` } },
];
