# BidKing 百策竞拍

基于 [PRD](./docs/PRD-选手竞拍系统.md) 的多轮盲拍竞拍系统。

## 功能概览

- 四轮盲拍、倍率秒杀、保护价、位置冲突回避、R4 加时、流拍池补拍
- JSON 持久化 + 重启恢复倒计时
- 管理端 CRUD / 规则配置 / 审计日志
- 队长 Token 鉴权（生产环境）
- WebSocket 实时同步 + 观战大屏

## 快速开始（本地）

```bash
npm install
npm run dev
```

| 页面 | 地址 |
|------|------|
| 首页 | http://localhost:5173 |
| 管理端 | http://localhost:5173/admin |
| 观战 | http://localhost:5173/spectator |
| 队长 | http://localhost:5173/captain/c1 |

默认管理员 Token：`bidking-admin`  
演示队长 Token：`demo-c1-token` … `demo-c5-token`

## 生产构建

```bash
npm run build
npm start
# 访问 http://localhost:3001
```

## 部署

详见 **[docs/DEPLOY.md](./docs/DEPLOY.md)**

### GitHub + Render 快速步骤

1. 推送代码到 GitHub
2. Render → New → Blueprint → 选择仓库（读取 `render.yaml`）
3. 挂载 Disk `/var/data`，记录生成的 `ADMIN_TOKEN`
4. 访问 `https://<app>.onrender.com/admin`

### Docker

```bash
docker build -t bidking .
docker run -p 3001:3001 -e ADMIN_TOKEN=secret -v bidking-data:/var/data bidking
```

## 环境变量

见 [.env.example](./.env.example)

| 变量 | 说明 |
|------|------|
| `ADMIN_TOKEN` | 管理员鉴权 |
| `DATA_DIR` | 持久化目录（Render: `/var/data`） |
| `REQUIRE_CAPTAIN_AUTH` | 队长出价 Token 校验 |

## 测试

```bash
npm test
```

## 项目结构

```
bidking/
├── client/           # React 前端
├── server/           # Express + Socket.io + 竞拍引擎
├── docs/             # PRD + 部署文档
├── render.yaml       # Render Blueprint
├── Dockerfile
└── .github/workflows/ci.yml
```
