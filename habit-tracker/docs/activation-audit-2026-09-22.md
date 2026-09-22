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
| Jest toàn bộ | Pass: 120 suites, **1,169 tests** tại commit `8aa350e`. Các console warning từ fixture auth/secure-store có sẵn nhưng không làm test thất bại. |
| Native debug QA | Pass build cục bộ: APK `com.habitring.app.qa`, version `2.0.4.d-qa` / versionCode 89, ký debug, cài song song với `com.habitring.app`; không ghi Production. Native bundle chạy được với `expo-notifications` (khác với Expo Go). |
| Runtime local write | `Drink water` (habit có sẵn, không timed) từ 0 lên đúng 1 `activity_log` hôm nay, tổng 11 → 12, 25 → 30 điểm; UI heatmap phản ánh 30 điểm và toast native hiển thị “Activity checked in”. Sandbox có banner “Local fixture data · Sync disabled”, vì vậy đây chỉ là local success, không phải sync success. |
| Nhánh luồng | Existing timed + “No timer” mở chọn thời lượng, không quick-log. Habit mới `QA_New_Local` tạo task với 0 `activity_log` hôm nay. Backfill không có ngày eligible trong fixture hiện tại; nhánh parent được phủ bởi unit test (không auto-log). |
| Double-submit | Hai tap cách 50 ms trên “No timer” tạo đúng một dòng mới (11 → 12, một `activity_key`); tap thứ hai sau khi sheet đóng đã điều hướng tab Rank. Không có duplicate write trong phép thử, nhưng đây là vấn đề UX cần theo dõi. |
| Persistence sau cold start | **Chưa PASS.** `seedQaSandbox()` gọi `purgeQaSandbox()` mỗi process start, nên fixture quay về 25 điểm và `Drink water` về 0 sau relaunch. Điều này chặn việc chứng minh persistence của ứng dụng bằng sandbox; không được diễn giải là mất dữ liệu của bản Production. Cần QA sandbox có reset tường minh thay vì reseed lúc cold start, hoặc một debug account/local DB không reseed. |

Runtime evidence được lưu trong `.visual-verify/` của worktree QA tạm thời, không được commit. Không kiểm tra sync Production và không đưa local success ra làm sync success.

Gradle safety: biến thể `debug` và `qa` có package `.qa`/debug signing. `qa` không phải fixture
sandbox; nó bị chặn trừ khi có `-PhabiBuildTarget=staging`, sau đó bắt buộc endpoint staging hợp
lệ và không phải host Production trước khi bundle được tạo.

## PR base và phạm vi

`HEAD` kế thừa `b7ef07b` (local `codex/release-2.0.4`), nhưng remote
`origin/codex/release-2.0.4` chưa có 12 commit nền đó. Diff hiện tại so với remote
base là 46 files / 1,833 insertions / 286 deletions; so với `origin/main` là 48 files /
1,848 insertions / 288 deletions. Cả hai đều không phải PR base của patch này.

Không tạo draft PR cho đến khi branch base chứa `b7ef07b` được publish hoặc người sở hữu
xác nhận base khác. PR đúng chỉ được bao gồm thay đổi activation patch, QA build isolation,
và tài liệu; tuyệt đối không push/cherry-pick 46 file nền hay các thay đổi chưa commit của
người dùng để làm cho diff nhỏ lại.

## Việc tiếp theo ưu tiên

1. Lấp lỗ hổng build provenance: release record phải giữ versionName, versionCode, Git SHA và artifact SHA; hiện code 90 không truy ngược được commit.
2. Mở đường truy vấn Production chỉ-đọc, lấy baseline check-in bảy ngày và version segment sau rollout.
3. Chỉ sau khi QA dedupe, thiết kế event tối thiểu cho `app_open`, `habit_create_success`, `first_check_in`, `return_day_check_in`, với event ID ổn định và phân biệt `local_write_success` / `sync_success`.
