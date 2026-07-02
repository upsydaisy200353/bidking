# BidKing 部署指南

## 架构说明

生产环境采用 **单体部署**：Express 同时提供 API、WebSocket 和前端静态资源，避免跨域与 WebSocket 配置问题。

```
浏览器 ──► Render Web Service (Node.js)
              ├── /api/*        REST API
              ├── /socket.io/*  WebSocket
              ├── /*            React SPA (client/dist)
              └── /var/data/state.json  持久化（Render Disk）
```

---

## 一、推送到 GitHub

```bash
cd e:\baicia-bidking

# 初始化仓库（若尚未初始化）
git init
git add .
git commit -m "feat: BidKing 竞拍系统 MVP + Render 部署配置"

# 在 GitHub 创建空仓库后：
git remote add origin https://github.com/<你的用户名>/bidking.git
git branch -M main
git push -u origin main
```

`.gitignore` 已排除 `node_modules/`、`.env`、`server/data/`（本地持久化数据不入库）。

---

## 二、Render 部署（推荐）

### 方式 A：Blueprint 一键部署

1. 登录 [Render Dashboard](https://dashboard.render.com)
2. **New → Blueprint**
3. 连接 GitHub 仓库，Render 会自动读取根目录 `render.yaml`
4. 确认环境变量后点击 **Apply**

`render.yaml` 已配置：
- 构建：`npm install && npm run build`
- 启动：`npm start`
- 健康检查：`/api/health`
- 持久化磁盘：`/var/data`（1GB）
- 自动生成 `ADMIN_TOKEN`

### 方式 B：手动创建 Web Service

| 配置项 | 值 |
|--------|-----|
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

**环境变量：**

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `ADMIN_TOKEN` | 强随机字符串 |
| `DATA_DIR` | `/var/data` |
| `REQUIRE_CAPTAIN_AUTH` | `true` |

**Disk（必须添加，否则重启丢数据）：**

| 配置 | 值 |
|------|-----|
| Mount Path | `/var/data` |
| Size | 1 GB |

### 部署后访问

- 首页：`https://<your-service>.onrender.com`
- 管理端：`https://<your-service>.onrender.com/admin`
- 观战：`https://<your-service>.onrender.com/spectator`

在 Render Dashboard → Environment 中查看自动生成的 `ADMIN_TOKEN`，填入管理端 Token 输入框。

---

## 三、Docker 部署

```bash
docker build -t bidking .
docker run -d \
  -p 3001:3001 \
  -e ADMIN_TOKEN=your-secret \
  -e DATA_DIR=/var/data \
  -v bidking-data:/var/data \
  bidking
```

---

## 四、环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | development | production 时托管前端静态文件 |
| `PORT` | 3001 | Render 自动注入 |
| `ADMIN_TOKEN` | bidking-admin | 管理员 API 鉴权 |
| `DATA_DIR` | server/data | 状态文件目录 |
| `REQUIRE_CAPTAIN_AUTH` | production 下 true | 队长出价 Token 校验 |
| `CORS_ORIGIN` | * (dev) | 前后端分离时的 CORS |

---

## 五、队长 Token 管理

1. 管理端 → **队长管理** 查看各队长 Token
2. 队长访问 `/captain/c1` 等页面，填入对应 Token
3. 生产环境可点击 **重新生成 Token**（需新增 UI 按钮或调用 API）

```bash
curl -X POST https://<host>/api/captains/c1/regenerate-token \
  -H "X-Admin-Token: <ADMIN_TOKEN>"
```

---

## 六、注意事项

- **Free Plan 休眠**：Render 免费实例 15 分钟无访问会休眠，首次访问需等待冷启动
- **WebSocket**：单体部署下同域，无需额外配置
- **数据备份**：定期从 Render Disk 或 `DATA_DIR` 备份 `state.json`
- **安全**：部署后立即修改 `ADMIN_TOKEN`，勿将 Token 提交到 Git
