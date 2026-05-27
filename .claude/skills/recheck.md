---
name: recheck
description: Tự động recheck plan hiện tại, fix mọi lỗi/conflict/thiếu sót, lặp lại đến khi không còn vấn đề nào và độ tin cậy đạt ≥95%
---

Thực hiện vòng lặp recheck sau đây cho plan hiện tại (đọc file plan trong C:\Users\Admin\.claude\plans\):

**Quy trình mỗi vòng:**
1. Đọc toàn bộ plan file
2. Kiểm tra kỹ từng hạng mục theo checklist:
   - Kiến trúc tổng thể: các thành phần có đủ và nhất quán không?
   - Database schema: tables, columns, FK, constraints, UNIQUE, missing fields?
   - Security model: có lỗ hổng hay mâu thuẫn nào không?
   - RBAC: phân quyền có đầy đủ và enforce đúng chỗ không?
   - Frontend flow: có bước nào bị đứt hoặc thiếu state không?
   - Backend routers + schemas: có endpoint nào thiếu hoặc thừa không?
   - Phases: mọi việc cần làm có được assign vào phase nào không?
   - Verification: có test case nào bị bỏ sót không?
   - Wording: có mô tả nào mơ hồ gây nhầm lẫn khi implement không?
3. Liệt kê TẤT CẢ vấn đề tìm thấy (conflict, thiếu sót, wording mơ hồ, implementation gap)
4. Fix từng vấn đề trực tiếp vào plan file
5. Sau khi fix xong, tự đánh giá: "Còn vấn đề không? Độ tin cậy hiện tại: X%"
6. Nếu X < 95% → quay lại bước 1, tiếp tục vòng mới
7. Nếu X ≥ 95% VÀ không còn vấn đề nào → dừng, báo cáo kết quả cuối

**Báo cáo mỗi vòng:**
- Vòng N: tìm thấy [số] vấn đề → đã fix [số] → độ tin cậy: X%

**Kết thúc khi:**
- Không còn conflict, thiếu sót, wording mơ hồ nào
- Độ tin cậy ≥ 95%
- Báo cáo: "Plan đã đạt [X]% — sẵn sàng implement"
