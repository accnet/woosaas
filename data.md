Để xây dựng một hệ thống Analytics hiệu quả cho WordPress/WooCommerce, bạn cần thu thập đủ dữ liệu để vẽ biểu đồ nhưng phải tối giản để không làm chậm website khách hàng.

Dưới đây là chi tiết về **Dữ liệu cần thu thập** và **Cách tính CR (Conversion Rate)** trong ClickHouse.

---

### 1. Dữ liệu cần thu thập (Data Payload)

Dữ liệu được chia làm 3 nhóm chính gửi từ Plugin (JS/PHP) về API Golang:

#### A. Nhóm Định danh & Thiết bị (Identity & Device)
Đây là dữ liệu giúp bạn biết "Ai" đang làm gì.

*   **`client_id` (String):** Một ID duy nhất gắn với trình duyệt (lưu trong Cookie/LocalStorage). Nếu user quay lại sau 1 tuần, ID này không đổi -> Biết là khách cũ.
*   **`session_id` (String):** ID của phiên truy cập hiện tại. Reset sau 30 phút không hoạt động. Dùng để tính "Số phiên" (Sessions).
*   **`user_agent` (String):** Chuỗi trình duyệt (Golang sẽ dùng thư viện để parse ra Browser Name, OS, Device Type).
*   **`ip` (String):** Địa chỉ IP (Golang sẽ lấy từ request header, dùng để xác định vị trí và chặn spam).

#### B. Nhóm Ngữ cảnh & Marketing (Context & Attribution)
Dữ liệu giúp bạn biết khách đến từ đâu.

*   **`url` (String):** Đường dẫn hiện tại đang xem (ví dụ: `/san-pham/ao-thun`).
*   **`referrer` (String):** Trang trước đó khách ở đó (ví dụ: `google.com`).
*   **`utm_source`, `utm_medium`, `utm_campaign` (String):** Tham số marketing.
*   **`gclid`, `fbclid` (String):** ID quảng cáo.

#### C. Nhóm Sự kiện & Kinh tế (Event & Economy)
Dữ liệu nghiệp vụ chính.

*   **`event_type` (String):** Tên hành động.
    *   `pageview`: Xem trang.
    *   `view_item`: Xem sản phẩm (kèm ID sản phẩm).
    *   `add_to_cart`: Thêm vào giỏ.
    *   `begin_checkout`: Bắt đầu thanh toán.
    *   `purchase`: Mua hàng thành công.
*   **`value` (Decimal):** Giá trị tiền tệ (Chỉ dùng cho event `purchase` hoặc `add_to_cart`).
*   **`currency` (String):** Đơn vị tiền (VND, USD).
*   **`items` (JSON/Array):** Danh sách sản phẩm liên quan đến event (ID sản phẩm, tên, danh mục).

**Ví dụ JSON gửi lên Golang:**
```json
{
  "client_id": "u_550e8400-cafe...",
  "session_id": "s_12345",
  "event_type": "purchase",
  "url": "https://shop.com/checkout/order-received",
  "utm_source": "google",
  "utm_medium": "cpc",
  "value": 500000,
  "currency": "VND",
  "items": [
    { "id": "prod_12", "name": "Áo thun", "price": 250000, "quantity": 2 }
  ]
}
```

---

### 2. Cách tính CR (Conversion Rate) trong ClickHouse

CR là tỷ lệ chuyển đổi. Trong WooCommerce, có 2 loại CR phổ biến:

1.  **CR theo Phiên (Session CR):** Tỷ lệ phiên truy cập có đơn hàng.
2.  **CR theo Người dùng (User CR):** Tỷ lệ khách hàng ra đơn.

Công thức: **CR = (Tổng đơn hàng / Tổng lượt truy cập) * 100%**

#### A. Cấu trúc Query tính CR theo ngày

ClickHouse cực mạnh ở việc tính toán kiểu này. Bạn chỉ cần 1 câu query để lấy số lượt truy cập, số đơn hàng và CR theo ngày/tuần/tháng.

```sql
SELECT
    -- Chuyển ngày sang định dạng YYYY-MM-DD
    toDate(event_time) as date,
    
    -- 1. Đếm tổng số phiên (Sessions) - Unique session_id
    uniqExact(session_id) as total_sessions,
    
    -- 2. Đếm tổng số đơn hàng - Đếm session có event purchase
    -- Logic: Nếu trong session đó có purchase, tính là 1 đơn
    countDistinctIf(session_id, event_type = 'purchase') as total_orders,
    
    -- 3. Tính CR (%)
    round((total_orders / total_sessions) * 100, 2) as conversion_rate

FROM events
WHERE 
    site_id = 'site_abc' 
    -- Lọc theo khoảng thời gian (Ví dụ: 7 ngày gần nhất)
    AND event_time >= now() - INTERVAL 7 DAY

GROUP BY date
ORDER BY date ASC;
```

*Kết quả trả về:* Bạn sẽ có một bảng dữ liệu ngày nào bao nhiêu lượt xem, bao nhiêu đơn, CR bao nhiêu. Frontend chỉ việc nhận và vẽ biểu đồ.

#### B. Tính CR theo tuần hoặc tháng

Để thay đổi độ phân giải từ ngày sang tuần/tháng, chỉ cần thay đổi hàm nhóm (GROUP BY):

*   **Theo tuần:** Dùng `toStartOfWeek(event_time)` thay vì `toDate`.
*   **Theo tháng:** Dùng `toStartOfMonth(event_time)`.

```sql
SELECT
    toStartOfWeek(event_time) as week_start,
    uniqExact(session_id) as total_sessions,
    countDistinctIf(session_id, event_type = 'purchase') as total_orders,
    round((total_orders / total_sessions) * 100, 2) as conversion_rate
FROM events
WHERE site_id = 'site_abc'
GROUP BY week_start
ORDER BY week_start ASC;
```

#### C. CR theo nguồn (Source CR)
Để biết quảng cáo Google hay Facebook có CR cao hơn, chỉ cần thêm `utm_source` vào GROUP BY:

```sql
SELECT
    utm_source,
    uniqExact(session_id) as total_sessions,
    countDistinctIf(session_id, event_type = 'purchase') as total_orders,
    round((total_orders / total_sessions) * 100, 2) as conversion_rate
FROM events
WHERE site_id = 'site_abc'
GROUP BY utm_source
ORDER BY conversion_rate DESC;
```

### 3. Mở rộng: Phễu chuyển đổi (Funnel)

Ngoài CR tổng, bạn cần biết khách rớt ở đâu. Bạn có thể tính tỷ lệ chuyển đổi giữa các bước:

1.  **View -> Add to Cart CR:** Bao nhiêu % người xem sản phẩm cho vào giỏ.
2.  **Add to Cart -> Purchase CR:** Bao nhiêu % người có giỏ hàng thì mua.

**Query tính Phễu (ClickHouse hỗ trợ hàm windowFunnel cực mạnh):**

```sql
SELECT
    windowFunnel(1800)(event_time, event_type = 'pageview', event_type = 'add_to_cart', event_type = 'purchase') as level
FROM events
WHERE site_id = 'site_abc'
```
*(Hàm `windowFunnel` sẽ tự động đếm xem có bao nhiêu user đi qua các mốc sự kiện theo thứ tự trong một khoảng thời gian).*

### Tóm tắt quy trình

1.  **Client (WP):** Gửi `{client_id, session_id, event_type, url, utm, value}`.
2.  **Server (Go):** Nhận -> Thêm `ip`, `event_time`, parse `user_agent` -> Lưu vào ClickHouse.
3.  **Dashboard:** Gọi API -> ClickHouse chạy query `uniq(session)` và `count(purchase)` -> Tính CR -> Trả về JSON cho biểu đồ.