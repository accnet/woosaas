Để xây dựng hệ thống Analytics thực thụ (giống Google Analytics hoặc các tracker chuyên nghiệp), bạn cần phân loại các kênh (Channel) rõ ràng và thiết kế luồng thu thập (Collection Flow) sao cho không mất dữ liệu khi người dùng lướt web.

Dưới đây là danh sách các kênh cần thu thập và mô tả chi tiết luồng dữ liệu từ lúc khách bấm vào link đến lúc hệ thống ghi nhận.

---

### 1. Các kênh (Channels) cần thu thập

Bạn cần xây dựng một bộ quy tắc (Logic) trong Golang hoặc JS để phân loại nguồn truy cập. Thứ tự ưu tiên thường là: **UTM params > Click ID > Referrer Domain**.

| Kênh (Channel) | Nguồn xác định | Từ khóa / Mã định danh |
| :--- | :--- | :--- |
| **1. Paid Search (Quảng cáo tìm kiếm)** | Google Ads, Bing Ads | Có tham số `utm_medium=cpc` hoặc tồn tại `gclid` (Google) / `msclkid` (Bing). |
| **2. Paid Social (Quảng cáo MXH)** | Facebook, TikTok, LinkedIn | Có tham số `utm_medium=paid_social` hoặc tồn tại `fbclid` (Facebook), `ttclid` (TikTok). |
| **3. Organic Search (Tự nhiên)** | Google, Bing, DuckDuckGo | Referrer thuộc danh sách domain tìm kiếm (google.com, bing.com) và **không** có mã quảng cáo. |
| **4. Organic Social (MXH tự nhiên)** | Facebook, LinkedIn, Zalo | Referrer từ domain mxh và **không** có mã quảng cáo. |
| **5. Referral (Giới thiệu)** | Các trang báo, blog, đối tác | Referrer từ website khác (không phải SE, MXH) và không có UTM. |
| **6. Email** | Gmail, Outlook, Client mail | Có `utm_medium=email` hoặc referrer là webmail. |
| **7. Direct (Trực tiếp)** | Không xác định | Không có Referrer (hoặc rỗng) và không có UTM. Người dùng gõ URL hoặc dùng Bookmark. |

---

### 2. Luồng thu thập dữ liệu (Collection Flow)

Luồng này diễn ra trên trình duyệt khách hàng (Client-side) bằng JavaScript và gửi về server Golang của bạn.

#### Giai đoạn 1: Xử lý lần truy cập đầu tiên (Landing Page)

Khi người dùng truy cập vào website WordPress, Plugin JS của bạn cần chạy ngay lập tức (ngay khi DOM loaded hoặc sớm hơn).

**Logic trong JS Tracker:**

1.  **Kiểm tra URL hiện tại:**
    *   Móc hết các tham số UTM (`source`, `medium`, `campaign`, `term`, `content`).
    *   Móc các Click ID (`gclid`, `fbclid`, `msclkid`, `ttclid`).
    *   *Ví dụ URL:* `site.com/product?utm_source=google&utm_medium=cpc&gclid=xyz...`

2.  **Kiểm tra Referrer:**
    *   Lấy `document.referrer`. Nếu đến từ `google.com`, xác định là Search.

3.  **Xác định Attribution (Nguồn gốc):**
    *   Nếu có UTM/ClickID -> Đây là nguồn chính xác nhất.
    *   Nếu không có -> Phân loại dựa trên Referrer.
    *   Nếu không có gì -> Gán là `Direct`.

4.  **Lưu trữ (Persistence) - Bước QUAN TRỌNG:**
    *   Lưu object nguồn này vào **LocalStorage** hoặc **Cookie** (với thời hạn 30-90 ngày).
    *   *Tại sao?* Khách hàng có thể xem hàng hôm nay, 2 ngày sau mới mua. Nếu không lưu, khi họ quay lại mua (lúc đó URL không còn UTM), hệ thống sẽ ghi nhầm là "Direct".
    *   *Tên cookie gợi ý:* `wp_attribution_data`.

#### Giai đoạn 2: Theo dõi hành vi (Event Tracking)

Mọi hành động của user đều cần gắn kèm thông tin nguồn đã lưu ở Giai đoạn 1.

*   **Event:** `Pageview`, `Add to Cart`, `View Product`.
*   **Cách gửi:**
    *   JS đọc `wp_attribution_data` từ Cookie/LocalStorage.
    *   Gửi về Golang API dạng JSON:
        ```json
        {
          "event_type": "add_to_cart",
          "traffic_source": {
              "source": "google",
              "medium": "cpc",
              "campaign": "summer_sale",
              "gclid": "xyz123"
          },
          "page_url": "...",
          "product_id": 99
        }
        ```

#### Giai đoạn 3: Ghi nhận đơn hàng (Purchase - Server-side)

Đây là bước quyết định để tính doanh thu. Có 2 cách để thực hiện:

*   **Cách 1 (Đơn giản - JS):** Khi trang "Thank you page" (Order Received) load lên, JS đọc thông tin nguồn từ Cookie và gửi event `purchase`.
*   **Cách 2 (Chính xác - PHP Hook):**
    *   Plugin PHP hook vào `woocommerce_payment_complete`.
    *   Lúc này, PHP cần đọc thông tin nguồn.
    *   *Lưu ý:* PHP chạy trên server, nó **không đọc được LocalStorage** của trình duyệt.
    *   *Giải pháp:* Bạn cần đảm bảo JS đã gửi nguồn lên server và lưu vào session WP, hoặc JS phải set một Cookie mà PHP có thể đọc được (`$_COOKIE['wp_attribution_data']`).
    *   PHP gửi Event `purchase` kèm `order_id`, `revenue` và thông tin nguồn về Golang.

---

### 3. Ví dụ thực tế (Scenario)

**Tình huống:** Khách hàng A tìm kiếm trên Google thấy quảng cáo của shop, click vào xem nhưng chưa mua. Hôm sau khách hàng A quay lại bằng cách gõ trực tiếp tên miền và đặt hàng.

1.  **Ngày 1 (Lần 1):**
    *   User click quảng cáo -> URL có `?utm_source=google&utm_medium=cpc`.
    *   JS Tracker chạy -> Detect UTM.
    *   Lưu vào Cookie: `{ source: "google", medium: "cpc" }`.
    *   Gửi event `pageview`.

2.  **Ngày 2 (Lần 2):**
    *   User gõ tên miền -> Không có UTM, Referrer rỗng.
    *   JS Tracker chạy -> Không thấy UTM mới, nhưng thấy **Cookie cũ còn hạn**.
    *   Giữ nguyên nguồn cũ: `{ source: "google", medium: "cpc" }`. (Không ghi đè thành Direct).

3.  **Lúc mua hàng:**
    *   User bấm "Đặt hàng".
    *   PHP/JS gửi event `purchase` kèm nguồn `google / cpc`.
    *   **Kết quả:** Hệ thống ghi nhận doanh thu cho kênh Google Ads (Last Non-Direct Click Attribution).

### 4. Tổng kết kỹ thuật cho Golang & ClickHouse

*   **Golang:** Nhận JSON, đơn giản chỉ cần parse field `traffic_source` và Insert vào ClickHouse.
*   **ClickHouse:** Tạo các cột `source`, `medium`, `campaign`, `gclid`... để phục vụ query báo cáo sau này:
    *   *Query ví dụ:* Doanh thu từ Google Ads tháng này là bao nhiêu?
    *   `SELECT sum(revenue) FROM events WHERE source = 'google' AND medium = 'cpc' AND event_type = 'purchase'`.

Bạn cần lập trình logic "ưu tiên UTM > Referrer" và "không ghi đè nguồn nếu là Direct" ngay trên plugin WP (JS) để đảm bảo tính chính xác của Attribution.