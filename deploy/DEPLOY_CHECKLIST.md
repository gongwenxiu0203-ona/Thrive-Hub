# 上线检查清单 — Thrive Hub v1.0.0

> 个人备案上线，腾讯云服务器 + MySQL  
> 每步完成后打 ✅，部署完成后存档

---

## 一、上线前（本地）

### 代码准备
- [ ] 所有功能在本地开发环境跑通
- [ ] `git status` 确认无未提交的意外文件
- [ ] `.env` / `.env.*` 未被提交（`git ls-files | grep .env` 应无输出）
- [ ] 敏感信息未硬编码在代码中（API Key、密码等）
- [ ] 打版本 Tag：`git tag -a v1.0.0 -m "first production release" && git push origin v1.0.0`

### MySQL Schema 切换
- [ ] 将 `prisma/schema.mysql.prisma` 内容覆盖到 `prisma/schema.prisma`
- [ ] 修改 provider: `sqlite` → `mysql`
- [ ] 本地用腾讯云 MySQL 内网/外网测试连接：`DATABASE_URL=mysql://... npx prisma db push`
- [ ] 确认 `prisma migrate` 能在 MySQL 上正常执行

### 构建验证
```bash
# 本地模拟生产构建
NODE_ENV=production npm run build
```
- [ ] 构建无报错
- [ ] `.next/` 目录生成正常

---

## 二、腾讯云基础设施

### 服务器（CVM）
- [ ] 实例规格：≥ 2核4G（Next.js SSR 最低要求）
- [ ] 操作系统：Ubuntu 22.04 LTS 或 CentOS 8
- [ ] 安全组开放端口：**22**（SSH）、**80**（HTTP）、**443**（HTTPS）
- [ ] 22 端口限制仅允许本机 IP 访问（安全加固）
- [ ] SSH 密钥对登录（禁用密码登录）

### 数据库（云 MySQL）
- [ ] 实例版本：MySQL 8.0
- [ ] 与 CVM 同地域（内网连接，无流量费）
- [ ] 安全组：仅允许 CVM 内网 IP 访问 3306 端口
- [ ] 创建专用数据库：`CREATE DATABASE thrive_hub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
- [ ] 创建专用用户（非 root）：
  ```sql
  CREATE USER 'thrive'@'%' IDENTIFIED BY 'StrongPassword123!';
  GRANT ALL PRIVILEGES ON thrive_hub.* TO 'thrive'@'%';
  FLUSH PRIVILEGES;
  ```
- [ ] 测试连接：`mysql -h 内网IP -u thrive -p thrive_hub`

### 域名 & 备案
- [ ] 域名已在腾讯云购买并解析到 CVM 公网 IP
- [ ] ICP 备案已完成（个人备案，通常 7-20 个工作日）
- [ ] 公安网安备案完成（上线后 30 天内，登录 beian.gov.cn）
- [ ] SSL 证书已申请（腾讯云免费 DV 证书，或 Let's Encrypt）

---

## 三、服务器环境搭建

```bash
# 以下命令在服务器上执行（SSH 登录后）

# 安装 Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证
node -v   # 应输出 v20.x.x
npm -v

# 安装 PM2
sudo npm install -g pm2

# 安装 Nginx
sudo apt-get install -y nginx

# 创建项目目录
sudo mkdir -p /var/www/thrive-hub
sudo chown -R $USER:$USER /var/www/thrive-hub

# 创建日志目录
sudo mkdir -p /var/log/thrive-hub
sudo chown -R $USER:$USER /var/log/thrive-hub

# 创建上传目录
mkdir -p /var/www/thrive-hub/uploads
```

- [ ] Node.js 20 LTS 安装完成
- [ ] PM2 安装完成
- [ ] Nginx 安装完成
- [ ] 目录结构创建完成

---

## 四、部署代码

```bash
# 方案 A：GitHub 拉取（推荐）
cd /var/www/thrive-hub
git clone https://github.com/你的用户名/Thrive-Hub.git .
# 或更新：git pull origin master

# 安装依赖
npm install --production=false   # 需要 devDependencies 中的 prisma

# 上传环境变量（从本地 scp）
# 在本地执行：
# scp .env.production root@服务器IP:/var/www/thrive-hub/.env

# 确认 .env 文件存在且正确
cat /var/www/thrive-hub/.env | grep DATABASE_URL
```

- [ ] 代码拉取/上传完成
- [ ] `node_modules` 安装完成
- [ ] `.env`（生产配置）上传到服务器，权限设为 600：`chmod 600 .env`

---

## 五、数据库初始化

```bash
cd /var/www/thrive-hub

# 将 MySQL Schema 覆盖到 schema.prisma
cp prisma/schema.mysql.prisma prisma/schema.prisma

# 生产数据库迁移（初次部署）
npx prisma migrate deploy

# 创建管理员账号（首次运行 seed）
npx prisma db seed
# 或手动：
# node -e "require('./prisma/seed.ts')"   # 如有 seed 文件

# 验证表已创建
npx prisma studio   # 可选：图形界面查看
```

- [ ] `prisma migrate deploy` 成功（所有迁移执行完毕）
- [ ] 管理员账号已创建
- [ ] 数据库表结构确认正常

---

## 六、构建 & 启动

```bash
cd /var/www/thrive-hub

# 生产构建
npm run build

# 用 PM2 启动
pm2 start ecosystem.config.js --env production

# 查看状态
pm2 status
pm2 logs thrive-hub --lines 50

# 设置开机自启
pm2 save
pm2 startup   # 按提示执行输出的命令
```

- [ ] `npm run build` 无报错
- [ ] PM2 显示 `thrive-hub` 状态为 `online`
- [ ] `pm2 logs` 无异常报错
- [ ] 访问 `http://服务器IP:3000` 能看到应用

---

## 七、Nginx 配置

```bash
# 上传 Nginx 配置（从本地 scp，或直接编辑）
sudo cp /var/www/thrive-hub/deploy/nginx.conf /etc/nginx/conf.d/thrive-hub.conf

# 编辑：替换 your-domain.com 为实际域名
sudo nano /etc/nginx/conf.d/thrive-hub.conf

# 上传 SSL 证书（腾讯云下载的 .pem 和 .key）
sudo mkdir -p /etc/nginx/ssl
sudo scp 证书文件.pem root@服务器IP:/etc/nginx/ssl/your-domain.com.pem
sudo scp 证书文件.key root@服务器IP:/etc/nginx/ssl/your-domain.com.key
sudo chmod 600 /etc/nginx/ssl/*

# 测试 Nginx 配置
sudo nginx -t

# 重载
sudo systemctl reload nginx
sudo systemctl enable nginx
```

- [ ] Nginx 配置文件域名已替换
- [ ] SSL 证书已上传到正确路径
- [ ] `sudo nginx -t` 显示 `test is successful`
- [ ] `sudo systemctl status nginx` 显示 `active (running)`

---

## 八、上线验证

- [ ] 访问 `https://your-domain.com` 正常（HTTPS 绿色锁）
- [ ] HTTP 自动跳转到 HTTPS
- [ ] 登录功能正常
- [ ] 客户管理页面加载正常
- [ ] 合同管理页面加载正常
- [ ] 任务管理页面加载正常
- [ ] BI 数据页面加载正常
- [ ] 文件上传功能测试（合同 PDF / Excel）
- [ ] 邮件通知测试（如有配置）

---

## 九、生产安全加固

- [ ] `.env` 文件权限：`chmod 600 /var/www/thrive-hub/.env`
- [ ] `uploads/` 目录不可执行：`chmod 755 /var/www/thrive-hub/uploads`
- [ ] Nginx 隐藏版本号：`server_tokens off;`（已在配置中）
- [ ] 腾讯云安全组：确认 3000 端口**未对外开放**（仅 Nginx 代理）
- [ ] MySQL 3306 端口**未对外开放**（仅内网访问）
- [ ] 定期更新系统：`sudo apt-get update && sudo apt-get upgrade`

---

## 十、备份策略

```bash
# 腾讯云 MySQL 自动备份：控制台 → 数据库 → 备份恢复 → 自动备份设置
# 建议：保留 7 天，每天 02:00 备份

# uploads 目录同步到腾讯云 COS（可选）
# 安装 coscmd 后：
# coscmd upload -r /var/www/thrive-hub/uploads/ /thrive-hub/uploads/
```

- [ ] MySQL 自动备份已开启（腾讯云控制台设置）
- [ ] 首次手动备份：控制台 → 立即备份

---

## 部署后常用命令速查

```bash
# 查看应用状态
pm2 status

# 查看实时日志
pm2 logs thrive-hub

# 更新部署（代码更新后）
cd /var/www/thrive-hub
git pull origin master
npm install
npm run build
pm2 restart thrive-hub

# 数据库新增迁移
npx prisma migrate deploy

# Nginx 重载
sudo systemctl reload nginx

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/thrive-hub.error.log
```
