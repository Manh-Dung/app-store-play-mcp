# SYNC — cập nhật 3 package từ upstream (git subtree)

Repo này **không phải GitHub Fork** — fork public thì không private được.
Đây là repo mới (dự kiến private) + `git subtree` từ 3 repo MIT:

| Package | Remote | Upstream |
|---|---|---|
| `packages/play-operate` | `upstream-play` | https://github.com/devinwang/google-play-developer-mcp |
| `packages/appstore-operate` | `upstream-appstore` | https://github.com/devinwang/app-store-connect-mcp |
| `packages/play-analytics` | `upstream-analytics` | https://github.com/desunit/google-play-analytics-mcp |

Upstream HEAD tại thời điểm scaffold (xem thêm `upstream-versions.json`):

| Package | Upstream HEAD | Ngày sync |
|---|---|---|
| play-operate | `ffe25df6cfe27bce5234fdd1b6e5df48e91f7629` | 2026-11-12 |
| appstore-operate | `00a92f9549665ed37152af94d1497fa73e509001` | 2026-11-12 |
| play-analytics | `07fc5cf511615d4d3a406e6ca7c795fa0d3b0e67` | 2026-11-12 |

## Quy trình sync

```bash
git fetch upstream-play upstream-appstore upstream-analytics
./scripts/sync-upstream.sh all        # hoặc: play | appstore | analytics
```

Script chạy `git subtree pull --prefix=<package> <remote> main --squash`
cho từng package, rồi chạy lại `npm run build`, `npm run typecheck` và
`py_compile` cho analytics. Sync từng package một nếu muốn kiểm tra kỹ
từng cái trước khi sang cái sau.

Sau mỗi lần sync, cập nhật bảng trên + `upstream-versions.json` với HEAD
mới (lấy bằng `git ls-remote <remote> HEAD`).

## Giải quyết conflict — nguyên tắc

**Code custom của mình nằm ở file riêng, càng ít sửa file upstream càng tốt,
để lần sync sau ít conflict:**

- Giữ của mình: `src/profiles.ts`, `src/safety.ts`, `src/overlay/`,
  `README-FORK.md`, và trong `package.json` chỉ giữ `name`, `bin`, `main`,
  dependency `@store-mcp/shared`, việc bỏ `prepare`/`prepublishOnly`.
- Lấy của upstream: mọi file còn lại, kể cả `src/server.ts`,
  `src/index.ts`, `src/tools/*`, `spec/`, `scripts/codegen.ts`.
- Nếu upstream sửa chính `package.json` (ví dụ bump version, thêm dep):
  merge tay — giữ `name`/`bin`/`main` của mình, lấy `version` + deps mới
  của upstream, giữ lại dòng `@store-mcp/shared`.
- Nếu upstream đổi tên tool hoặc đổi API: `src/profiles.ts` có thể cần
  cập nhật rule (tiền tố/substring mới). Chạy lại build + `--help` +
  smoke test ListTools để kiểm tra số tool.

## Kiểm tra sau sync

```bash
npm run build && npm run typecheck
npm test --workspace @store-mcp/shared
python3 -m py_compile packages/play-analytics/server.py packages/play-analytics/gp_client.py
node packages/play-operate/dist/overlay/index.js --help
node packages/appstore-operate/dist/overlay/index.js --help
```

Chỉ commit khi tất cả pass. Không commit key, xem `.gitignore`.
