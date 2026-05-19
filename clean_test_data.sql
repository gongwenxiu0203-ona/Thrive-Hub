-- ============================================================
--  clean_test_data.sql
--  清空所有业务测试数据，保留管理员账号和系统用户
--  适用数据库：MySQL（腾讯云）
--
--  执行方式（在服务器上）：
--    mysql -u YOUR_USER -p YOUR_DB < clean_test_data.sql
--  或通过腾讯云控制台的「数据库管理」→「SQL 操作」执行
--
--  ⚠️  执行前请先做快照备份！此操作不可撤销！
-- ============================================================

USE `thrive_hub`;   -- ← 替换为实际数据库名

-- 关闭外键检查，避免顺序依赖报错
SET FOREIGN_KEY_CHECKS = 0;

-- ── 1. 销售数据 ──────────────────────────────────────────────
TRUNCATE TABLE `SalesRecord`;
TRUNCATE TABLE `SalesBatch`;
TRUNCATE TABLE `AsinMapping`;

-- ── 2. 联盟资源库 ────────────────────────────────────────────
TRUNCATE TABLE `AffiliateCoopReview`;
TRUNCATE TABLE `Affiliate`;
TRUNCATE TABLE `AffiliateBatch`;

-- ── 3. 合同 ──────────────────────────────────────────────────
TRUNCATE TABLE `ContractFieldReview`;
TRUNCATE TABLE `Contract`;

-- ── 4. 任务 & 提醒 ───────────────────────────────────────────
TRUNCATE TABLE `Task`;
TRUNCATE TABLE `Reminder`;

-- ── 5. 附件 ──────────────────────────────────────────────────
TRUNCATE TABLE `Attachment`;

-- ── 6. 客户 ──────────────────────────────────────────────────
TRUNCATE TABLE `Customer`;

-- 恢复外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- ── 7. 清理用户（保留 ADMIN，删除测试普通用户）────────────────
--  保留逻辑：role = 'ADMIN' 的账号全部保留
--  如需保留特定邮箱，在 AND 条件后追加：AND email NOT IN ('user@example.com')
DELETE FROM `User`
WHERE role != 'ADMIN';

-- ── 8. 重置所有用户的 channelUserId（如有自引用残留）─────────
UPDATE `User` SET channelUserId = NULL WHERE channelUserId IS NOT NULL;

-- ── 9. 输出剩余管理员（验证）────────────────────────────────
SELECT id, name, email, role, status FROM `User` ORDER BY createdAt;

-- ============================================================
--  执行完毕后建议：
--  1. 检查上方查询结果，确认仅剩管理员账号
--  2. 重启应用服务：pm2 restart thrive-hub
--  3. 清理服务器 uploads 目录中的测试文件
--     （保留目录本身和 .gitkeep）
-- ============================================================
