const WORDS = ['NOVA', 'RIVER', 'PIXEL', 'ORBIT', 'ECHO', 'LUNAR', 'MINT', 'SKY'];

export function generateMacroId() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `MC-${word}-${suffix}`;
}

export function localId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
