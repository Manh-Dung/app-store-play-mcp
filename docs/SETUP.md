# SETUP — tạo credential cho 3 server

> **Không commit key thật.** `.p8`, service-account JSON, `accounts.json`,
> `.env`, `keys/`, `credentials/` đều đã chặn trong `.gitignore`.
> Key chỉ nằm ngoài repo, ví dụ `~/.config/store-mcp/`, chmod 600.
> Nếu lỡ lộ key: revoke ngay trong console tương ứng, tạo key mới.

## 1. Play operate — service account Google

1. Google Cloud Console → chọn/tạo project → **APIs & Services → Library**,
   bật **Google Play Android Developer API** (và **Play Developer Reporting API**
   nếu dùng vitals/reports).
2. **IAM & Admin → Service Accounts → Create** → Keys → **Add key → JSON**.
   Lưu file ngoài repo, ví dụ `~/.config/store-mcp/play-service-account.json`.
3. Play Console → **Users and permissions → Invite new user**, paste email
   service account (`name@project.iam.gserviceaccount.com`).
4. Quyền tối thiểu theo việc dùng (đừng cấp Admin nếu không cần):
   - Chỉ đọc/review/release: **View app information** + **Reply to reviews**
     + **Release to testing tracks** / **Production releases**
   - Sửa listing: thêm **Edit store listing, pricing & distribution**
   - Monetization: thêm **Manage orders and subscriptions**
   - Quyền có thể mất tới 24h mới propagate — lỗi 403 lúc đầu thường là do đó.
5. Đăng ký account vào server bằng tool `accounts_add` (keyFile trỏ tới file
   ở bước 2), rồi `auth_status` để verify. Server chỉ lưu **đường dẫn** key,
   không lưu nội dung key.

## 2. Play analytics — bucket GCS + quyền đọc bucket

Server này **không dùng Publisher API**, nó đọc CSV bulk export trong bucket
`pubsite_prod_rev_<number>`.

1. Play Console → **Download reports** → mở 1 category → **Copy Cloud Storage URI**
   → bucket là phần giữa `gs://` và dấu `/` đầu tiên.
2. Cấp quyền cho cùng service account (hoặc 1 service account riêng chỉ đọc):
   - Cách khuyên dùng: Play Console → **Users and permissions** → invite service
     account → grant **View app information and download bulk reports**; hoặc
   - Bucket IAM: grant `roles/storage.objectViewer` trên bucket `pubsite_prod_rev_*`.
3. Env khi chạy server:
   `GOOGLE_PLAY_SA_JSON=/path/to/service-account.json`
   `GOOGLE_PLAY_REPORTS_BUCKET=pubsite_prod_rev_XXXXXXXXXXXXXXXX`
   Tuỳ chọn: `GOOGLE_PLAY_APP_ALIASES='{"donedone":"com.habit.routine.donedone"}'`
4. Verify bằng tool `health_check` (không cần app thật, chỉ cần bucket).
5. Lưu ý: dữ liệu lag 1–2 ngày; file tháng hiện tại được Google viết lại mỗi
   ngày. Xem `docs/METRICS.md`.

## 3. App Store operate — API key `.p8`

1. App Store Connect → **Users and Access → Integrations → App Store Connect API**
   (Team Keys) → **Generate**.
2. Role tối thiểu:
   - Đọc + TestFlight + metadata: **App Manager**
   - Chỉ đọc analytics/sales: **Finance** cần thêm cho sales/finance reports
     (kèm `ASC_VENDOR_NUMBER`).
   - Đừng dùng **Admin** cho MCP chạy hàng ngày.
3. Download `AuthKey_XXXXXXXXXX.p8` — chỉ tải được **1 lần**. Lưu ngoài repo,
   ví dụ `~/.keys/AuthKey_XXXXXXXXXX.p8`, chmod 600. Ghi lại **Key ID** và
   **Issuer ID** (hiện ở đầu trang keys).
4. Đăng ký bằng tool `accounts_add` (keyId, issuerId, keyFile) rồi
   `auth_status` để verify. Server chỉ lưu đường dẫn, `.p8` chỉ được đọc lúc
   ký JWT (20 phút) rồi xoá khỏi bộ nhớ.
5. Nếu lộ `.p8`: revoke key ngay trong App Store Connect, tạo key mới.
   JWT cũ ký bằng key cũ sẽ hết hiệu lực ngay.

## 4. Chạy thử lần đầu (không ghi gì)

1. Build xong, chạy từng server với `--help` trước.
2. Cấu hình MCP client ở chế độ read-only trước:
   `play-operate --workers apps --read-only`
   `appstore-operate --workers apps --read-only`
   rồi gọi `apps_list` / `list_apps`.
3. Chỉ khi đã thấy đúng app, mới mở thêm profile (`release`, `reviews`…)
   và tắt read-only. Tool ghi vẫn bị chặn destructive gate cho tới khi
   `STORE_MCP_ALLOW_DESTRUCTIVE=1` hoặc `confirm: true`.
