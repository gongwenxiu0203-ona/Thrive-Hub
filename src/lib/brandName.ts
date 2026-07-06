export function capitalizeBrandName(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.trim();
  if (!s) return "";
  return s.charAt(0).toLocaleUpperCase() + s.slice(1).toLocaleLowerCase();
}
