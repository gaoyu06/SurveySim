# FormAgents

一个用于 **AI 模拟填写调查问卷** 的 Web App MVP。

它支持：

- 配置 LLM 提供方（OpenAI-compatible）
- 创建参与者人群模板与规则
- 导入原始问卷文本并结构化
- 批量生成 identity / persona / mock 答卷
- 保存 mock 批次、查看报表、导出结果

## 技术栈

- Frontend: React + Vite + TypeScript + Ant Design
- Backend: Node.js + Fastify + Prisma
- Database: SQLite
- Shared: Zod schema / DTO

## 目录

```text
frontend/   React 前端
backend/    Fastify API + Prisma + SQLite
shared/     前后端共享类型与 schema
```

## 本地启动

### 1. 安装依赖

```bash
pnpm install
```

### 2. 初始化数据库

```bash
pnpm db:generate
pnpm db:push
```

### 3. 配置环境变量

复制：

```bash
backend/.env.example -> backend/.env
```

至少修改：

```env
JWT_SECRET=your-secret
```

### 4. 启动开发环境

```bash
pnpm dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## 构建

```bash
pnpm build
```

构建后可启动后端产物：

```bash
pnpm --filter @formagents/backend start
```

## 当前 MVP 能力

- 参与者模板管理
- LLM 配置管理
- 问卷导入 / 编辑 / 保存
- Mock run 执行与状态跟踪
- 基础报表
- JSON / CSV / HTML 导出

## 说明

- 当前默认数据库为 SQLite，后续可切 PostgreSQL
- LLM 接口按 OpenAI-compatible 方式接入
- 这是可运行 MVP，适合继续迭代功能和 UI
