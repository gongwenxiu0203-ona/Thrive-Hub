"use server";
// Kept for backward compatibility — new affiliate operations use API routes directly.
// These stubs prevent import errors from any remaining references.

export async function createAffiliate(_fd: FormData) {
  throw new Error("Use /api/affiliates POST instead");
}
export async function updateAffiliate(_id: string, _fd: FormData) {
  throw new Error("Use /api/affiliates/[id] PATCH instead");
}
export async function deleteAffiliate(_id: string) {
  throw new Error("Use /api/affiliates/[id] DELETE instead");
}
