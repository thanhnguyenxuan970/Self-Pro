# Audit activation & retention — 2026-09-22

## Phạm vi và giới hạn

Audit này chỉ đọc Production, sửa code và kiểm thử local/QA sandbox. Không có deploy,
migration, thay đổi sync cloud hay ghi dữ liệu Production. Kết quả không chứng minh mục
tiêu WAU hay retention; dữ liệu hiện có chưa cho phép tính funnel hoặc cohort đáng tin cậy.

## Xác minh bản phát hành

| Nguồn | Quan sát | Kết luận |
| --- | --- | --- |
| Google Play Console, Production | Release `2.0.4.d`, versionCode **90**, rollout 100%, phát hành 2026-09-20 17:50 ICT, dashboard hiển thị 34 người dùng khả dụng | Đây là bản Android Production cần dùng làm mốc. |
| Git | Commit release gần nhất `69e6d05957fce2f1c3f780685923438cc0f86e2c` (`chore(release): bump Habi to 2.0.4.d`) khai báo versionCode **89** | Không thể xác minh commit build của bundle code 90 từ lịch sử Git hiện có. Không giả định checkout hiện tại là Production. |

Đã chỉ có khoảng 42 giờ sau rollout khi audit; chưa có bảy ngày hoàn chỉnh sau bản mới.
Không kết luận tác động theo phiên bản hoặc retention của bản này.

## Đo lường hiện có

| Điểm funnel | Bằng chứng hiện có | Có thể trả lời ngay? |
| --- | --- | --- |
| Mở app | Play Console chỉ có số tổng hợp 28 ngày (DAU trung bình 7.04, MAU trung bình 55.7); đây không phải event funnel/cohort | Không. |
| Tạo habit thành công | Không có event analytics hay timestamp tạo task ổn định có thể truy vấn từ Production | Không. |
| Check-in đầu tiên | `activity_log` local là source of truth; `useLogTask` kích hoạt D0 survey sau activity đầu tiên | Có thể suy ra ở từng thiết bị, nhưng chưa có truy vấn Production chỉ-đọc để tổng hợp. |
| Check-in vào ngày khác | `activity_log.local_date` có thể tạo cohort check-in, nhưng không đo app-open hay tạo habit | Chưa. |
| Sync thành công | Sau local write, app yêu cầu `requestCurrentUserSync`; đồng bộ là bước riêng và có trạng thái/retry riêng | Không được đồng nhất local success với cloud success. |

Play Console hiện chưa có crash/ANR cho release này (hiển thị “Data not yet available”); đây là **chưa quan sát được**, không phải “không có lỗi”. Dashboard Supabase cho 60 phút gần nhất có 18 request, 100% thành công và 0 lỗi ở API Gateway/Postgres/Auth, nhưng không phải cửa sổ bảy ngày hay funnel. Trang overview cũng hiển thị trạng thái app UI “Unhealthy”, nên hai tín hiệu này không đủ để kết luận sức khoẻ Production.

Sentry trong mã chỉ khởi tạo khi có `EXPO_PUBLIC_SENTRY_DSN`; worktree không có cấu hình đó và không có project Sentry để đọc. Vì vậy không thể xác minh Sentry Production hay kết luận không có exception.

## Dữ liệu bị chặn và tối thiểu cần cung cấp

Supabase CLI chưa được link vào project (không có `supabase/config.toml`). SQL Editor đang bật auto-save, nên không chạy truy vấn ở đó để giữ Production chỉ-đọc. Cần một trong các lựa chọn sau:

1. Một đường chạy SQL chỉ-đọc không auto-save, hoặc người vận hành chạy truy vấn đã duyệt rồi gửi kết quả đã tổng hợp/ẩn định danh.
2. Một linked Supabase CLI hoặc credential chỉ-đọc tạm thời cho đúng project.
3. Quyền xem analytics event/raw export và Play Console version breakdown sau khi đủ dữ liệu.

Khi có quyền, lấy bảy ngày hoàn chỉnh gần nhất, tách cohort theo versionCode/rollout date; luôn báo cỡ mẫu và không diễn giải một tỷ lệ đơn lẻ. Trước khi thêm telemetry mới, cần QA event idempotency/deduplication; hiện chưa thêm hệ đo mới.

## Vấn đề cản trở check-in đã xác minh trong mã

Chọn một habit không tính giờ đã tồn tại từ Recent/Pinned/Browse trong Add Activity trước đây rơi vào `useCreateTask`: nó upsert task rồi báo thành công nhưng không ghi `activity_log`. Điều này khiến người dùng tưởng đã check-in trong khi habit vẫn chưa có activity. Timed habit vẫn yêu cầu người dùng chọn thời lượng; Backfill vẫn giao choice về parent; tạo habit mới vẫn chỉ tạo habit, không tự check-in.

Patch trên branch này chuyển riêng trường hợp chọn **habit có sẵn, không tính giờ, từ global Add Activity** sang `useLogTask`, tức append activity do người dùng chủ động chọn. `useLogTask` dùng đường ghi log chuẩn và cơ chế mutation hiện hữu; patch không tự ghi nhận completion cho habit mới.

## Kiểm thử

| Kiểm tra | Kết quả |
| --- | --- |
| Unit test quyết định luồng (existing/non-timed, timed, new, Backfill) | Pass: 5/5. |
| TypeScript | Pass: `npx tsc --noEmit`. |
| Jest toàn bộ | Pass: 120 suites, 1,168 tests. Các console warning từ fixture auth/secure-store có sẵn nhưng không làm test thất bại. |
| Runtime local QA sandbox | Đã đi qua Add Activity → chọn habit có sẵn `Drink water` → `No timer`, một lần chạm, trong sandbox ghi rõ “Sync disabled”. Sau đó Expo Go chặn runtime vì `expo-notifications` remote push không còn hỗ trợ trên Android Expo Go (SDK 53+), nên không quan sát được toast cuối. Đây là giới hạn môi trường QA, không phải bằng chứng patch không hoạt động. |

Không lặp lại thao tác để tránh tạo check-in trùng. Xác minh runtime đầy đủ cần development build hoặc APK debug có native notifications tương thích, rồi kiểm tra một lần ghi local và trạng thái sync riêng.

## Việc tiếp theo ưu tiên

1. Lấp lỗ hổng build provenance: release record phải giữ versionName, versionCode, Git SHA và artifact SHA; hiện code 90 không truy ngược được commit.
2. Mở đường truy vấn Production chỉ-đọc, lấy baseline check-in bảy ngày và version segment sau rollout.
3. Chỉ sau khi QA dedupe, thiết kế event tối thiểu cho `app_open`, `habit_create_success`, `first_check_in`, `return_day_check_in`, với event ID ổn định và phân biệt `local_write_success` / `sync_success`.
