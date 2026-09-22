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

Khi có quyền, lấy bảy ngày hoàn chỉnh gần nhất, tách cohort theo versionCode/rollout date; luôn báo cỡ mẫu và không diễn giải một tỷ lệ đơn lẻ. Đặc tả telemetry đã được chốt nhưng chưa có collector/outbox hay hệ đo mới được thêm vào.

## Vấn đề cản trở check-in đã xác minh trong mã

Chọn một habit không tính giờ đã tồn tại từ Recent/Pinned/Browse trong Add Activity trước đây rơi vào `useCreateTask`: nó upsert task rồi báo thành công nhưng không ghi `activity_log`. Điều này khiến người dùng tưởng đã check-in trong khi habit vẫn chưa có activity. Timed habit vẫn yêu cầu người dùng chọn thời lượng; Backfill vẫn giao choice về parent; tạo habit mới vẫn chỉ tạo habit, không tự check-in.

Patch trên branch này chuyển riêng trường hợp chọn **habit có sẵn, không tính giờ, từ global Add Activity** sang `useLogTask`, tức append activity do người dùng chủ động chọn. `useLogTask` dùng đường ghi log chuẩn và cơ chế mutation hiện hữu; patch không tự ghi nhận completion cho habit mới.

## Kiểm thử

| Kiểm tra | Kết quả |
| --- | --- |
| Unit test quyết định luồng (existing/non-timed, timed, new, Backfill) | Pass: 5/5. |
| TypeScript | Pass: `npx tsc --noEmit`. |
| Unit test sandbox + idempotency retry | Pass: 23/23 (`qaSandbox.test.ts`, `useToday.coverage.test.ts`). Cùng `operationKey` là no-op cho `activity_log` và rollup; operationKey mới vẫn ghi check-in mới. Upsert chỉ no-op ở partial unique index `(user_id, activity_key)`; lỗi `NOT NULL` vẫn reject. |
| Jest toàn bộ | Pass: 120 suites, **1,172 tests**, 1 snapshot. Đây là kết quả trên cây patch cuối, thay cho số 1,169 của commit cũ. Các console warning từ fixture auth/secure-store có sẵn nhưng không làm test thất bại. |
| Native debug QA | Pass build cục bộ: APK `com.habitring.app.qa`, version `2.0.4.d-qa` / versionCode 89, ký debug, cài song song với `com.habitring.app`; không ghi Production. Native bundle chạy được với `expo-notifications` (khác với Expo Go). |
| QA fixture reset | Pass: chỉ hiện trong package debug `.qa` + identity QA. Nút `Reset QA sandbox data` yêu cầu xác nhận, purge fixture rồi seed lại; nó không có đường gọi nào trong Production. Khởi động bình thường chỉ kiểm tra fixture đã có, không reseed. |
| Runtime local write | Pass: sau reset tường minh, `Drink water` (habit có sẵn, không timed) tăng `activity_log` 422 → 423 và task 30 tăng 59 → 60, sinh key `activity-mucue5m0-sjlkjpgg3dk`. Banner xác nhận “Local fixture data · Sync disabled”; đây chỉ là local success, không phải sync success. |
| Nhánh luồng | Existing timed + “No timer” mở chọn thời lượng, không quick-log. Habit mới `QA_New_Local` tạo task với 0 `activity_log` hôm nay. Backfill không có ngày eligible trong fixture hiện tại; nhánh parent được phủ bởi unit test (không auto-log). |
| Double-tap UI | Pass: hai tap liên tiếp trên “No timer” cho `Dọn dẹp` sinh đúng một row mới (tổng 423 → 424; task 29 key `activity-mucufpwj-ds1drqm7it6`). Guard UI khác với retry bền vững: double-tap bị chặn khi đang submit; retry chỉ reuse cùng operationKey. |
| Persistence sau cold start | Pass: trong run persistence riêng (baseline sau check-in: tổng 423, task 30 là 60), force-stop rồi launch lại vẫn giữ tổng 423, task 30 là 60, và key `activity-mucue5m0-sjlkjpgg3dk` tồn tại. Run double-tap sau đó là run riêng, tăng 423 → 424. Đây là bằng chứng SQLite local của sandbox, không phải bằng chứng sync cloud. |
| Android SQLite targeted upsert | Pass: source bundle hiện tại ghi thêm `Drink water` qua `ON CONFLICT(user_id, activity_key) WHERE activity_key IS NOT NULL DO NOTHING`: tổng 424 → 425, task 30 là 60 → 61, row 1271 key `activity-mucuqz6n-sygyko4f2wk`. |

Runtime evidence được lưu trong `.visual-verify/` của worktree QA tạm thời, không được commit. Không kiểm tra sync Production và không đưa local success ra làm sync success.

Không triển khai collector/outbox trong buổi này: thiết kế yêu cầu quyết định privacy/retention và migration SQLite có review riêng. Không có request mạng telemetry nào được bật từ QA hay Production.

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
3. Khi privacy/retention được duyệt, triển khai local-only outbox theo đặc tả: chỉ `app_opened`, `habit_create_local_success`, `check_in_local_success`; first/return là chỉ số suy ra, và sync vẫn tách riêng/chưa quan sát.
