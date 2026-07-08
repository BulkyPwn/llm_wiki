## LLM Wiki 对外开放 API 参考

**Base URL**: `http://127.0.0.1:19828/api/v1`（端口固定 19828）

所有响应格式统一为 JSON: 成功返回 `{ "ok": true, ... }`，失败返回 `{ "ok": false, "error": "..." }`。需先在 Settings → API Server 中启用并配置 Token。

`project_id` 可传 UUID 或 `"current"`（指代当前在 GUI 中打开的项目）。

---

### 1. 健康检查 `GET /health`

无需认证，无需启用 API，始终可访问。

```bash
curl http://127.0.0.1:19828/health
```

```json
{
  "ok": true,
  "status": "running",
  "version": "0.1.0",
  "enabled": true,
  "mcpEnabled": false,
  "authRequired": true,
  "authConfigured": true,
  "allowUnauthenticated": false,
  "tokenSource": "settings",
  "allowLanAccess": false
}
```

---

### 2. 项目列表 `GET /projects`

```bash
curl -H "Authorization: Bearer <token>" \
  http://127.0.0.1:19828/api/v1/projects
```

```json
{
  "ok": true,
  "projects": [
    { "id": "uuid-1", "name": "我的知识库", "path": "/path/to/project", "current": true }
  ],
  "currentProject": { "id": "uuid-1", "name": "我的知识库", "path": "/path/to/project", "current": true }
}
```

---

### 3. 文件树 `GET /projects/{id}/files`

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `root` | `"wiki"` | `"wiki"` / `"sources"` / `"all"` |
| `recursive` | `false` | 是否递归展开 |
| `maxFiles` | `2000` | 最大返回文件数 |

```bash
curl -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:19828/api/v1/projects/current/files?root=wiki&recursive=true"
```

```json
{
  "ok": true,
  "files": [
    { "name": "entities", "path": "wiki/entities", "isDir": true, "children": [...] },
    { "name": "sources", "path": "wiki/sources", "isDir": true, "children": [...] }
  ],
  "truncated": false
}
```

---

### 4. 文件内容 `GET /projects/{id}/files/content`

```bash
curl -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:19828/api/v1/projects/current/files/content?path=wiki/entities/concept.md"
```

```json
{
  "ok": true,
  "path": "wiki/entities/concept.md",
  "content": "---\ntitle: My Concept\n---\n..."
}
```

---

### 5. 待审阅项 `GET /projects/{id}/reviews`

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `status` | `"unresolved"` | `"unresolved"` / `"resolved"` / `"all"` |
| `type` | - | 按类型过滤，如 `"missing-page"` |
| `limit` | `200` | 最大返回数 |

```bash
curl -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:19828/api/v1/projects/current/reviews?status=unresolved&limit=10"
```

```json
{
  "ok": true,
  "projectId": "uuid-1",
  "status": "unresolved",
  "count": 3,
  "reviews": [
    {
      "id": "rev-1",
      "type": "missing-page",
      "title": "Missing page: My Topic",
      "description": "...",
      "sourcePath": "wiki/entities/ref.md",
      "affectedPages": ["wiki/entities/ref.md"],
      "searchQueries": ["My Topic"],
      "options": [{ "label": "Create page", "action": "create" }],
      "resolved": false,
      "createdAt": 1715702400000
    }
  ]
}
```

---

### 6. 更新单个审阅项 `PATCH /projects/{id}/reviews/{reviewId}`

```bash
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"resolved": true, "action": "create"}' \
  "http://127.0.0.1:19828/api/v1/projects/current/reviews/rev-1"
```

Request body:
```json
{
  "resolved": true,
  "action": "create"
}
```
- `resolved` 默认 `true`；传 `false` 可重新打开已解决项
- `action` 为任意字符串，记录解决方式

---

### 7. 批量解决审阅项 `POST /projects/{id}/reviews/resolve`

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["rev-1", "rev-2"], "action": "ignore"}' \
  "http://127.0.0.1:19828/api/v1/projects/current/reviews/resolve"
```

```json
{
  "ok": true,
  "resolved": 2,
  "notFound": 0,
  "count": 2
}
```

---

### 8. 搜索 `POST /projects/{id}/search`

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "知识图谱 构建", "topK": 5, "includeContent": false}' \
  "http://127.0.0.1:19828/api/v1/projects/current/search"
```

```json
{
  "ok": true,
  "results": [
    {
      "path": "wiki/concepts/knowledge-graph.md",
      "title": "Knowledge Graph",
      "snippet": "...知识图谱是一种...",
      "score": 0.92,
      "titleMatch": false,
      "vectorScore": 0.88
    }
  ],
  "mode": "hybrid",
  "tokenHits": 5,
  "vectorHits": 3
}
```

> 使用共享的关键词 + 向量检索。向量检索仅在配置了 embedding 时生效。

---

### 9. 知识图谱 `GET /projects/{id}/graph`

| 参数 | 说明 |
|------|------|
| `q` | 按节点标签过滤 |
| `nodeType` | 按节点类型过滤 |
| `limit` | 最大返回节点数 |

```bash
curl -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:19828/api/v1/projects/current/graph?q=AI&limit=100"
```

```json
{
  "ok": true,
  "nodes": [
    { "id": "wiki/entities/ai.md", "label": "Artificial Intelligence", "type": "entity", "path": "wiki/entities/ai.md", "linkCount": 12 }
  ],
  "edges": [
    { "source": "wiki/entities/ai.md", "target": "wiki/concepts/ml.md", "weight": 3 }
  ]
}
```

> 图谱数据来源于 `wiki/*.md` 文件中的 wikilinks。

---

### 10. 触发来源重新扫描 `POST /projects/{id}/sources/rescan`

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:19828/api/v1/projects/current/sources/rescan"
```

```json
{
  "ok": true,
  "projectId": "uuid-1",
  "result": {
    "queue": { "version": 1, "tasks": [...] },
    "changedTasks": [...]
  }
}
```

> **无需 body**，`project_id` 通过 URL 路径传递。该接口同步执行后端 rescan（扫描 `raw/sources`、`wiki` 等目录的变更）并返回本次变动的任务列表。

---

### 11. 取消所有 ingest 任务 `POST /projects/{id}/ingest/cancel-all`

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:19828/api/v1/projects/current/ingest/cancel-all"
```

```json
{
  "ok": true,
  "message": "Ingest cancel-all requested",
  "projectId": "uuid-1"
}
```

---

### 12. 激活项目 `POST /projects/activate`

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-1"}' \
  "http://127.0.0.1:19828/api/v1/projects/activate"
```

```json
{
  "ok": true,
  "message": "Project activation requested",
  "project": { "id": "uuid-1", "name": "...", "path": "/..." }
}
```

> 通过 Tauri 事件通知前端切换项目，不直接操作文件。

---

### 13. 重载配置 `POST /config/reload`

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:19828/api/v1/config/reload"
```

```json
{ "ok": true }
```

> 使后端的配置缓存失效，下次请求会从磁盘重新读取。

---

### 14. 窗口控制

```bash
# 显示窗口（无需认证，无需启用 API）
curl -X POST http://127.0.0.1:19828/api/v1/window/show

# 隐藏窗口
curl -X POST http://127.0.0.1:19828/api/v1/window/hide
```

---

### 15. Chat `POST /projects/{id}/chat`

**状态：未实现**，返回 `501`。

---

### 推荐调用示例：外部脚本触发知识库 rescan

结合之前的讨论，修正后的正确调用：

```js
const TOKEN = "your-api-token";
const PROJECT_ID = "uuid-from-/projects";  // 或 "current"
const API_BASE = "http://127.0.0.1:19828/api/v1";

// 1. 先激活目标项目
await fetch(`${API_BASE}/projects/activate`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ projectId: PROJECT_ID }),
});

// 2. 触发 rescan（无需 body，project_id 在 URL 中）
const res = await fetch(`${API_BASE}/projects/${PROJECT_ID}/sources/rescan`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${TOKEN}` },
});
const r = await res.json();
if (r.ok) {
  console.log("Rescan triggered:", r.result);
} else {
  console.error("Rescan failed:", r.error);
}
```

如果使用 TypeScript/Node.js 项目，推荐直接用内置的 MCP SDK 封装 [LlmWikiApiClient](file:///d:/Code/github/llm_wiki/mcp-server/src/api-client.ts)：

```ts
import { LlmWikiApiClient } from "./api-client";

const client = new LlmWikiApiClient({ token: "your-token" });

// 健康检查
const health = await client.health();

// 获取项目
const { projects } = await client.projects();

// 触发 rescan
await client.rescan("current");
```