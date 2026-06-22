type ContractFileNameInput = {
  contractNo?: string | null;
  createdAt?: Date | string | null;
  partyA?: string | null;
  customer?: { brandName?: string | null; name?: string | null } | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function compactCreatedAt(value: Date | string | null | undefined): string {
  const dt = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(dt.getTime())) return compactCreatedAt(new Date());
  return [
    dt.getFullYear(),
    pad(dt.getMonth() + 1),
    pad(dt.getDate()),
    pad(dt.getHours()),
    pad(dt.getMinutes()),
  ].join("");
}

export function safeContractFilePart(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 80);
}

export function contractFileBaseName(contract: ContractFileNameInput): string {
  const customerName = safeContractFilePart(
    contract.customer?.brandName
      || contract.customer?.name
      || contract.partyA
      || contract.contractNo
      || "合同",
  );
  return `${compactCreatedAt(contract.createdAt)}-${customerName || "合同"}`;
}
