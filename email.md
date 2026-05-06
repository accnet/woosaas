Dưới đây là bản tóm tắt toàn diện cho tính năng **Hệ thống Hỗ trợ Khách hàng (Support System)** tích hợp trong hệ sinh thái Analytics của bạn:

### 1. Mục tiêu
Biến hệ thống từ đơn thuần "Theo dõi dữ liệu" thành "Công cụ vận hành", giúp chủ shop quản lý hỗ trợ khách hàng ngay trên Dashboard, kết nối hành vi (Analytics) với lịch sử tương tác (Support).

### 2. Kiến trúc Kỹ thuật (Hybrid Database)
*   **PostgreSQL:** Lưu trữ dữ liệu nghiệp vụ (Tickets, Khách hàng, Nội dung hội thoại, Trạng thái). Cần tính năng Update/Delete liên tục.
*   **ClickHouse:** Vẫn giữ vai trò lưu log hành vi.
*   **Liên kết:** Dùng `client_id` hoặc `email` để nối liền dữ liệu giữa 2 DB.

### 3. Cơ chế hoạt động cốt lõi (2 Chiều)

#### A. Chiều Thu nhận (Inbound) - Tự động tạo Ticket
*   **Nguồn:**
    1.  **Form Submit:** Plugin WP bắt sự kiện gửi form (CF7, Checkout) -> Gửi API.
    2.  **Email:** Khách hàng cấu hình **Forwarding** email (`support@shop.com` -> `inbound@your-saas.com`).
*   **Xử lý:** Hệ thống phân tích email/form -> Tạo/Cập nhật Ticket trong PostgreSQL.

#### B. Chiều Trả lời (Outbound) - Gửi mail chuyên nghiệp
*   **Hành động:** Nhân viên shop trả lời trong Dashboard -> Bấm Gửi.
*   **Kỹ thuật gửi:**
    *   Dùng SMTP của hệ thống bạn (SendGrid/SES) để gửi.
    *   **Danh tính (Identity):** Email gửi đi hiển thị `From: support@shop.com` (chuyên nghiệp).
    *   **Xác thực (Verification):** Yêu cầu khách hàng thêm bản ghi **TXT (SPF/DKIM)** vào DNS domain để cấp quyền cho hệ thống bạn gửi mail hộ.
    *   **Threading:** Sử dụng Header `In-Reply-To` và `References` để nhóm thư thành chuỗi hội thoại trên Gmail/Outlook của khách hàng cuối.

### 4. Giá trị gia tăng (Killer Feature)
*   **Hồ sơ khách hàng thống nhất (360° View):** Khi xem một Ticket hỗ trợ, chủ shop thấy ngay:
    *   Khách này đến từ nguồn nào? (Facebook/Google).
    *   Đã xem những sản phẩm nào?
    *   Đã mua hàng chưa? (Dữ liệu từ ClickHouse).
    *   Lịch sử hỗ trợ trước đây? (Dữ liệu từ PostgreSQL).

### 5. Checklist triển khai cho khách hàng (Onboarding)
Để hệ thống hoạt động, khách hàng cần thực hiện 3 bước cấu hình đơn giản:
1.  **Xác thực Email:** Nhập email support vào hệ thống.
2.  **Cấu hình DNS:** Thêm các bản ghi TXT (cung cấp bởi hệ thống) để xác thực quyền gửi mail.
3.  **Cấu hình Forwarding:** Thiết lập tự động chuyển tiếp email về địa chỉ hệ thống chỉ định.

**Tóm lại:** Tính năng này giúp bạn cung cấp giải pháp **All-in-one** (Analytics + Helpdesk) mà không cần khách hàng phải thay đổi thói quen sử dụng email hiện tại quá nhiều, đồng thời tận dụng được hạ tầng gửi mail mạnh mẽ của bạn.