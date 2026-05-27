---
name: fix
description: Sửa tất cả bug, error, và issue đã được xác định trong code
---

Hãy sửa tất cả các issue trong codebase Konbini theo thứ tự ưu tiên:

## Thứ tự xử lý
1. **CRITICAL** trước — sửa hết mọi lỗi có thể crash hoặc break chức năng
2. **WARNING** tiếp theo — sửa các edge case và potential bugs
3. **INFO** cuối — cải thiện nhỏ nếu còn thời gian

## Nguyên tắc khi fix
- Đọc file trước khi sửa — không đoán mò nội dung
- Sửa đúng chỗ, không refactor lan rộng ngoài phạm vi issue
- Không thêm tính năng mới trong quá trình fix
- Không xóa code đang dùng dù trông "thừa" — chỉ xóa khi chắc chắn unused
- Sau mỗi fix, ghi chú ngắn gọn: file nào, sửa gì, tại sao

## Sau khi fix xong
Tóm tắt:
- Số issue đã fix: X
- File đã thay đổi: [danh sách]
- Issue nào chưa fix và lý do (nếu có)
- Bất kỳ side effect nào cần chú ý
