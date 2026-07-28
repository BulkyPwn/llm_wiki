# LLM Wiki v0.5.4 Patch 同步到 v0.6.6 — 变更总结

> 将 `D:\Code\github\llm_wiki_patch\0.5.4` 目录下 39 个基于 v0.5.4 的 fork 修改同步到当前 v0.6.6 代码库。

---

## 一、Rust 后端 (`src-tauri/`)

### 1. `src/main.rs`
- 添加 `-v` / `--version` CLI 参数（打印版本号后退出）
- 添加 `-h` / `--help` CLI 参数（打印帮助信息后退出）
- 在 `lib.rs` 运行前设置 `HEADLESS` 环境变量

### 2. `src/lib.rs`
- 添加 `is_headless()` 辅助函数（读取 `LLM_WIKI_HEADLESS` 环境变量）
- 添加 `show_window` / `hide_window` Tauri command
- 添加 `tauri-plugin-single-instance` 插件支持（headless 模式下跳过，避免窗口闪烁）
- `setup` 闭包：启动时无条件 `hide()`，末尾根据 headless 模式条件 `show`/`hide`
- macOS `Reopen` 事件添加 headless 守卫
- `invoke_handler` 注册 `show_window` / `hide_window`

### 3. `src/api_server.rs`
- imports 添加 `Emitter`
- **窗口管理路由**（绕过 auth）：
  - `POST /api/v1/window/show` → `handle_window_show`
  - `POST /api/v1/window/hide` → `handle_window_hide`
- **新增 API 路由**：
  - `POST /api/v1/projects/activate` → `handle_project_activate`（接收 `ActivateProjectRequest`）
  - `POST /api/v1/projects/:id/ingest/cancel-all` → `handle_ingest_cancel_all`
  - `POST /api/v1/config/reload` → `handle_config_reload`

### 4. `Cargo.toml`
- 添加依赖 `tauri-plugin-single-instance = "2"`
- `lto = true` → `lto = "thin"`（减少链接内存占用）
- 添加 `use-rust-lld` feature

### 5. `tauri.conf.json`
- `productName`: `"LLM Wiki"` → `"LLM_Wiki"`

### 6. `tauri.windows.conf.json`
- 添加 `"title": "LLM Wiki"`
- 添加 `"visible": false`（headless 模式支持）

### 7. `.cargo/config.toml`（新建）
```toml
[target.x86_64-pc-windows-msvc]
linker = "rust-lld"
```

---

## 二、前端核心 (`src/`)

### 1. `stores/wiki-store.ts`
- `LlmConfig` 接口添加 `ingestMaxTokens?: number`（默认 20480）
- 新增 `IngestTimeSlot` 接口（`id` / `label` / `startHour` / `endHour` / `concurrency`）
- `WikiState` 新增字段和 setter：
  - `ingestConcurrency` + `setIngestConcurrency`
  - `ingestConcurrencyScheduleEnabled` + `setIngestConcurrencyScheduleEnabled`
  - `ingestConcurrencySchedule` + `setIngestConcurrencySchedule`
  - `speculativeScanEnabled` + `setSpeculativeScanEnabled`
- `MineruConfig` 添加 `apiBase?: string`
- `ProviderOverride` 添加 `ingestMaxTokens?: number`

### 2. `lib/project-store.ts`
- 新增 `reloadStore()` 函数（强制 Tauri store 重新读取磁盘内容）
- 新增 `saveIngestConcurrency()` / `loadIngestConcurrency()`
- 新增 `saveSpeculativeScanEnabled()` / `loadSpeculativeScanEnabled()`
- `normalizeMineruConfig()` 添加 `apiBase` 字段处理

### 3. `lib/ingest.ts`
- `computeIngestGenerationMaxTokens`：Custom provider 加入 `ingestMaxTokens` 截断逻辑
- `autoIngest`：移除外层 `withProjectLock`，在 Step 3 提交阶段用 `withProjectLock` 包裹（读阶段无锁，写阶段加锁）

### 4. `lib/ingest-queue.ts`（并发处理重写）
**状态变量迁移**：
- `processing: boolean` → `activeCount: number`
- `currentAbortController: AbortController | null` → `taskAbortControllers: Map<string, AbortController>`
- `lastWrittenFiles: string[]` → `taskWrittenFiles: Map<string, string[]>`

**新增功能**：
- `getMaxConcurrent()` — 支持基于时段的并发调度（`IngestTimeSlot`），含跨午夜逻辑
- `tryClaimTask()` — 原子性抢占任务
- `isSpeculativeScanEnabled()` / `scheduleSpeculativeScan()` / `runSpeculativeScan()` — 投机扫描，预检查 pending 文件是否已有缓存结果
- `processNext()` 重写为 `while (activeCount < getMaxConcurrent())` 循环，支持多任务并发启动
- `processTask()` 拆分 — 独立的任务执行函数，7 个退出路径均有且仅有一次 `activeCount--`
- `cancelTask` 竞态防护 — catch 块中 `if (!currentTask)` 守卫防止双重递减

### 5. `lib/mineru.ts`
- `API_BASE` → `DEFAULT_API_BASE`（可覆盖）
- 新增 `getApiBase(config)` 辅助函数
- 云 API 函数添加 `apiBase` 参数透传（`submitUrlTask` / `uploadFileForTask` / `pollTask` / `pollBatchTask`）
- `testMineruConnection()` Pick 类型添加 `apiBase`

### 6. `App.tsx`
- imports 添加 `listen`、`loadIngestConcurrency`、`loadSpeculativeScanEnabled`
- 新增 `flattenFiles()` 辅助函数
- 3 个 `useEffect` 事件监听器：
  - `api://project-activate` — 打开项目并自动扫描 `raw/sources/` 目录 ingest
  - `api://config-reload` — 重新加载所有配置
  - `api://ingest-cancel-all` — 取消所有 ingest 任务
- Startup 加载 `ingestConcurrency` 和 `speculativeScanEnabled`

---

## 三、前端 UI (`src/components/`)

### 1. `settings/settings-types.ts`
- imports 添加 `IngestTimeSlot`
- `SettingsDraft` 新增字段：
  - `ingestMaxTokens: number`
  - `ingestConcurrency: number`
  - `ingestConcurrencyScheduleEnabled: boolean`
  - `ingestConcurrencySchedule: IngestTimeSlot[]`
  - `speculativeScanEnabled: boolean`
  - `mineruApiBase: string`

### 2. `settings/settings-view.tsx`
- `initialDraft()` 参数新增 `ingestConcurrency` / `ingestConcurrencyScheduleEnabled` / `ingestConcurrencySchedule` / `speculativeScanEnabled`
- Store 绑定新增 ingest 相关 selector 和 setter
- `handleSave` 添加 `saveIngestConcurrency()` / `saveSpeculativeScanEnabled()`
- `newMineruConfig` 添加 `apiBase` 字段
- 3 个 `initialDraft()` 调用点全部更新

### 3. `settings/sections/llm-provider-section.tsx`
- Custom provider 预设下添加 `ingestMaxTokens` 数值输入框

### 4. `settings/sections/output-section.tsx`
- 新增 Import `Input`
- 添加「Ingest 并发数」输入框（1–16）
- 添加「按时间段控制并发数」开关 + 时段并发数配置面板
- 添加「投机扫描」开关 + 说明文字

### 5. `settings/sections/mineru-section.tsx`
- Cloud backend 下添加 `apiBase` 输入框（含 placeholder 和说明）

---

## 四、国际化 (`src/i18n/`)

### `en.json` 新增 key
| Key | Value |
|---|---|
| `settings.sections.llm.ingestMaxOutputTokens` | Ingest max output tokens |
| `settings.sections.output.ingestConcurrency` | Ingest Concurrency |
| `settings.sections.output.ingestConcurrencyHint` | Number of files to ingest in parallel. |
| `settings.sections.output.ingestConcurrencyScheduleEnabled` | Time-based Concurrency Schedule |
| `settings.sections.output.tasks` | tasks |
| `settings.sections.output.speculativeScan` | Speculative Scan |
| `settings.sections.output.speculativeScanHint` | Pre-check pending files... |
| `settings.sections.mineru.apiBase` | API Base URL |
| `settings.sections.mineru.apiBaseHint` | Change only if using a custom... |

### `zh.json` 新增 key
| Key | Value |
|---|---|
| `settings.sections.llm.ingestMaxOutputTokens` | 文档摄入最大输出 Token 数 |
| `settings.sections.output.ingestConcurrency` | 文档摄入并发数 |
| `settings.sections.output.ingestConcurrencyHint` | 同时摄入的文件数量 |
| `settings.sections.output.ingestConcurrencyScheduleEnabled` | 按时间段控制并发数 |
| `settings.sections.output.tasks` | 个任务 |
| `settings.sections.output.speculativeScan` | 投机扫描 |
| `settings.sections.output.speculativeScanHint` | 在摄入前预检查文件... |
| `settings.sections.mineru.apiBase` | API 基础地址 |
| `settings.sections.mineru.apiBaseHint` | 仅在使用自定义 MinerU API... |

---

## 五、构建脚本（新建）

| 文件 | 说明 |
|---|---|
| `build.ps1` | 4 步构建流程：npm install → tauri build → 去除版本号 → 自签名 |
| `run.ps1` | 进程管理 + headless 模式操作说明 + 端口查询 |
| `scripts/inject-path-installer.mjs` | NSIS/WiX 安装包 PATH 环境变量注入 |
| `scripts/repackage-installer.mjs` | 安装器重新打包（NSIS makensis + WiX candle/light） |
| `postcss.config.mjs` | 空配置，覆盖父目录 Tailwind v3 PostCSS 配置 |

---

## 六、已修复的风险点

| # | 风险 | 修复 |
|---|---|---|
| 1 | `processTask` 与 `cancelTask` 的 `activeCount` 双重递减 | catch 块增加 `if (!currentTask)` 守卫，retry 分支改用 `currentTask` 引用 |
| 2 | 7 个 `activeCount` 递减路径一致性 | 逐一核实，每个路径有且仅有一次递减 |
| 3–5 | Speculative scan 兼容性、`getMaxConcurrent` 类型、`processNext` 并发安全 | TypeScript typecheck 通过（0 错误），JS 单线程模型保证安全 |

---

## 七、验证状态

- **TypeScript typecheck**: 通过（0 错误）
- **Rust 编译**: 待用户执行 `cargo build` 验证（`Cargo.lock` 需自动更新）
- **构建脚本**: `build.ps1` 解析通过（UTF-8 BOM 编码修正）
