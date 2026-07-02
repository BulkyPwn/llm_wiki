# Fork 修改文档

> 基准: `c03c6be16a8be2a996a2c63fde235136c2a66f01` (上游 v0.5.4)
> 本文档记录在此基础上叠加上去的所有 fork 特有改动，便于未来拉取主库新版本后重新合并。

---

## 一、Rust 后端

### 1.1 API Server (`src-tauri/src/api_server.rs`)

| 功能 | 路由 | 说明 |
|------|------|------|
| **Window hide** | `POST /api/v1/window/hide` | 隐藏窗口到系统托盘，配合 headless 模式 |
| **Ingest cancel-all** | `POST /api/v1/projects/:id/ingest/cancel-all` | 取消项目所有 ingest 任务 |
| **Project activate** | `POST /api/v1/projects/activate` | API 激活项目（触发前端文件扫描 + 自动入队） |
| **Config reload** | `POST /api/v1/config/reload` | 重载 `app-state.json` 配置（无需重启） |

新增结构体: `ActivateProjectRequest { path }`, `CancelAllRequest { project_id }`

### 1.2 应用入口 (`src-tauri/src/lib.rs`)

| 改动 | 说明 |
|------|------|
| `tauri_plugin_single_instance` 插件 | 防止多实例运行，重复启动时唤起已有窗口 |
| `show_window` / `hide_window` Tauri command | headless 模式下编程控制窗口显隐 |
| `LLM_WIKI_HEADLESS` 环境变量支持 | 设置后应用启动不显示窗口 |
| `set_close_behavior` / 窗口显隐命令注册 | 补充 invoke_handler 注册 |

### 1.3 CLI 参数 (`src-tauri/src/main.rs`)

新增 `-v` / `--version` 和 `-h` / `--help` 命令行参数。

### 1.4 编译配置

| 文件 | 改动 |
|------|------|
| `src-tauri/.cargo/config.toml` | **新增文件**。Windows 构建使用 `rust-lld` 链接器加速链接 |
| `src-tauri/Cargo.toml` | 版本号 `0.5.4-1`；新增 `tauri-plugin-single-instance` 依赖 |
| `src-tauri/tauri.conf.json` | 版本号 `0.5.4.1`；`productName` 改为 `LLM_Wiki`；窗口默认 `visible: false` |

---

## 二、前端核心逻辑

### 2.1 Ingest max_tokens 上限 (`src/lib/ingest.ts`)

`computeIngestGenerationMaxTokens()` 增加 Custom 端点判断：
- **Custom 预设**：从 `llmConfig.ingestMaxTokens` 读取上限（默认 20480），对动态计算值做 `Math.min`
- **其他预设**：不截断，保持上游原有的动态分级
- 旧的上游代码 `return INGEST_GENERATION_TOKENS_XXX` 改为更清晰的 `if/else if + 最终截断` 结构

### 2.2 Ingest 并发度可配置

| 文件 | 改动 |
|------|------|
| `src/stores/wiki-store.ts` | `LlmConfig` 新增 `ingestMaxTokens?: number`（默认 20480）；`WikiState` 新增 `ingestConcurrency: number`（默认 5）及 setter |
| `src/lib/project-store.ts` | 新增 `reloadStore()`（强制刷新 in-memory store），新增 `saveIngestConcurrency()` / `loadIngestConcurrency()` |
| `src/components/settings/settings-types.ts` | `SettingsDraft` 新增 `ingestMaxTokens` / `ingestConcurrency` |
| `src/components/settings/settings-view.tsx` | `initialDraft()` 增加 `ingestConcurrency` 参数；`handleSave` 中写入并持久化 |
| `src/components/settings/sections/llm-provider-section.tsx` | Custom 预设下显示 `ingestMaxTokens` 数字输入框 |
| `src/components/settings/sections/output-section.tsx` | 输出偏好页新增 ingest 并发度输入框（1-100） |

### 2.3 App 入口 (`src/App.tsx`)

| 改动 | 说明 |
|------|------|
| 启动时加载 `ingestConcurrency` | 从 `app-state.json` 恢复并发度配置 |
| `api://config-reload` 事件 | 重载时同步 `ingestConcurrency` |
| `api://project-activate` 事件 | 激活项目后自动扫描 `raw/sources/` 并入队未 ingest 的文件 |
| `api://ingest-cancel-all` 事件 | 监听并执行全量取消 ingest 任务 |
| 多实例唤起处理 | 第二个实例启动时聚焦已有窗口 |

### 2.4 Sources 视图 (`src/components/sources/sources-view.tsx`)

文件树刷新后同步更新 sources 列表状态（1 行改动）。

---

## 三、国际化 (`src/i18n/`)

| Key | 中文 | 英文 |
|-----|------|------|
| `settings.sections.output.ingestConcurrency` | Ingest 并发数 | Ingest concurrency |
| `settings.sections.output.ingestConcurrencyHint` | Ingest 期间最大并行 LLM 请求数… | Max parallel LLM requests during ingest… |
| `settings.sections.llm.ingestMaxTokens` | Ingest 最大输出 Token | Ingest max output tokens |
| `settings.sections.llm.ingestMaxTokensHint` | 仅对 Custom 端点生效… | Custom endpoint only… |

---

## 四、构建脚本

| 文件 | 说明 |
|------|------|
| `build.ps1` | Windows 构建脚本（支持带签名打包） |
| `run.ps1` | Windows 运行脚本 |
| `scripts/inject-path-installer.mjs` | 安装包路径注入 |
| `scripts/repackage-installer.mjs` | 安装包重新打包 |
| `postcss.config.mjs` | PostCSS 配置 |

---

## 五、文档

`docs/迁移代码.md` — 从原始 fork 仓库迁移时的代码变更记录（1680 行）。

---

## 六、版本号

| 文件 | 版本 |
|------|------|
| `package.json` | `0.5.4.1` |
| `src-tauri/tauri.conf.json` | `0.5.4.1` |
| `src-tauri/Cargo.toml` | `0.5.4-1`（Cargo semver 限制） |

---

## 七、未来合并注意事项

1. **`ingest-queue.ts` 与 `ingest.ts`**：Fork 未改动。上游日后若重构，注意 `getMaxConcurrent()` 读取 `state.ingestConcurrency` 的逻辑需保留。
2. **`api_server.rs`**：4 个新增路由集中插入在路由 match 块末尾，合并时检查位置和导入。
3. **`lib.rs`**：`show_window` / `hide_window` 是两个独立 Tauri command，`tauri_plugin_single_instance` 插件注册在 `Builder` 链首，headless 逻辑在 setup 闭包末尾。
4. **版本号文件**：每次合并后需手动更新 `package.json` / `tauri.conf.json` / `Cargo.toml` 中的版本后缀。
5. **新增文件（不冲突但需检查）**：`build.ps1`, `run.ps1`, `scripts/`, `src-tauri/.cargo/config.toml`, `postcss.config.mjs`, `docs/迁移代码.md`
