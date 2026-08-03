export const CONTRACT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
export const CONTRACT_UPLOAD_MAX_MB = CONTRACT_UPLOAD_MAX_BYTES / 1024 / 1024;

export function formatUploadSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
