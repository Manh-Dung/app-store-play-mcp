# Hướng dẫn Cài đặt & Sử dụng (Setup Guide)

Tài liệu này hướng dẫn cách sử dụng **@pippi_mf/app-store-play-mcp** — Unified MCP Server cho Google Play & Apple App Store.

---

## Cách 1: Sử dụng ngay qua `npx` (Khuyên dùng — Không cần clone repo)

Người dùng **hoàn toàn không cần tải code hay clone repo về máy**. Chỉ cần cấu hình trực tiếp vào MCP client (Cursor, Claude Desktop, Antigravity, Windsurf):

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
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/play-service-account.json",
        "ASC_KEY_ID": "XXXXXXXXXX",
        "ASC_ISSUER_ID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "ASC_PRIVATE_KEY_PATH": "/path/to/AuthKey_XXXXXXXXXX.p8",
        "GOOGLE_PLAY_REPORTS_BUCKET": "pubsite_prod_rev_XXXXXXXXXXXXXXXX",
        "GOOGLE_PLAY_SA_JSON": "/path/to/play-service-account.json"
      }
    }
  }
}
```

Client sẽ tự động tải package từ npm registry và khởi chạy ngầm mà không cần cài đặt thêm gì.

---

## Cách 2: Cài đặt từ mã nguồn (Dành cho Developer muốn phát triển thêm)

### Bước 1: Clone và Biên dịch Dự án

```bash
# 1. Clone repository
git clone <repo_url>
cd app-store-play-mcp

# 2. Cài đặt các gói phụ thuộc cho toàn bộ monorepo và gateway
npm install

# 3. Biên dịch toàn bộ workspaces (@store-mcp/shared, play-operate, appstore-operate) và root gateway
npm run build

# 4. Chạy kiểm thử tự động (40 test cases)
npm test
```

---

### Bước 2: Thiết lập Môi trường Play Analytics (Python venv)

Nếu bạn muốn sử dụng các công cụ phân tích lượt tải, chuyển đổi và từ khóa tìm kiếm của Google Play:

```bash
# Tạo môi trường ảo Python trong thư mục play-analytics
python3 -m venv packages/play-analytics/.venv

# Cài đặt các thư viện cần thiết (mcp, google-auth, requests)
packages/play-analytics/.venv/bin/pip install -r packages/play-analytics/requirements.txt
```

> **Lưu ý**: Nếu chưa cấu hình bước này, Gateway vẫn tự động khởi chạy an toàn với hơn 1600 công cụ từ Google Play Operate và App Store Operate mà không bị crash.

---

### Bước 3: Chuẩn bị Credentials và Tạo file `.mcp.json`

#### 1. Chuẩn bị file khóa
- **Google Play**: Tải file Service Account JSON từ Google Cloud Console (ví dụ lưu tại `credentials/play-service-account.json`). Đảm bảo Service Account đã được thêm vào **Google Play Console > Users and permissions**.
- **Apple App Store Connect**: Vào **App Store Connect > Users and Access > Integrations > App Store Connect API**:
  - Tải file khóa riêng: `AuthKey_<KEY_ID>.p8` (ví dụ lưu tại `credentials/AuthKey_74AWGSRPXQ.p8`).
  - Lấy `Key ID` (10 ký tự, ví dụ: `74AWGSRPXQ`).
  - Lấy `Issuer ID` (UUID, ví dụ: `69620501-6972-4722-86d1-a9c43bd6826e`).

> Thư mục `credentials/` đã được cấu hình trong `.gitignore`, bạn có thể an tâm lưu trữ khóa tại đây.

#### 2. Khởi tạo cấu hình MCP Client
Sao chép file mẫu:
```bash
cp .mcp.json.example .mcp.json
```

Chỉnh sửa file `.mcp.json` với đường dẫn tuyệt đối trên máy của bạn:
```json
{
  "mcpServers": {
    "store-mcp": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/app-store-play-mcp/bin/store-mcp.js",
        "--stores", "play,appstore,analytics",
        "--workers", "release,testflight,listings,marketing",
        "--max-tools", "60"
      ],
      "env": {
        "STORE_MCP_ALLOW_DESTRUCTIVE": "0",
        "STORE_MCP_READ_ONLY": "0",
        "GOOGLE_APPLICATION_CREDENTIALS": "/ABSOLUTE/PATH/TO/credentials/play-service-account.json",
        "ASC_KEY_ID": "74AWGSRPXQ",
        "ASC_ISSUER_ID": "69620501-6972-4722-86d1-a9c43bd6826e",
        "ASC_PRIVATE_KEY_PATH": "/ABSOLUTE/PATH/TO/credentials/AuthKey_74AWGSRPXQ.p8",
        "GOOGLE_PLAY_REPORTS_BUCKET": "pubsite_prod_rev_XXXXXXXXXXXXXXXX",
        "GOOGLE_PLAY_SA_JSON": "/ABSOLUTE/PATH/TO/credentials/play-service-account.json"
      }
    }
  }
}
```

---

### Bước 4: Kiểm tra Kết nối

Chạy lệnh Node sau trong terminal để kiểm tra tính hợp lệ của khóa kết nối:

```bash
node -e "
import('./dist/gateway.js').then(async ({ createGatewayServer }) => {
  const { server, close } = await createGatewayServer();
  const handler = server._requestHandlers.get('tools/call');
  const res = await handler({
    method: 'tools/call',
    params: { name: 'auth_status', arguments: { store: 'all' } }
  });
  console.log(res.content[0].text);
  await close();
});
"
```

Khi output hiển thị:
- Google Play: `"ok": true`, `"tokenAcquired": true`
- Apple App Store: `"keyFileExists": true`, `"tokenAcquired": true`

Bạn đã hoàn tất cài đặt và hệ thống sẵn sàng hoạt động!

---

## Sử dụng với các MCP Client

- **Cursor**: Copy khối `mcpServers` trong `.mcp.json` vào `~/.cursor/mcp.json` hoặc mở Cursor Settings > MCP.
- **Claude Desktop**: Mở `Settings > Developer > Edit Config` và dán cấu hình từ `.mcp.json`.
- **Antigravity / VS Code / Windsurf**: Đặt `.mcp.json` tại root của workspace.

---

## Tùy chọn Tham số Gateway (CLI Flags)

| Tham số | Ý nghĩa | Mặc định |
|---|---|---|
| `--stores <list>` | Chọn các store kích hoạt: `play`, `appstore`, `analytics`, hoặc `all` | `all` |
| `--workers <list>` | Thu gọn danh mục tool theo ngữ cảnh: `release`, `testflight`, `listings`, `marketing`, `analytics`, hoặc `full` | `full` |
| `--max-tools <N>` | Áp trần số lượng tools nạp vào context LLM để tránh đầy context window | Không giới hạn |
| `--read-only` | Chặn toàn bộ tool ghi/sửa đổi, chỉ giữ tool đọc dữ liệu | Tắt |
