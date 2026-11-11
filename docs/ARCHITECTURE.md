# ARCHITECTURE — vì sao 1 repo / 3 server / 3 process

## Quyết định

- **1 repo** (monorepo npm workspaces + 1 package Python).
- **3 server riêng, 3 process riêng, 3 entry MCP riêng.**
- **1 package shared** cho lớp an toàn dùng chung.

Không gộp 3 server thành 1 process. Không chia thành 3 repo (trừ khi
một server có đời sống riêng — xem cuối file).

## Vì sao server phải tách

| | Play operate | Play analytics | App Store operate |
|---|---|---|---|
| Auth | Service account JSON (Google) | Service account, quyền đọc bucket GCS | JWT `.p8` + Key ID + Issuer ID (Apple) |
| Nguồn dữ liệu | Android Publisher API v3 + Reporting API | CSV bulk export trong `pubsite_prod_rev_*` | App Store Connect API |
| Quyền | Có thể ghi (release, listing, sub) | **Chỉ đọc, không có tool ghi** | Có thể ghi (submit, IAP, metadata) |
| Ngôn ngữ | TypeScript | Python (FastMCP) | TypeScript |
| Độ trễ | Gần realtime | Lag 1–2 ngày | Report phải chờ COMPLETED |

Gộp chung process thì 1 key lộ / 1 server crash kéo cả hệ thống theo,
và không thể bật analytics read-only suốt ngày trong khi operate chỉ
bật khi cần.

## Ranh giới package

```
packages/shared/             # Không biết gì về Play hay Apple.
  src/index.ts               # filterTools, isWriteTool, destructiveGate,
                             # redact, translateError, parseServerArgs
packages/play-operate/       # Chỉ biết Play Publisher API.
  src/profiles.ts            # profile -> tiền tố tool (file mới)
  src/safety.ts              # re-export shared + profiles (file mới)
  src/overlay/server.ts      # filtered server quanh upstream allTools (file mới)
  src/overlay/index.ts       # parse --workers/--read-only/--help (file mới)
  src/server.ts, src/index.ts # UPSTREAM, KHÔNG SỬA — để subtree pull sạch
packages/appstore-operate/   # Chỉ biết App Store Connect API.
  src/profiles.ts            # profile -> substring tool name (file mới)
  src/safety.ts              # (file mới)
  src/overlay/server.ts, src/overlay/index.ts  # (file mới, như play-operate)
  src/server.ts, src/index.ts # UPSTREAM, KHÔNG SỬA
packages/play-analytics/     # Chỉ biết GCS CSV. Không sửa logic upstream.
  server.py, gp_client.py    # Giữ nguyên, chỉ thêm README-FORK.md
```

Quy tắc: `shared` không import từ package nào khác. Mỗi operate server
chỉ import `shared` + `profiles` của chính nó. Analytics không import
`shared` (Python, giữ nguyên upstream).

## Worker profiles — mượn từ asc-mcp

Devinwang upstream không có khái niệm filter: lúc nào cũng expose toàn bộ
1316 / 157 tools. Monorepo này graft `--workers` kiểu asc-mcp:

- Play: `apps, release, listings, reviews, monetization, vitals, full`
- App Store: `apps, builds, testflight, monetization, marketing, analytics, full`

`--read-only` và destructive gate mượn từ asc-mcp + OrellBuehler:
read-only chặn ở cả ListTools lẫn CallTool, delete/remove/revoke cần
`STORE_MCP_ALLOW_DESTRUCTIVE=1` hoặc `{ "confirm": true }`.

## Khi nào tách repo?

Chỉ tách khi 1 server có đời sống riêng: được cộng đồng dùng nhiều,
có contributor khác, release cadence khác hẳn, hoặc license khác.
Lúc đó tách bằng cách lấy nguyên thư mục `packages/<tên>` ra —
ranh giới package đã có sẵn nên việc tách là cơ học, không phải refactor.

## TODO (chưa làm — ghi rõ, không giả vờ đã có)

1. **Composite `deploy_app` 1-shot** (ý tưởng antoniolg/play-store-mcp):
   upload bundle + chọn track + release notes + rollout trong 1 tool.
   File sẽ làm: `packages/play-operate/src/tools/deploy.ts` (mới) +
   đăng ký trong `src/tools/index.ts`. Chưa có file này.
2. **ASO audit kiểu fil-technology/appstore-api-mcp**: audit toàn portfolio
   (keyword trống, thiếu subtitle, listing 1 locale, thiếu screenshot),
   dry-run diff old → new.
   File sẽ làm: `packages/appstore-operate/src/tools/as-audit.ts` (mới)
   + `packages/play-operate/src/tools/aso-audit.ts` (mới). Chưa có.
3. **Beta feedback kiểu testflight-mcp (OrellBuehler)**:
   screenshot feedback, crash feedback/logs, tester/groups.
   App Store đã có 1 phần qua generated tools (`beta_feedback_*`),
   nhưng chưa có tool tổng hợp "tóm tắt feedback của build X".
   File sẽ làm: `packages/appstore-operate/src/tools/beta-feedback.ts` (mới). Chưa có.
4. **PostgreSQL snapshot daily** (phase 2): chỉ làm khi cần so sánh trend
   xuyên store theo ngày/tuần. Không làm trước — xem `docs/METRICS.md`.
5. **Test cho operate servers**: hiện chỉ có test cho `packages/shared`.
   Upstream devinwang vốn không có unit test; cần thêm test cho
   `profileForTool` + `filterTools` ở mỗi operate server khi sửa tiếp.
