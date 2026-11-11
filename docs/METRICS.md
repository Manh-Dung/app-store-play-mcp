# METRICS — mapping metric Play vs App Store

> **Quy tắc số 1: không có metric nào tương đương 1-1 giữa 2 store.**
> Bảng dưới là xấp xỉ để so sánh xu hướng, không phải để cộng/trừ trực tiếp,
> và không dùng để kết luận "app này thắng app kia" chỉ bằng 1 con số.

## Bảng mapping

| Ý hỏi | Google Play | App Store | Trạng thái |
|---|---|---|---|
| Người tìm thấy app rồi cài | `installs` (bulk CSV, desunit) — installs / uninstalls / active devices | `downloads` / `units` (Sales report, App Store Connect API) | Xấp xỉ. Play đếm installs trên thiết bị, Apple đếm downloads; pre-order, redownload, Family Sharing tính khác nhau |
| Người vào trang store | Store listing visitors (bulk CSV `store_performance`) | Product page views / impressions (Analytics report: App Store Engagement) | Xấp xỉ. Định nghĩa "view" khác nhau |
| Tỉ lệ xem → cài | Visitor→install conversion (bulk CSV) | Product page view → download conversion (tính tay từ Analytics) | Xấp xỉ, phải tính cùng cửa sổ ngày |
| Tìm app bằng cách nào | Search terms + traffic source Explore / Search / Ads (bulk CSV) | Search terms không có sẵn qua API chính thức theo cùng cách; dùng Analytics Discovery + App Store Search (giới hạn) | **Không tương đương.** Play cho search terms chi tiết, Apple hạn chế hơn |
| Doanh thu | **Không có $ trong 2 server Play ở đây.** Subscription counts có, tiền không. Cần financial reports riêng (Google Cloud Storage / BigQuery export) | `proceeds` (Finance report) — tiền Apple trả sau khi trừ hoa hồng | **Không cộng được.** Proceeds ≠ doanh thu gộp, chưa trừ thuế/phí ngoài Apple, tỉ giá và kỳ thanh toán khác nhau |
| Subscription | New / cancelled / active by country (bulk CSV + Publisher API) | Subscriptions, retention (Sales/Finance/Analytics reports) | Xấp xỉ. Định nghĩa trial, grace period, renewal khác nhau |
| Rating | Average rating over time (bulk CSV); review list 7 ngày gần nhất, chỉ review có chữ (Publisher API) | Average rating không có API tổng hợp theo thời gian; customer reviews qua API | Xấp xỉ. Cửa sổ thời gian và cách lọc khác nhau |
| Crash | Crash rate / ANR rate (Reporting API v1beta1) | Diagnostics / crash logs qua App Store Connect + TestFlight feedback | Xấp xỉ. Play là rate theo user, Apple là log/signature, không so trực tiếp |
| Retention | Retained installers 1/7/15/30 ngày — **bulk export đã ngừng từ 6/2021**, chỉ còn lịch sử | Retention qua Analytics (App Usage) | Không so được bằng 2 nguồn này; cần analytics in-app (Firebase...) nếu muốn retention thật |

## Lag dữ liệu

| Nguồn | Lag điển hình |
|---|---|
| Play bulk CSV (play-analytics) | 1–2 ngày; file tháng hiện tại viết lại mỗi ngày |
| Play Reporting API (play-operate `reports_*`) | ~1 ngày, aggregate theo giờ America/Los_Angeles |
| App Store Analytics / Sales / Finance reports | Sales: 1 ngày; Finance: theo tháng, có thể chậm hơn; Analytics report instance phải chờ `COMPLETED` |
| Review Play | Chỉ review tạo/sửa trong 7 ngày gần nhất, chỉ review có chữ |

## Quy tắc khi so sánh 2 cửa sổ thời gian

- Đọc block `coverage` trong response của play-analytics
  (`data_through`, `days_present`, `missing_dates`) trước khi so sánh.
  Nếu 1 cửa sổ thiếu ngày, so **trung bình/ngày**, không so tổng.
- Cùng 1 app, cùng 1 cửa sổ ngày ở cả 2 store, và ghi rõ nguồn + ngày
  lấy số trong câu trả lời. Không so "hôm nay Play" với "tuần trước Apple".
