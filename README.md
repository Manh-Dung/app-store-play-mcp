# store-mcp — 1 repo, 3 MCP servers (Play + App Store)

Monorepo MCP để quản lý app trên Google Play và App Store bằng AI agent.
**1 repo, 3 server riêng, 3 process riêng** — không gộp thành 1 server,
vì auth, API và quyền của 3 server khác nhau hoàn toàn.

| Server | Package | Nền | Ngôn ngữ | Tools (upstream) | Ghi |
|---|---|---|---|---|---|
| play-operate | `packages/play-operate` | devinwang/google-play-developer-mcp | TypeScript | 157 | Release, listing, review, monetization, vitals |
| play-analytics | `packages/play-analytics` | desunit/google-play-analytics-mcp | Python | 18 | **Chỉ đọc.** Installs, search terms, UTM, conversion |
| appstore-operate | `packages/appstore-operate` | devinwang/app-store-connect-mcp | TypeScript | 1316 | Apps, builds, TestFlight, IAP, subscriptions, analytics, sales |

Shared safety layer: `packages/shared` — xem `docs/ARCHITECTURE.md`.

> **Repo này không phải GitHub Fork.** Fork public thì không private được —
> đây là repo mới + `git subtree --squash` từ 3 repo MIT (xem `docs/SYNC.md`
> và `upstream-versions.json`). Target trên GitHub:
> `github.com/Manh-Dung/app-store-play-mcp` — repo này hiện đang **PUBLIC,
> trống, chưa push gì**; chốt visibility (public/private) trong Settings
> trước khi push lần đầu.

## Chạy

```bash
npm install          # root workspaces (TS packages)
npm run build        # build shared + 2 package TS
npm run typecheck

# Play analytics (Python, riêng)
cd packages/play-analytics
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
python3 -m py_compile server.py gp_client.py
```

Mỗi server có `--help` (không cần credential):

```bash
node packages/play-operate/dist/overlay/index.js --help
node packages/appstore-operate/dist/overlay/index.js --help
```

## Cấu hình

Copy `.mcp.json.example` sang config của MCP client, thay
`/ABSOLUTE/PATH/TO/...` bằng đường dẫn thật trên máy anh, và điền
key/bucket theo `docs/SETUP.md`. **Không commit key thật, xem `.gitignore`.**

```json
{
  "mcpServers": {
    "play-operate":     { "command": "node", "args": ["<repo>/packages/play-operate/dist/overlay/index.js", "--workers", "release,reviews,listings"] },
    "play-analytics":   { "command": "<repo>/packages/play-analytics/.venv/bin/python", "args": ["<repo>/packages/play-analytics/server.py"] },
    "appstore-operate": { "command": "node", "args": ["<repo>/packages/appstore-operate/dist/overlay/index.js", "--workers", "apps,builds,testflight"] }
  }
}
```

### Worker profiles (kiểu asc-mcp `--workers`)

Play operate: `apps, release, listings, reviews, monetization, vitals, full`
App Store operate: `apps, builds, testflight, monetization, marketing, analytics, full`

Ví dụ chỉ bật release + reviews cho Play:

```bash
node packages/play-operate/dist/overlay/index.js --workers release,reviews
```

### An toàn — đọc kỹ trước khi bật tool ghi

- `--read-only` (hoặc `STORE_MCP_READ_ONLY=1`): chặn mọi tool ghi ở phía
  server. ListTools không quảng cáo tool ghi, CallTool cũng từ chối.
- Tool phá hoại (`delete` / `remove` / `revoke` / `clear`) cần thêm
  `STORE_MCP_ALLOW_DESTRUCTIVE=1` hoặc `{ "confirm": true }` trong tool call.
  Mặc định là **chặn**.
- Key/service account chỉ cấp quyền tối thiểu — xem `docs/SETUP.md`.
- Output được redact (JWT, Bearer token, PEM private key) trước khi trả về agent.
- Play analytics không có tool ghi nào, service account chỉ cần quyền đọc bucket.

## Docs

- `docs/SETUP.md` — tạo service account Play, key App Store `.p8`, bucket GCS
- `docs/ARCHITECTURE.md` — vì sao 1 repo / 3 server / 3 process
- `docs/METRICS.md` — mapping metric Play vs App Store (không tương đương 1-1)
- Mỗi package có `README-FORK.md` ghi nguồn gốc và thay đổi so với upstream.

## Chưa làm (TODO)

Xem `docs/ARCHITECTURE.md` mục TODO: composite `deploy_app` 1-shot kiểu
antoniolg, ASO audit kiểu fil, beta feedback kiểu testflight-mcp.
Những thứ này được ghi rõ là chưa làm, không giả vờ đã có.

## License

MIT — xem `LICENSE`. Upstream LICENSE được giữ nguyên trong từng package.
