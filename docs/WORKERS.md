# WORKERS & TOOL BUDGETING GUIDE

Quản lý context window, phân nhóm công cụ (Worker Profiles) và giới hạn ngân sách tool cho AI Agent trên Google Play và Apple App Store.

---

## 1. Vấn đề Context Window & Token Bloat

- **App Store Connect API** bao gồm hơn **1.316 API endpoints**. Nếu đăng ký toàn bộ vào MCP client, payload định nghĩa tools sẽ tiêu tốn khoảng **~62.700 tokens** ngay tại câu chào đầu tiên.
- **Google Play Publisher API** có hơn **150 endpoints**, tiêu tốn khoảng **~12.000 tokens**.
- Nhiều client AI (Cursor, Windsurf, Claude Desktop, Cascade) giới hạn tối đa từ 50 đến 100 tools hoặc bị suy giảm khả năng chọn tool chính xác khi danh sách quá dài.

Hệ thống giải quyết triệt để vấn đề này bằng 3 tầng phòng vệ:
1. **Worker Profiles (`--workers`)**: Chỉ nạp các công cụ liên quan đến tác vụ đang làm.
2. **Ngân sách Tool (`--max-tools N` / `STORE_MCP_MAX_TOOLS`)**: Áp trần cứng số lượng tool đăng ký, tự động ưu tiên giữ lại các composite tools cấp cao và công cụ cốt lõi.
3. **Tìm kiếm động (`store_search_tools`)**: Cho phép AI tự tìm và tra cứu bất kỳ tool tầng thấp nào theo từ khóa khi cần mà không phải nạp sẵn vào context.

---

## 2. Danh mục Worker Profiles

### A. Google Play (`packages/play-operate`)

Khởi chạy bằng cờ `--workers <list>` (ví dụ: `--workers release,reviews`):

| Profile | Số lượng tools | Nhóm tính năng chính |
|---|---|---|
| `release` | ~25 tools | `deploy_app` (1-shot), `create_release`, `promote_release`, `update_rollout`, `halt_rollout`, `tracks_*`, `bundles_*`, `apks_*`, `testers_*` |
| `listings` | ~15 tools | `aso_audit_app`, `metadata_dry_run_preview`, `listings_*`, `images_*`, `details_*` |
| `reviews` | ~4 tools | `reviews_list`, `reviews_get`, `reviews_reply` |
| `monetization` | ~35 tools | In-app products, Subscriptions, Base plans, Offers, Purchases v2, Orders, Refunds |
| `vitals` | ~10 tools | Vitals error reporting, crash rate, ANR rate, anomalies |
| `apps` | ~10 tools | Quản lý tài khoản (`accounts_*`), danh sách app |
| `full` | 150+ tools | Toàn bộ danh mục API |

### B. Apple App Store (`packages/appstore-operate`)

Khởi chạy bằng cờ `--workers <list>` (ví dụ: `--workers testflight,marketing`):

| Profile | Số lượng tools | Nhóm tính năng chính |
|---|---|---|
| `testflight` | ~60 tools | `testflight_feedback_summary`, `testflight_crash_reports`, `beta_testers_*`, `beta_groups_*`, `builds_*` |
| `marketing` | ~25 tools | `aso_audit_portfolio`, `metadata_dry_run_preview`, `app_store_version_experiments_*`, `app_screenshots_*`, `app_previews_*` |
| `builds` | ~30 tools | `builds_*`, `build_bundles_*`, `ci_*` (Xcode Cloud), `scm_*` |
| `monetization` | ~80 tools | `in_app_purchases_*`, `subscriptions_*`, `app_prices_*`, `offer_codes_*` |
| `analytics` | ~20 tools | `analytics_reports_*`, `sales_reports_*`, `finance_reports_*` |
| `apps` | ~50 tools | `apps_*`, `app_infos_*`, `app_store_versions_*`, `review_submissions_*` |
| `full` | 1300+ tools | Toàn bộ danh mục OpenAPI của Apple |

---

## 3. Ngân sách Tool (`--max-tools`) & Công cụ tìm kiếm động

Khi thiết lập `--max-tools N` (ví dụ: `--max-tools 30`), hệ thống áp dụng cơ chế lọc phân tầng:
1. **Bắt buộc giữ lại (`alwaysKeep`)**: `accounts_*`, `auth_status`, `store_search_tools`.
2. **Ưu tiên giữ lại (`priorityTools`)**: Các composite tools cấp cao (`deploy_app`, `promote_release`, `testflight_feedback_summary`, `aso_audit_portfolio`...).
3. **Cắt tỉa phần dư**: Các low-level API endpoints ít dùng sẽ bị ẩn khỏi `tools/list`.

### Meta-tool `store_search_tools`:
Khi agent cần thực hiện một thao tác API hiếm (như tra cứu mã lỗi IAP hoặc cấu hình device tier), agent chỉ cần gọi:
```json
{
  "name": "store_search_tools",
  "arguments": {
    "query": "device_tier"
  }
}
```
Tool trả về đầy đủ schema và mô tả của tool đó để agent gọi trực tiếp qua tên tool.

---

## 4. Mẫu cấu hình MCP Client

### Cho Release Engineer (Tập trung phát hành & TestFlight)
```json
{
  "mcpServers": {
    "play-operate": {
      "command": "node",
      "args": [
        "/Users/nguyenmanhdung/Workspace/app-store-play-mcp/packages/play-operate/dist/overlay/index.js",
        "--workers", "release",
        "--max-tools", "30"
      ]
    },
    "appstore-operate": {
      "command": "node",
      "args": [
        "/Users/nguyenmanhdung/Workspace/app-store-play-mcp/packages/appstore-operate/dist/overlay/index.js",
        "--workers", "builds,testflight",
        "--max-tools", "40"
      ]
    }
  }
}
```

### Cho ASO & Marketing Analyst (Tập trung Audit, Listing & Feedback)
```json
{
  "mcpServers": {
    "play-operate": {
      "command": "node",
      "args": [
        "/Users/nguyenmanhdung/Workspace/app-store-play-mcp/packages/play-operate/dist/overlay/index.js",
        "--workers", "listings,reviews",
        "--read-only"
      ]
    },
    "appstore-operate": {
      "command": "node",
      "args": [
        "/Users/nguyenmanhdung/Workspace/app-store-play-mcp/packages/appstore-operate/dist/overlay/index.js",
        "--workers", "marketing,testflight",
        "--read-only"
      ]
    },
    "play-analytics": {
      "command": "/Users/nguyenmanhdung/Workspace/app-store-play-mcp/packages/play-analytics/.venv/bin/python",
      "args": [
        "/Users/nguyenmanhdung/Workspace/app-store-play-mcp/packages/play-analytics/server.py"
      ]
    }
  }
}
```

