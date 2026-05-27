---
name: optimize
description: Tối ưu toàn bộ code — loại bỏ redundancy, cải thiện tốc độ, gọn gàng hơn
---

Hãy tối ưu toàn bộ codebase Konbini theo các tiêu chí sau:

## 1. Loại bỏ Redundancy
- Xóa import không dùng
- Xóa biến, hàm, component không dùng
- Gộp các đoạn code lặp lại thành utility/helper (chỉ khi dùng 3+ lần)
- Xóa comment thừa, console.log debug

## 2. Tối ưu Next.js / React
- Kiểm tra các Server Component có thể tránh re-render không cần thiết
- `useMemo` / `useCallback` chỉ thêm khi thực sự expensive (không thêm bừa)
- Đảm bảo `next/image` dùng đúng `sizes` để tránh load ảnh quá lớn
- Kiểm tra `revalidate` time có hợp lý không (không quá thấp gây nhiều request, không quá cao gây stale data)
- Dynamic import (`next/dynamic`) cho các component nặng chỉ dùng client-side

## 3. Tối ưu Bundle Size
- Kiểm tra có import cả thư viện khi chỉ cần một phần không (e.g., `import _ from 'lodash'` thay vì `import debounce from 'lodash/debounce'`)
- Tree-shaking có hoạt động đúng không

## 4. Tối ưu API Calls
- Các fetch có dùng `Promise.all` khi độc lập nhau không?
- Có fetch cùng một data nhiều lần không cần thiết không?
- Cache headers / revalidate có hợp lý không?

## 5. Performance & Memory
- Optimize for performance & memory without compromising current web quality/features.
- Phát hiện memory leak: event listener không cleanup, ref giữ DOM node sau unmount, closure giữ data lớn
- Tránh tạo object/array mới trong render loop khi không cần thiết
- Lazy load component và data chỉ khi cần (intersection observer, dynamic import)
- Đo trước khi tối ưu — chỉ fix khi có evidence rõ ràng về bottleneck

## 6. Code Style & Readability
- Magic numbers → named constants
- Inline style objects lặp lại → extract ra biến
- Conditional rendering phức tạp → tách thành component nhỏ hơn (chỉ khi thực sự cần)
- TypeScript types có chính xác không (tránh `any`, `as unknown`)

## Nguyên tắc
- Không thay đổi behavior — chỉ tối ưu cách implement
- Không optimize sớm (premature optimization) — chỉ sửa những gì đo được hoặc rõ ràng là vấn đề
- Mỗi thay đổi phải justify được lý do

## Output
Tóm tắt từng thay đổi: file, loại tối ưu, impact ước tính (nhỏ/trung bình/lớn).
