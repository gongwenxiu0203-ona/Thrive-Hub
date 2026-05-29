-- Permission system: role-level defaults + per-user overrides + invitation tracking
-- Non-destructive: ADD COLUMN + CREATE TABLE only.

-- 用户邀请人字段
ALTER TABLE "User" ADD COLUMN "invitedById" TEXT;

-- 角色级权限配置表
CREATE TABLE "RolePermission" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "role" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "RolePermission_role_feature_key" ON "RolePermission"("role", "feature");
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- 用户级权限覆盖表
CREATE TABLE "UserPermissionOverride" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UserPermissionOverride_userId_feature_key" ON "UserPermissionOverride"("userId", "feature");
CREATE INDEX "UserPermissionOverride_userId_idx" ON "UserPermissionOverride"("userId");
