# Fork 修改文档

> 基准提交: `c03c6be16a8be2a996a2c63fde235136c2a66f01` (上游 v0.5.4)
> 本文档记录在此基础上叠加的所有 fork 特有改动，用于未来拉取主库新版本后参考合并。

**26 个文件变更，+3228/-17 行**

---

## 一、Rust 后端

### 1.1 API Server (`src-tauri/src/api_server.rs`)

新增 4 个 HTTP 路由，插入在路由 match 块末尾：

| 路由 | 功能 |
|------|------|
| `POST /api/v1/window/hide` | 隐藏窗口到系统托盘（headless 模式） |
| `POST /api/v1/projects/:id/ingest/cancel-all` | 取消项目所有 ingest 任务 |
| `POST /api/v1/projects/activate` | API 激活项目（触发前端文件扫描 + 自动入队） |
| `POST /api/v1/config/reload` | 重载 `app-state.json` 配置并通知前端刷新 |

新增结构体: `ActivateProjectRequest { path }`, `CancelAllRequest { project_id }`, 新增 `load_source_watch_config()` 函数。配置文件修改后自动 emit `api://config-reload` 事件通知前端。

### 1.2 应用入口 (`src-tauri/src/lib.rs`)

| 改动 | 位置 | 说明 |
|------|------|------|
| `tauri_plugin_single_instance` 插件 | `Builder` 链 | 防止多实例，重复启动时唤起已有窗口 |
| `show_window` / `hide_window` Tauri command | 函数定义区 | headless 模式编程控制窗口显隐 |
| `LLM_WIKI_HEADLESS` 环境变量 | `setup` 闭包末尾 | 设置后应用启动不显示窗口 |
| 命令注册 | `invoke_handler` | 追加 `show_window` / `hide_window` / `set_close_behavior` |

### 1.3 CLI 参数 (`src-tauri/src/main.rs`)

新增 `-v` / `--version` 和 `-h` / `--help` 参数，打印版本号和使用说明后退出。

### 1.4 编译与配置

| 文件 | 改动 |
|------|------|
| `.cargo/config.toml` | **新增**。Windows 构建使用 `rust-lld` 链接器 |
| `Cargo.toml` | 版本 `0.5.4`；新增 `tauri-plugin-single-instance` 依赖 |
| `tauri.conf.json` | 版本 `0.5.4`；`productName` → `LLM_Wiki`；窗口默认 `visible: false` |

---

## 二、前端核心逻辑

### 2.1 Ingest max_tokens 上限 (`src/lib/ingest.ts`)

`computeIngestGenerationMaxTokens()` 增加 Custom 端点判断：
- Custom 预设: 从 `llmConfig.ingestMaxTokens` 读取上限（默认 20480），对动态计算值做 `Math.min`
- 其他预设: 不截断，保持上游原有的动态分级
- 结构从 `return INGEST_GENERATION_TOKENS_XXX` 改为 `if/else if + 最终截断`

### 2.2 Ingest 并发度可配置

#### Store 层 (`src/stores/wiki-store.ts`)

- `LlmConfig` 新增 `ingestMaxTokens?: number`（默认 20480）
- `WikiState` 新增 `ingestConcurrency: number`（默认 5）及 setter
- 新增 `IngestTimeSlot` 接口导出（`id`, `label`, `startHour`, `endHour`, `concurrency`）
- `WikiState` 新增 `ingestConcurrencyScheduleEnabled`（默认 false）+ `ingestConcurrencySchedule`（默认 []）及对应 setter

#### 持久化 (`src/lib/project-store.ts`)

- 新增 `reloadStore()` — 强制刷新 in-memory store，用于外部修改 `app-state.json` 后同步
- 新增 `saveIngestConcurrency()` / `loadIngestConcurrency()` — 持久化并发度配置

#### Settings 层

| 文件 | 改动 |
|------|------|
| `settings-types.ts` | `SettingsDraft` 新增 `ingestMaxTokens`, `ingestConcurrency`, `ingestConcurrencyScheduleEnabled`, `ingestConcurrencySchedule` |
| `settings-view.tsx` | `initialDraft()` 增加 schedule 参数；两个调用点多传 `ingestConcurrencyScheduleEnabled` + `ingestConcurrencySchedule`；`handleSave` 写入并持久化 |
| `llm-provider-section.tsx` | Custom 预设下显示 `ingestMaxTokens` 数字输入框 |
| `output-section.tsx` | 大幅扩展：新增 flat 并发度输入框 + 按时段配置面板（开关 toggle、slot 增删改、时间重叠检测并红色高亮、跨午夜范围支持） |

### 2.3 Ingest 队列 (`src/lib/ingest-queue.ts`)

新增 `export function getMaxConcurrent()`:
- 读取 store 中 `ingestConcurrencySchedule` 各 slot
- 按时段匹配当前小时（支持跨午夜 `22:00→06:00` 场景）
- 无匹配时回退到 flat `ingestConcurrency`（默认 5）

### 2.4 App 入口 (`src/App.tsx`)

| 改动 | 说明 |
|------|------|
| `loadIngestConcurrency` | 启动时从 `app-state.json` 恢复并发度 |
| `api://config-reload` 事件 | 重载时同步 `ingestConcurrency` + `ingestConcurrencySchedule` |
| `api://project-activate` 事件 | 激活项目后自动扫描 `raw/sources/` 并入队未 ingest 的文件 |
| `api://ingest-cancel-all` 事件 | 监听并执行全量取消 ingest 任务 |
| API reload 函数 | 追加 `loadIngestConcurrency` 导入和调用 |
| 多实例唤起 | 第二个实例启动时聚焦已有窗口 |

### 2.5 Sources 视图 (`src/components/sources/sources-view.tsx`)

文件树刷新后同步更新 sources 列表状态（1 行改动）。

---

## 三、国际化

| Key（均位于 `settings.sections.output.*`） | 中文 | 英文 |
|---|---|---|
| `ingestConcurrency` | Ingest 并发数 | Ingest concurrency |
| `ingestConcurrencyHint` | Ingest 期间最大并行 LLM 请求数… | Max parallel LLM requests during ingest… |
| `scheduleEnableLabel` | 按时段配置并发 | Time-based concurrency |
| `scheduleEnableHint` | 为一天中不同时段设置不同的并发限制… | Set different concurrency limits for different times of day… |
| `scheduleHint` | 定义时间段（起始小时包含，结束小时不包含）… | Define time ranges (inclusive start, exclusive end)… |
| `scheduleEmpty` | 暂无时段，请在下方添加。 | No time slots defined. Add one below. |
| `slotLabel` | 标签 | Label |
| `slotLabelPlaceholder` | 例如：夜间 | e.g. Night |
| `slotStart` | 起始 | Start |
| `slotEnd` | 结束 | End |
| `slotConcurrency` | 并发 | Concur. |
| `slotRemove` | 删除 | Remove |
| `slotAdd` | + 添加时段 | + Add time slot |
| `slotOverlapWarning` | 此时段与另一个时段存在时间重叠。 | This time slot overlaps with another slot. |
| `stateOn` | 开 | ON |
| `stateOff` | 关 | OFF |

另有 2 个 key 位于 `settings.sections.llm.*`：

| Key | 中文 | 英文 |
|---|---|---|
| `ingestMaxTokens` | Ingest 最大输出 Token | Ingest max output tokens |
| `ingestMaxTokensHint` | 仅对 Custom 端点生效… | Custom endpoint only… |

---

## 四、构建脚本（新增文件）

| 文件 | 说明 |
|------|------|
| `build.ps1` | Windows 构建脚本（支持带签名打包） |
| `run.ps1` | Windows 运行脚本 |
| `scripts/inject-path-installer.mjs` | 安装包路径注入 |
| `scripts/repackage-installer.mjs` | 安装包重新打包 |
| `postcss.config.mjs` | PostCSS 配置 |

---

## 五、版本号

| 文件 | 版本 |
|------|------|
| `package.json` | `0.5.4` |
| `src-tauri/tauri.conf.json` | `0.5.4` |
| `src-tauri/Cargo.toml` | `0.5.4`（Cargo semver 限制） |

---

## 六、文档

`docs/迁移代码.md` — 从原始 fork 仓库迁移时的代码变更记录（1680 行，新增文件）。

---

## 七、未来合并注意事项

1. **`api_server.rs`**: 4 个新增路由集中插入在路由 match 块末尾。合并时检查路由函数的导入和 `#[tauri::command]` 注册是否齐全。

2. **`lib.rs`**: `show_window` / `hide_window` 是两个独立 Tauri command。`tauri_plugin_single_instance` 插件注册在 `Builder` 链首。headless 逻辑在 setup 闭包末尾。合并时需确保这些块不被遗漏。

3. **`ingest-queue.ts`**: 新增 `getMaxConcurrent()` 从 store 读取 schedule 字段。上游日后若重构并发实现，需保留此函数或将其逻辑迁移到新的并发控制点。

4. **`ingest.ts`**: `computeIngestGenerationMaxTokens()` 的 Custom 截断逻辑仅改动函数体中部。上游若重构 token 计算，需检查 custom 截断是否被覆盖。

5. **`wiki-store.ts`**: `IngestTimeSlot` 接口 + schedule 字段在 `ScheduledImportConfig` 之后定义。上游若新增 import config 相关类型，注意位置不冲突。

6. **版本号文件**: 每次合并后需手动更新 `package.json` / `tauri.conf.json` / `Cargo.toml` 的版本后缀。

7. **新增文件（不冲突但需检查携带）**:
   - `build.ps1`, `run.ps1`
   - `scripts/inject-path-installer.mjs`, `scripts/repackage-installer.mjs`
   - `src-tauri/.cargo/config.toml`
   - `postcss.config.mjs`
   - `docs/迁移代码.md`
