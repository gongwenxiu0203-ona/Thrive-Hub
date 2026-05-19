// ============================================================
//  PM2 生态配置 — Thrive Hub
//  用法：
//    首次启动:  pm2 start ecosystem.config.js --env production
//    重启:      pm2 restart thrive-hub
//    查看日志:  pm2 logs thrive-hub
//    开机自启:  pm2 save && pm2 startup
// ============================================================

module.exports = {
  apps: [
    {
      // ── Next.js 主应用 ────────────────────────────────────
      name: "thrive-hub",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/var/www/thrive-hub",   // ← 服务器上的项目路径
      instances: 1,                  // 单实例（SQLite 时必须为 1；MySQL 时可改为 "max"）
      exec_mode: "fork",             // MySQL 时可改为 "cluster"
      port: 3000,

      // ── 环境变量 ──────────────────────────────────────────
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // ── 日志 ──────────────────────────────────────────────
      output: "/var/log/thrive-hub/out.log",
      error:  "/var/log/thrive-hub/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,

      // ── 崩溃自动重启 ──────────────────────────────────────
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,

      // ── 内存超限重启（防内存泄漏）────────────────────────
      max_memory_restart: "512M",

      // ── 优雅关闭等待时间 ─────────────────────────────────
      kill_timeout: 5000,

      // ── 监视文件变化（生产禁用）──────────────────────────
      watch: false,
      ignore_watch: ["node_modules", ".next", "uploads", "logs"],
    },

    // ── 预留：未来独立后端服务 ─────────────────────────────
    // {
    //   name: "thrive-api",
    //   script: "server/index.js",
    //   cwd: "/var/www/thrive-hub",
    //   instances: 1,
    //   port: 3001,
    //   env_production: { NODE_ENV: "production", PORT: 3001 },
    //   output: "/var/log/thrive-hub/api-out.log",
    //   error:  "/var/log/thrive-hub/api-error.log",
    // },
  ],
};
