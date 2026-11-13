# store-mcp — Unified MCP for Google Play & Apple App Store

Monorepo Model Context Protocol (MCP) toàn diện để quản lý, phát hành và phân tích ứng dụng trên cả Google Play và Apple App Store.

**Kiến trúc:** 1 monorepo, **3 MCP server riêng biệt, 3 process độc lập** — đảm bảo cô lập rủi ro bảo mật khóa và phân quyền chuẩn xác:
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

## Cài đặt và Kiểm thử

### 1. Build Monorepo (Node.js 18+)
```bash
npm install
npm run build
npm test
```
*Lệnh `npm test` tự động chạy toàn bộ 33 test cases qua cả TypeScript workspaces và Python analytics.*

### 2. Thiết lập Play Analytics (Python 3.11+)
```bash
cd packages/play-analytics
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m unittest discover -s . -p "test_*.py"
```

---

## Cấu hình MCP Client

Xem mẫu chi tiết tại file [`.mcp.json.example`](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/.mcp.json.example).

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

- [docs/WORKERS.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/WORKERS.md) — Chi tiết danh mục Worker Profiles, quản lý context window và cấu hình mẫu.
- [docs/QUOTAS.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/QUOTAS.md) — Hạn mức gọi API (Rate limits), giới hạn ký tự và chính sách an toàn hai Store.
- [docs/SETUP.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/SETUP.md) — Hướng dẫn tạo Service Account Google Play, file khóa `.p8` Apple và bucket GCS.
- [docs/ARCHITECTURE.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/ARCHITECTURE.md) — Giải thích kiến trúc monorepo và lớp bảo vệ Overlay.
- [docs/METRICS.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/METRICS.md) — Bảng đối chiếu và chuẩn hóa định nghĩa chỉ số giữa Play Store và App Store.
- [docs/SYNC.md](file:///Users/nguyenmanhdung/Workspace/app-store-play-mcp/docs/SYNC.md) — Hướng dẫn đồng bộ mã nguồn từ các repo upstream qua `git subtree`.

---

## License

MIT — xem chi tiết trong file `LICENSE`.
