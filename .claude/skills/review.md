---
name: review
description: Review toàn bộ system, code, pipeline để phát hiện lỗi, thiếu sót, và conflict
---

Hãy thực hiện một review toàn diện của toàn bộ hệ thống Konbini. Kiểm tra theo thứ tự sau:

## 1. Cấu trúc & Config
- Tất cả config files có đúng format và đầy đủ không (next.config, tailwind, tsconfig, postcss)?
- Các biến môi trường trong `.env.example` có khớp với những gì code đang dùng không?
- `package.json` dependencies có conflict version không?

## 2. Frontend (Next.js)
- Tất cả `'use client'` directive có đặt đúng chỗ không (chỉ khi dùng hooks/browser APIs)?
- Server Components có vô tình import client-only code không?
- `next/image` có đúng `alt`, `width`/`height` hoặc `fill` + `sizes` không?
- Links có dùng `next/link` thay vì `<a>` không?
- Có route nào thiếu `notFound()` khi fetch thất bại không?
- TypeScript errors hoặc `any` type không?
- Có import nào bị unused không?

## 3. State Management & Cart
- Zustand store (`lib/cart.ts`) có hoạt động đúng không (addItem, removeItem, updateQty, total)?
- `persist` middleware có config đúng key và storage không?
- Có hydration mismatch nào giữa server và client không?

## 4. Backend (FastAPI)
- Tất cả routers có được include trong `main.py` không?
- CORS origins có đúng với frontend URL không?
- Schemas (Pydantic) có khớp với DB schema trong migrations không?
- Auth middleware có apply đúng trên các protected routes không?
- Error handling có nhất quán (HTTPException với status codes đúng) không?

## 5. Database & Migrations
- Các migration files có idempotent không (chạy lại không bị lỗi)?
- Foreign keys có đúng không?
- RLS policies có cover đủ các use case (public read, authenticated write) không?
- RPC functions có handle edge cases (stock = 0, invalid phone) không?

## 6. Cross-cutting Concerns
- Có data type mismatch nào giữa frontend ↔ API ↔ DB không?
- API endpoints frontend đang gọi có tồn tại trong backend không?
- Các mock data có đúng format với real API response không?
- Có hardcoded URL hay magic number nào cần extract ra constant không?

## Output Format
Trình bày kết quả theo format:

**CRITICAL** 🔴 — Lỗi sẽ crash hoặc break chức năng
**WARNING** 🟡 — Có thể gây bug trong một số trường hợp
**INFO** 🔵 — Cần cải thiện nhưng không urgent

Với mỗi issue: nêu rõ file, dòng (nếu có), vấn đề là gì, và gợi ý fix ngắn gọn.
Kết thúc bằng: **Tổng số issue: X critical, Y warning, Z info**
