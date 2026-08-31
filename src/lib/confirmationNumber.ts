export function nextConfirmationNumber(contractNo: string, existing: string[]) {
  const prefix = `${contractNo}-`;
  const max = existing.reduce((last, value) => {
    const suffix = value.startsWith(prefix) ? value.slice(prefix.length) : "";
    return /^\d+$/.test(suffix) ? Math.max(last, Number(suffix)) : last;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
