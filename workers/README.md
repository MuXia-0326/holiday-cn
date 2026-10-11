# Cloudflare Workers 节假日接口

将仓库根目录的 `YYYY.json` 和 `schema.json` 在部署时打包进 Worker，不需要 KV、数据库或运行时访问 GitHub。保留每个年份的原始 JSON 字段（包括 `$schema`、`$id`），新增年份会自动被发现。原有 Python 抓取、JSON、ICS 和 `.github/workflows/main.yml` 不变。

## 首次配置

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加 Repository secrets：

| 名称 | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token，授予目标账户的 **Account / Workers Scripts / Edit** 权限，并按 Cloudflare 的 Edit Cloudflare Workers 模板配置账户读取权限 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID（不是 Zone ID） |

可选 Repository variables：

| 名称 | 默认值 | 用途 |
| --- | --- | --- |
| `CLOUDFLARE_WORKER_NAME` | `holiday-cn-api` | 建议首次使用一个新的专用 Worker 名称，避免覆盖已有其他服务 |
| `UPSTREAM_REPOSITORY` | `NateScarlet/holiday-cn` | 上游 GitHub 仓库，格式为 `owner/repo`，同步其 `master` 分支 |
| `SYNC_UPSTREAM` | 开启 | 设置为字符串 `false` 可关闭上游同步；仍会发布本仓库数据 |
| `CLOUDFLARE_CUSTOM_DOMAINS` | 未设置 | 自定义域名，多个用英文逗号分隔，如 `holiday.example.com,api.example.com` |
| `CLOUDFLARE_ROUTES` | 未设置 | Wrangler 路由 JSON 数组，如 `[{"pattern":"example.com/api/*","zone_name":"example.com"}]` |
| `CLOUDFLARE_WORKERS_DEV` | 使用仓库配置 | 设置 `true` 或 `false`，控制 Workers.dev 地址是否启用 |

然后进入 **Actions → Workers API → Run workflow**，选择 `master`。发布成功后的地址可在部署日志和 Cloudflare 控制台查看，一般为 `https://holiday-cn-api.<你的子域>.workers.dev`。

### 自定义域名和路由

建议在 Repository variables 设置 `CLOUDFLARE_CUSTOM_DOMAINS=holiday.example.com`，需要仅开放自定义域名时同时设置 `CLOUDFLARE_WORKERS_DEV=false`。域名不带 `https://`、路径或通配符，对应域名区域需要在同一 Cloudflare 账户中。

绑定已有网站的路径时，设置 `CLOUDFLARE_ROUTES=[{"pattern":"example.com/api/*","zone_name":"example.com"}]`，域名需要已有代理 DNS 记录。路由不会剥离路径前缀：此例可直接访问 `/api/holiday`，若使用 `/holiday/*` 等额外前缀，需要另行修改接口路由。

两个变量可以同时设置。请把需要保留的所有域名和路由都纳入配置；Wrangler 发布会按配置管理绑定，不能仅依赖控制台手工添加。配置不自动读取或保留控制台中额外绑定，`keep_vars` 只保留变量。

也可直接在 `workers/wrangler.jsonc` 中添加 `routes` 数组和设置 `workers_dev`，适用于本地或 Cloudflare 构建。GitHub Actions 中非空的 `CLOUDFLARE_ROUTES` 会替换文件中的路由，再追加 `CLOUDFLARE_CUSTOM_DOMAINS`；未设置变量时保留文件配置。流水线生成临时配置，不改写仓库文件。

自定义域名发布所用 API token 还需要对应区域的 **Zone / Zone / Read**、**Zone / DNS / Edit** 权限；普通路由需要 **Zone / Workers Routes / Edit** 和区域读取权限。

## 接口

| 请求 | 返回 |
| --- | --- |
| `GET /` 或 `GET /api/years` | 已发布年份列表和接口说明 |
| `GET /2026.json` | 与仓库 `2026.json` 等价的完整数据 |
| `GET /api/holidays/2026` | 同上 |
| `GET /api/holiday?date=2026-10-01` | 指定日期的节假日、休息日和调休上班信息 |
| `GET /schema.json` | 原 JSON Schema |

支持 `HEAD`、跨域 `OPTIONS`；未知年份或路径返回 JSON 404，其他请求方法返回 405。成功结果缓存 300 秒，因此发布后客户端可能需要最多五分钟看到更新。年份以文件标题为准，跨年日期的含义参见项目主 README。

### 按日期查询

请求示例：`GET /api/holiday?date=2026-10-01`。

```json
{
  "date": "2026-10-01",
  "weekday": 4,
  "isWeekend": false,
  "dataAvailable": true,
  "isHoliday": true,
  "isOffDay": true,
  "isWorkday": false,
  "isAdjustedWorkday": false,
  "name": "国庆节",
  "sourceYear": 2026
}
```

- `isHoliday`：是否为公告中明确记录的节假日放假安排（包括安排内的连休日，不表示严格法律意义的法定节日本日）。普通周末为 `false`，调休上班为 `false`。
- `isOffDay`：是否休息，包含普通周末；判断当天是否需要上班可使用 `isWorkday`。公告中的调休上班优先于周末规则。
- `isAdjustedWorkday`：是否为公告明确记录的调休上班日。`name` 为公告关联节日，调休上班日也可能有名称。
- `weekday`：星期日为 0，星期一至星期六为 1–6；日期按中国日历日期处理，不接收时间戳。
- `dataAvailable`：该年份已有公告来源，或该日期有明确记录。没有公告的空年份文件、缺失年份返回 `false`，四个放假/工作日判断字段返回 `null`，不将未知数据误判为非节假日。仍可返回确定的 `isWeekend`。
- 查询所有年份文件中的日期记录，同一日期以较新年份的记录为准，`sourceYear` 标识匹配的文件年份；普通日期为 `null`。

必须传入一个真实有效的 `YYYY-MM-DD` 日期，缺失、重复、格式错误或不存在的日期（例如 `2026-02-29`）返回 JSON 400。

## 自动更新与保留本地修改

- `master` 的 JSON、Worker 或本流水线发生变更时自动验证并发布；PR 只验证。
- 原 `CI` 在本仓库 `master` 上成功完成后，流水线重新读取最新 `master` 并发布，覆盖原 CI 用 `GITHUB_TOKEN` 提交更新不会触发 push 工作流的情况。PR 的 CI 完成事件不会触发部署。
- 每天北京时间 21:30，以及手动运行时，先普通合并上游 `master`，再验证、发布。GitHub 定时任务可能延迟，fork 中需要在 Actions 页面启用工作流。
- 同步使用 `git merge` 和普通 `git push`，保留本地提交历史，不使用 reset、rebase 或强推。合并冲突、分支保护或推送期间分支发生变化时会停止，不部署此次同步结果；解决冲突并推送后可重新运行。
- 合并会同步上游整个项目（包括上游正常的文件修改或删除），不是仅复制 JSON。不会自动抹掉与上游冲突的定制内容，但无冲突的上游变更也会应用；需要严格控制的仓库可关闭自动同步后人工合并。
- 默认 `GITHUB_TOKEN` 需要仓库允许 Actions 写入内容。如果上游修改了 `.github/workflows/`，默认 token 无法推送该修改：可配置可访问本仓库、具备 Contents 与 Workflows 写入权限的细粒度 PAT 到 `UPSTREAM_SYNC_TOKEN` secret（经典 PAT 使用 `repo`、`workflow` 权限）。受保护的分支仍需符合仓库规则，流水线不绕过保护。
- 生产流水线串行运行，验证失败不会部署。Worker 通过一次部署发布完整数据包，无需先删除旧 Worker。`keep_vars` 保留 Cloudflare 上现有变量；更新专用 Worker 的代码属于正常发布，不会创建、清空 KV 或数据库。首次选用已存在的同名 Worker 会替换其代码，请使用专用名称。

## 本地验证和发布

需要 Node.js 22：

```sh
cd workers
npm ci
npm test
npm run dev
```

`npm test` 验证所有年份数据与源文件一致，并检查路由、404、CORS 和 HTTP 方法。构建产物放入被忽略的 `src/generated/`；不会改写源 JSON。

本地发布可先 `npx wrangler login`，再 `npm run deploy`。流水线安装锁定版本的 Wrangler，只发布已经验证的构建产物。

如需回滚，在 Cloudflare 控制台的 Worker 部署历史选择上一版本。流水线部署需要实际 GitHub secrets 和 Cloudflare 账户；本地测试不能验证账户权限和公网可达性。
