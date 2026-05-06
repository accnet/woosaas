Đây là bài toán "bất khả kháng" của mọi hệ thống Analytics. Không có giải pháp nào lọc 100% bot, nhưng bạn có thể kết hợp nhiều lớp (layers) để đạt độ chính xác 95-99%.

Dưới đây là các kỹ thuật từ cơ bản đến nâng cao để lọc bot, áp dụng cho kiến trúc **WordPress Plugin -> Golang -> ClickHouse**:

---

### 1. Lớp 1: Dựa vào "Client Hints" (Thu thập tại JS)

Bots đơn giản thường không chạy JavaScript hoặc chạy JS nhưng không giả lập được môi trường trình duyệt hoàn hảo. Bạn có thể check ngay tại file JS Tracker:

*   **Kiểm tra `navigator.webdriver`:**
    *   Trình duyệt thật (người dùng bấm chuột): Giá trị này thường là `false` hoặc `undefined`.
    *   Bot (Selenium, Puppeteer, Chrome Headless): Giá trị này là `true`.
    *   *Action:* Nếu `navigator.webdriver === true` -> Đánh dấu là Bot, không gửi event.

*   **Kiểm tra tính khả thi của màn hình:**
    *   Bot thường không set kích thước màn hình hoặc set giá trị lạ.
    *   Check: `screen.width`, `screen.height`, `window.devicePixelRatio`.
    *   *Ví dụ:* Nếu `screen.width = 0` hoặc `colorDepth = 0` -> Bot.

*   **Kiểm tra các tính năng tự động:**
    *   Check `window.callPhantom` (PhantomJS) hoặc `window._phantom`.
    *   Check `document.__selenium_unwrapped`.

### 2. Lớp 2: Dựa vào hành vi (Behavioral Analysis - Xử lý tại Golang/ClickHouse)

Người dùng có hành vi "con người", bot có hành vi "máy móc".

*   **Thời gian trên trang (Session Duration):**
    *   Bot: Thường mở trang và thoát ngay (< 1 giây) hoặc mở treo mãi không thoát.
    *   Người dùng: Ở lại đọc bài, xem sản phẩm (thường > 5-10 giây).
    *   *Logic:* Nếu `pageview` có thời gian < 1s -> Đánh dấu nghi vấn Bot.

*   **Tốc độ thao tác (Speed):**
    *   Người dùng không thể click vào 5 nút khác nhau trong vòng 1 giây.
    *   Bot có thể gửi hàng chục request/giây.
    *   *Golang Logic:* Dùng Redis để đếm request. Nếu 1 IP gửi > 10 requests/giây -> Block hoặc gán cờ Bot.

*   **Mouse Movement & Scroll:**
    *   Người dùng luôn di chuột hoặc cuộn trang.
    *   Bot thường click thẳng vào nút mà không có tọa độ di chuyển chuột trước đó.
    *   *JS Logic:* Gửi kèm thông tin `mouse_moves: true/false`. Nếu click mà `mouse_moves = false` -> Nghi Bot.

### 3. Lớp 3: Dựa vào chữ ký số (Server-side - Golang)

Đây là lớp chắn mạnh nhất tại Backend (Golang) trước khi ghi vào ClickHouse.

*   **Phân tích User-Agent (UA):**
    *   Sử dụng thư viện Go như `ua-parser` hoặc `moulehouse/go-ossec`.
    *   Lọc các từ khóa: `bot`, `crawl`, `spider`, `curl`, `wget`, `python-requests`, `googlebot`, `bingbot`.
    *   *Lưu ý:* Googlebot thật cần verify ngược DNS (reverse DNS lookup) để tránh giả mạo, nhưng với analytics thông thường, việc chặn UA chứa "bot" là đủ.

*   **Kiểm tra IP Address:**
    *   Sử dụng danh sách đen (Blacklist) các IP của Data Center (AWS, DigitalOcean, Azure...). Người dùng thật thường lướt web bằng IP nhà mạng (Residential ISP) hoặc Mobile.
    *   Sử dụng thư viện Go để check ASN (Autonomous System Number) của IP. Nếu ASN thuộc về Amazon AWS hay Google Cloud -> Khả năng cao là server bot, không phải người dùng thật.

### 4. Lớp 4: Honeypot (Bẫy)

Kỹ thuật này rất hiệu quả để phát hiện bot cạo nội dung (scrapers) mà không ảnh hưởng người dùng.

*   **Cách làm:**
    *   Trong HTML trang WordPress, chèn một đường link ẩn (CSS `display: none` hoặc `opacity: 0`).
    *   Link này dẫn đến một endpoint đặc biệt trên server Golang (ví dụ: `/trap/honey`).
    *   Người dùng thật **không thể nhìn thấy và không click** vào link này.
    *   Bot thường đọc mã nguồn HTML và tự động bấm vào mọi link nó tìm thấy.
    *   *Kết quả:* Nếu có request nào đến `/trap/honey` -> Chắc chắn là Bot. Lưu IP đó vào blacklist.

### 5. Gợi ý quy trình xử lý trong hệ thống của bạn

Bạn không nên "xóa" dữ liệu bot ngay lập tức, mà nên **đánh dấu (flag)** để dễ phân tích sau này.

**Cấu trúc bảng ClickHouse mở rộng:**

```sql
ALTER TABLE events ADD COLUMN is_bot UInt8 DEFAULT 0; -- 0: Người, 1: Bot
ALTER TABLE events ADD COLUMN bot_reason String; -- Lý do: 'ua_blacklist', 'headless', 'honeypot'
```

**Quy trình xử lý tại Golang:**

1.  **Nhận Request:**
    *   Check IP trong Redis Cache (đã bị band trước đó chưa?).
    *   Check User-Agent (chứa từ khóa bot?).
    *   Nếu phát hiện -> Set `is_bot = 1`.

2.  **Nhận Payload từ JS:**
    *   Nếu `navigator.webdriver == true` -> Set `is_bot = 1`.
    *   Nếu thiếu thông tin màn hình -> Set `is_bot = 1`.

3.  **Hệ thống Báo cáo (Dashboard):**
    *   Mặc định query: `WHERE is_bot = 0` (Chỉ hiện người dùng thật).
    *   Có trang riêng: "Bot Report" để admin xem loại bot nào đang tấn công.

**Tóm lại:**
Để bắt đầu, bạn hãy triển khai 2 kỹ thuật đơn giản nhất nhưng hiệu quả nhất:
1.  **Client-side:** Check `navigator.webdriver` trong JS.
2.  **Server-side:** Lọc User-Agent chứa từ khóa "bot", "crawl", "spider" bằng Golang.

Hai cái này đã lọc được khoảng 80-90% bot rác rồi.