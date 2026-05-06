Đây là 3 bài toán cốt lõi về Performance và Cost khi xây dựng hệ thống Analytics. Dưới đây là giải pháp kỹ thuật chi tiết cho từng phần:

---

### 1. Thiết kế Schema ClickHouse tối ưu

ClickHouse khác MySQL ở chỗ nó là **Column-oriented**. Cách bạn sắp xếp dữ liệu (Order by) quyết định tốc độ query và dung lượng ổ cứng.

**A. Cấu trúc bảng (CREATE TABLE)**

```sql
CREATE TABLE analytics_events
(
    -- 1. Trường thời gian (Bắt buộc)
    event_time DateTime64(3), -- Lưu milisecond để chính xác
    created_at DateTime DEFAULT now(), -- Thời gian ghi vào DB

    -- 2. Thông tin định danh (ID)
    site_id LowCardinality(String), -- Dùng LowCardinality để nén dữ liệu tốt hơn
    event_id String,
    session_id String,
    client_id String,
    user_id String, -- ID user WP nếu đã đăng nhập

    -- 3. Tên sự kiện
    event_name LowCardinality(String), -- 'pageview', 'purchase', etc.

    -- 4. Dữ liệu Campaign (Marketing)
    utm_source LowCardinality(String),
    utm_medium LowCardinality(String),
    utm_campaign String,
    gclid String,
    fbclid String,

    -- 5. Thông tin trang
    url String,
    path String, -- Chỉ lưu đường dẫn path để query nhanh hơn url đầy đủ
    referrer String,
    
    -- 6. Device & Geo (Golang parse từ UA/IP rồi gửi sang)
    device_type LowCardinality(String), -- 'mobile', 'desktop', 'tablet'
    browser LowCardinality(String),
    os LowCardinality(String),
    country LowCardinality(String),
    city String,
    ip String,

    -- 7. E-commerce (Quan trọng)
    revenue Decimal(12, 2), -- Doanh thu
    currency LowCardinality(String),
    items String, -- JSON string chứa danh sách sản phẩm

    -- 8. Bot Flag
    is_bot UInt8 DEFAULT 0,

    -- 9. Index phụ (Tăng tốc độ tìm kiếm)
    INDEX idx_session session_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_bot is_bot TYPE minmax GRANULARITY 4
)
ENGINE = MergeTree()
-- Cực quan trọng: Partition theo tháng giúp xóa dữ liệu cực nhanh
PARTITION BY toYYYYMM(event_time) 
-- Sắp xếp dữ liệu: Query thường xuyên lọc theo site -> thời gian -> loại event
ORDER BY (site_id, event_time, event_name)
-- TTL: Tự động xóa dữ liệu sau 12 tháng (ví dụ)
TTL event_time + INTERVAL 12 MONTH DELETE 
SETTINGS index_granularity = 8192;
```

**Tại sao thiết kế này tối ưu?**
*   **`ORDER BY (site_id, event_time)`:** Khi bạn query "Lấy data của site A từ ngày X đến ngày Y", ClickHouse chỉ cần quét một đoạn dữ liệu liên tục trên đĩa (Range Scan), cực nhanh.
*   **`LowCardinality`:** ClickHouse sẽ nén các giá trị lặp lại (như "chrome", "mobile", "google") thành dictionary số, giúp tiết kiệm 90% dung lượng và tăng tốc xử lý.
*   **`PARTITION BY toYYYYMM`:** Dữ liệu được chia thành các thư mục vật lý theo tháng.

---

### 2. Data Retention (Xử lý dữ liệu cũ)

Có 2 chiến lược tùy thuộc vào việc bạn muốn dữ liệu "biến mất hoàn toàn" hay "lưu trữ lạnh" (cheap storage).

**Cách 1: TTL tự động (Đơn giản nhất)**
ClickHouse hỗ trợ TTL ngay trong định nghĩa bảng (như ví dụ trên). Khi dữ liệu quá hạn, nó sẽ tự động bị xóa.
*   *Ưu điểm:* Không cần code thêm, tự động giải phóng ổ cứng.
*   *Nhược điểm:* Dữ liệu mất hẳn, không thể khôi phục để xem lại báo cáo cũ.

**Cách 2: Di chuyển sang Cold Storage (S3/Object Storage)**
Nếu bạn muốn giữ dữ liệu vĩnh viễn nhưng không muốn tốn SSD đắt tiền:

1.  Cấu hình ClickHouse Multi-disk storage.
2.  Định nghĩa TTL để **MOVE** dữ liệu sang đĩa S3 thay vì DELETE.

```sql
ALTER TABLE analytics_events MODIFY TTL 
  event_time + INTERVAL 3 MONTH TO VOLUME 's3_storage',
  event_time + INTERVAL 12 MONTH DELETE;
```
*   *Logic:* 3 tháng đầu dữ liệu nằm trên SSD (Query siêu nhanh). Sau 3 tháng chuyển sang S3 (Query hơi chậm hơn một chút nhưng rẻ). Sau 12 tháng xóa hẳn.

---

### 3. Real-time Dashboard (Số người đang online)

Bạn **KHÔNG NÊN** dùng ClickHouse để query real-time liên tục (mỗi 5 giây query 1 lần) vì sẽ gây tải nặng IO.

**Giải pháp: Dùng Redis Sorted Set (ZSET)**

Redis Sorted Set là cấu trúc dữ liệu hoàn hảo cho bài toán "ai đang online".

**A. Cơ chế ghi (Golang Ingestion):**
Khi nhận event từ Plugin, Golang thực hiện 2 việc song song:
1.  Ghi vào ClickHouse (để lưu lịch sử).
2.  Ghi vào Redis (để tracking real-time).

```go
// Golang pseudo code
currentTime := time.Now().Unix()
key := "online_users:" + siteID

// Thêm session_id vào ZSet với score là timestamp hiện tại
rdb.ZAdd(ctx, key, &redis.Z{Score: float64(currentTime), Member: sessionID})
// Set thời gian hết hạn cho key nếu cần (tuỳ chọn)
```

**B. Cơ chế đọc (API Dashboard):**
Để lấy số người online, bạn đếm số session có timestamp trong 5 phút gần nhất.

```go
// Logic lấy số người online
fiveMinsAgo := time.Now().Add(-5 * time.Minute).Unix()
count, _ := rdb.ZCount(ctx, key, strconv.Itoa(int(fiveMinsAgo)), "+inf").Result()
// Trả về count cho Dashboard
```

**C. Cơ chế dọn dẹp (Cleanup):**
Sorted Set sẽ tự động lớn lên. Bạn cần một Cron job nhỏ trong Golang chạy mỗi 10 phút để xóa các session cũ (quá 5 phút không hoạt động) khỏi Redis.

```go
// Xóa các session có score nhỏ hơn 5 phút trước
rdb.ZRemRangeByScore(ctx, key, "-inf", strconv.Itoa(int(fiveMinsAgo)))
```

### Tổng kết kiến trúc hoàn chỉnh

1.  **ClickHouse:** Lưu dữ liệu thô, tính toán báo cáo ngày/tuần/tháng, doanh thu, funnel. (Schema có Partition & TTL).
2.  **Redis:** Xử lý tính năng Real-time (Online Users) và Cache các query báo cáo lặp lại (Top Pages hôm nay).
3.  **Golang:** Điều phối, nhận event -> đẩy vào ClickHouse + Redis.

Cách này giúp bạn có Dashboard "nóng" (Real-time) cực nhanh (vì Redis ở RAM) mà không làm ảnh hưởng đến ổ cứng ClickHouse.