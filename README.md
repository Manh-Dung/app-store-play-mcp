# store-mcp — Unified MCP for Google Play & Apple App Store

Monorepo Model Context Protocol (MCP) toàn diện để quản lý, phát hành và phân tích ứng dụng trên cả Google Play và Apple App Store.

**Kiến trúc linh hoạt:**
- **Unified Gateway MCP (`bin/store-mcp.js`)**: 1 MCP Server duy nhất tại root gộp toàn bộ 3 phân hệ, tự động khử trùng lặp công cụ (`play_*` vs `appstore_*`), tích hợp unified meta-tools (`accounts_list`, `auth_status`, `store_search_tools`), hỗ trợ lọc qua `--stores`, `--workers`, `--read-only`, `--max-tools`.
- **3 Package độc lập (`packages/*`)**: Vẫn được giữ nguyên vẹn để có thể chạy riêng lẻ từng process độc lập khi cần cô lập tuyệt đối:
  - **`play-operate`** (TypeScript): Quản lý phát hành, cấu hình track, danh sách cửa hàng, monetization và vitals cho Google Play.
  - **`appstore-operate`** (TypeScript): Quản lý TestFlight, build Xcode Cloud, nộp duyệt, ASO và quản lý danh mục App Store Connect.
  - **`play-analytics`** (Python, chỉ đọc): Phân tích lượt tải, từ khóa tìm kiếm, tỷ lệ chuyển đổi và lý do hủy gói từ Cloud Storage bulk reports.
  - **`@store-mcp/shared`** (TypeScript): Lớp an toàn dùng chung (Two-Phase Confirmation, Tool Budget Limiter, Quy tắc ASO, Redaction, Error Translation).

---

## Tính năng nổi bật đã tích hợp

| Phân hệ | Tính năng nổi bật | Tham chiếu kế thừa |
|---|---|---|
| **Play Operate** | - **Tool 1-shot `deploy_app`**: Upload AAB/APK, gán track, release notes, rollout % và commit trong 1 lần gọi.<br>- **Release Lifecycle**: `create_release`, `promote_release`, `update_rollout`, `halt_rollout` kèm chế độ dry-run `validateOnly`.<br>- **Atomic Rollback**: Tự động gọi `edits.delete` dọn sạch phiên edit khi gặp lỗi, không làm rác Play Console.<br>- **Google Discovery Codegen**: Script `npm run codegen` đọc Discovery doc v3 tự sinh 147 API tools tầng thấp. | OrellBuehler + antoniolg |
| **App Store Operate** | - **TestFlight Beta Feedback**: Tool `testflight_feedback_summary` tự động gom và phân loại feedback tester (Blocker, Bug, Usability).<br>- **Crash Diagnostics**: Tool `testflight_crash_reports` phân tích phân bổ thiết bị, phiên bản OS và thời gian uptime.<br>- **OpenAPI Codegen**: Tự động sinh hơn 1300 tools từ Apple OpenAPI spec v4.6. | OrellBuehler + testflight-mcp |
| **ASO & Dry-Run** | - **Cross-Platform ASO Audit**: Tool `aso_audit_portfolio` (App Store) và `aso_audit_app` (Play) quét tự động thiếu subtitle, thiếu keyword, thiếu screenshot theo kích cỡ.<br>- **Metadata Preview Diff**: Tool `metadata_dry_run_preview` kiểm tra trần ký tự (Title 30, Subtitle 30, Keywords 100, Short Desc 80) và hiển thị diff cũ vs mới. | fil-technology |
| **Play Analytics** | - **Data Coverage Block**: Mọi truy vấn kèm thông số `data_through`, `lag_days`, `missing_dates` để AI không so sánh sai dải ngày.<br>- **Cache Revalidation**: Tự kiểm tra ETag và timestamp `updated` từ GCS để luôn phục vụ file báo cáo mới nhất. | desunit |
| **Safety & Budgeting** | - **Worker Profiles (`--workers`)**: Thu gọn danh mục tool theo ngữ cảnh công việc.<br>- **Tool Budget Limiter (`--max-tools N`)**: Áp trần tool tránh tràn context window của LLM.<br>- **Two-Phase Confirmation Token**: Khóa `CONF-XXXXXXXX` (TTL 10 phút, single-use, băm payload) cho các thao tác xóa/dừng khẩn cấp.<br>- **Meta-tool `store_search_tools`**: Cho phép AI tự tìm kiếm tool bị cắt tỉa theo từ khóa. | asc-mcp |

---

## Cài đặt và Khởi chạy Nhanh

Xem hướng dẫn chi tiết từng bước tại [docs/QUICKSTART.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/QUICKSTART.md).

### 1. Build Monorepo & Gateway (Node.js 18+)
```bash
npm install
npm run build
npm test
```
*Lệnh `npm test` tự động chạy toàn bộ 40 test cases qua cả TypeScript workspaces, root gateway và Python analytics.*

### 2. Thiết lập Play Analytics (Python 3.11+, tùy chọn)
```bash
python3 -m venv packages/play-analytics/.venv
packages/play-analytics/.venv/bin/pip install -r packages/play-analytics/requirements.txt
```

### 3. Cấu hình Credentials (.mcp.json)
```bash
cp .mcp.json.example .mcp.json
# Cập nhật đường dẫn tuyệt đối và các biến môi trường Apple, Google Play vào file .mcp.json
```

### 4. Kiểm tra Kết nối
```bash
node -e "
import('./dist/gateway.js').then(async ({ createGatewayServer }) => {
  const { server, close } = await createGatewayServer();
  const handler = server._requestHandlers.get('tools/call');
  const res = await handler({ method: 'tools/call', params: { name: 'auth_status', arguments: { store: 'all' } } });
  console.log(res.content[0].text);
  await close();
});
"
```

---

## Cấu hình MCP Client

Xem mẫu chi tiết tại file [`.mcp.json.example`](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/.mcp.json.example).

### Lựa chọn 1: Unified Gateway (Khuyên dùng — 1 MCP server duy nhất)

```json
{
  "mcpServers": {
    "store-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@pippi_mf/app-store-play-mcp",
        "--stores", "play,appstore,analytics",
        "--workers", "release,testflight,listings,marketing",
        "--max-tools", "60"
      ],
      "env": {
        "STORE_MCP_ALLOW_DESTRUCTIVE": "0",
        "STORE_MCP_READ_ONLY": "0",
        "GOOGLE_APPLICATION_CREDENTIALS": "/ABSOLUTE/PATH/TO/play-service-account.json",
        "ASC_KEY_ID": "XXXXXXXXXX",
        "ASC_ISSUER_ID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "ASC_PRIVATE_KEY_PATH": "/ABSOLUTE/PATH/TO/AuthKey_XXXXXXXXXX.p8",
        "GOOGLE_PLAY_REPORTS_BUCKET": "pubsite_prod_rev_XXXXXXXXXXXXXXXX",
        "GOOGLE_PLAY_SA_JSON": "/ABSOLUTE/PATH/TO/play-service-account.json"
      }
    }
  }
}
```

### Lựa chọn 2: Chạy 3 server riêng biệt độc lập

```json
{
  "mcpServers": {
    "play-operate": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/app-store-play-mcp/packages/play-operate/dist/overlay/index.js",
        "--workers", "release,reviews,listings",
        "--max-tools", "50"
      ],
      "env": {
        "STORE_MCP_ALLOW_DESTRUCTIVE": "0",
        "STORE_MCP_READ_ONLY": "0"
      }
    },
    "appstore-operate": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/app-store-play-mcp/packages/appstore-operate/dist/overlay/index.js",
        "--workers", "apps,builds,testflight,marketing",
        "--max-tools", "50"
      ],
      "env": {
        "STORE_MCP_ALLOW_DESTRUCTIVE": "0",
        "STORE_MCP_READ_ONLY": "0"
      }
    },
    "play-analytics": {
      "command": "/ABSOLUTE/PATH/TO/app-store-play-mcp/packages/play-analytics/.venv/bin/python",
      "args": [
        "/ABSOLUTE/PATH/TO/app-store-play-mcp/packages/play-analytics/server.py"
      ],
      "env": {
        "GOOGLE_PLAY_REPORTS_BUCKET": "pubsite_prod_rev_XXXXXXXXXXXXXXXX",
        "GOOGLE_PLAY_SA_JSON": "/ABSOLUTE/PATH/TO/service-account.json"
      }
    }
  }
}
```

---

## Tài liệu chi tiết

- [docs/QUICKSTART.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/QUICKSTART.md) — Hướng dẫn cài đặt nhanh 4 bước cho người mới từ clone repo đến kiểm tra live API.
- [docs/WORKERS.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/WORKERS.md) — Chi tiết danh mục Worker Profiles, quản lý context window và cấu hình mẫu.
- [docs/QUOTAS.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/QUOTAS.md) — Hạn mức gọi API (Rate limits), giới hạn ký tự và chính sách an toàn hai Store.
- [docs/SETUP.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/SETUP.md) — Hướng dẫn tạo Service Account Google Play, file khóa `.p8` Apple và bucket GCS.
- [docs/ARCHITECTURE.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/ARCHITECTURE.md) — Giải thích kiến trúc monorepo và lớp bảo vệ Overlay.
- [docs/METRICS.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/METRICS.md) — Bảng đối chiếu và chuẩn hóa định nghĩa chỉ số giữa Play Store và App Store.
- [docs/SYNC.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/SYNC.md) — Hướng dẫn đồng bộ mã nguồn từ các repo upstream qua `git subtree`.

---

## License

MIT — xem chi tiết trong file `LICENSE`.
