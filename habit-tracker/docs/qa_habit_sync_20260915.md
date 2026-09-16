# Sync integration verification — 2026-09-15

## Chốt kết quả

- Coordinator retry/account-fence: **PASS code-level**.
- Client đã được cắt sang durable activity identity: SQLite `activity_key`, local outbox, append/delete theo key, và giữ dữ liệu legacy chưa được xác minh ở local.
- Coordinator gọi `syncCurrentUserToSupabase(expectedAccountSub?)`; không còn gọi client zero-argument theo contract cũ ở các call-site production.
- `activity_identity_status` là trạng thái local SQLite/backup. Không coi việc thiếu cột/RPC này ở Postgres là lỗi backend.
- Không merge, deploy, ghi production, gc/prune, reset, xoá ref hoặc force-push.

## Git safety

- Git common directory, worktree metadata, reflog, object store và snapshot thay đổi chưa commit đã được sao lưu tại:
  `C:\Users\Admin\Documents\Codex\2026-09-15\ch-a-merge-ready-ph-t\work\git-safety-backup-20260915-144615`.
- Các commit mục tiêu vẫn truy cập được:
  `0db179c`, `08ee7bf`, `3206194`, `2a3ecb6`; build reference là `2a8afe6`.
- Reflog inventory vẫn chứa đường truy cập tới các commit mục tiêu qua `HEAD`, các branch activity-identity/ship/verify và worktree refs; không có kết luận phục hồi đầy đủ từ một branch đơn lẻ.
- `git fsck --full --no-reflogs --connectivity-only` chưa sạch vì common Git metadata còn ref checkpoint chứa null SHA và `refs/remotes/origin/HEAD` trỏ tới target không tồn tại; đồng thời có dangling objects.
- Nhiều worktree metadata cũ trỏ tới thư mục đã mất. Việc một worktree/branch hoạt động không đủ để kết luận toàn bộ refs/worktrees đã được phục hồi. Chưa tự sửa hoặc xoá các ref hỏng vì chưa có SHA đích đáng tin cậy.

## Client/backend contract

- `08ee7bf` là durable-key client/schema slice; `3206194` là coordinator/retry slice trên nhánh khác. Hai commit không tạo thành một lịch sử tuyến tính: đều cần composition khi tích hợp.
- Client hiện gửi `append_my_activity_rows(jsonb)` với `p_activity_rows`, xác nhận đủ durable keys rồi mới advance cursor; delete dùng `delete_my_activity_keys(text[])` và không xác nhận delete khi thiếu key.
- Migration `076_activity_server_gate.sql` không được áp dụng lên backend `55421`, nơi client cũ vẫn còn direct activity write contract.
- Không mở rộng quyền backend để né lệch contract.

Thứ tự composition được chốt: local SQLite migration (`activity_key`, local status, delete outbox) → activity producers/backup và legacy reconciliation → client append/delete durable RPC → coordinator/call-sites/UI pending state → chỉ sau đó mới gate backend `076` trên runner đã xác minh. Runner cũ `55421` không đi qua bước cuối.

## Backend runner evidence

Hai Supabase local stacks đang tồn tại và được kiểm tra chỉ-đọc trước smoke test:

| Runner | Contract | Kết quả |
|---|---|---|
| `http://127.0.0.1:55421` | Có `activity_key`, thiếu append/delete durable RPC, direct activity INSERT/UPDATE/DELETE còn mở | **Không dùng để chạy client mới** |
| `http://127.0.0.1:54321` | Đã có migrations `073,074,075,076`, append/delete durable RPC, direct activity INSERT/UPDATE/DELETE đã revoke | **Runner phù hợp** |

Smoke test trên `54321` dùng anon key thật lấy từ local container và email/password test user tạm thời: append lần đầu `200`, retry cùng durable key `200`, số row sau retry `1`, delete theo key `200`, số row sau delete `0`. Test user đã bị xoá; `auth.users` trở về `3`, `CODEX_SMOKE` rows còn `0`.

Auth settings local có Google provider enabled và endpoint nhận key thật. Chưa có Google ID token/test account nên chưa xác minh được luồng Google/Firebase thật; smoke email/password không được coi là Google Auth E2E.

## Firebase, build và APK

- `google-services.json` hiện có trong dirty workspace, package đúng `com.habitring.app`, file không bị che giá trị; không in secrets. SHA-256 hiện tại: `C0D578532C163D5B4904E7EEA3B56754A1E8EA1ECF4AA06C5095D8873653C369`.
- Build thử trước đây ở `2a8afe6` dùng `local-qa-anon-key`, đây là placeholder; lỗi Firebase lúc đó khiến Gradle không tạo APK. Không dùng build đó làm bằng chứng Auth.
- Chưa có APK được build từ HEAD cuối hiện tại (`HEAD=0db179c` và còn dirty). Vì vậy chưa có runtime APK/emulator evidence từ composition cuối.
- `.env.local` hiện trỏ tới host production và không có build target staging; không dùng làm test credential.

## Test result

- TypeScript: **PASS** (`npx tsc --noEmit`).
- Full Jest: **PASS**, 113 suites / 1123 tests, 1 snapshot.
- Durable retry test hiện có mô phỏng row đã commit trước khi response mất và retry cùng durable key; đây là bằng chứng coordinator/unit-level.
- Live local smoke ở trên đã kiểm chứng idempotent append/delete contract thật với một authenticated local test user. Chưa kiểm chứng Google/Firebase bằng APK.

## Diff boundary

- Delta bổ sung lịch sử `3206194 → 2a8afe6`: coordinator giữ pending khi response mất, coalesce mutation đang bay, và account fence.
- Durable-key client/schema slice bắt đầu từ `08ee7bf` và được composition vào dirty workspace hiện tại.
- Không gọi toàn bộ dirty workspace là `3206194..HEAD`: HEAD hiện tại là `0db179c`, chưa có commit cuối sau composition. Full branch-vs-baseline phải đọc cùng Git snapshot và tách riêng thay đổi có sẵn của workspace.

## Còn thiếu để kết luận E2E

1. Một Google test account/ID token hợp lệ cho local hoặc staging backend.
2. Một APK build từ composition cuối với URL staging `127.0.0.1:54321` hoặc staging URL được phê duyệt và anon/publishable key thật tương ứng.
3. Kiểm tra runtime offline/reconnect/restart/account-switch trên APK đó.

Chưa tuyên bố đồng bộ an toàn end-to-end.
