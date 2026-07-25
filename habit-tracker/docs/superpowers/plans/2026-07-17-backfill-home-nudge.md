# Plan — Home nudge cho Điểm danh bù (discovery, đa-ngày)

> Phạm vi: **chỉ cách vận hành** (behavior/logic). Design/visual do chủ dự án tự lo.
> Vấn đề gốc: tính năng điểm danh bù đã tồn tại nhưng chỉ nằm trong Calendar → user không biết có. Đưa một *nudge có điều kiện* lên Home, đúng lúc còn cứu được, không phá triết lý làm-đều.

## 0. Nguyên tắc

- **Đo trước, sửa sau.** Hiện chưa log lượt mở/hoàn tất bù → mọi thay đổi UX là đoán trên n=1. Bước 1 bắt buộc là instrument (§7).
- **Nudge là lưới an toàn, không phải nút tua lại.** Quota `WEEKLY_BACKFILL_QUOTA = 2` và guard `NOT_CURRENT_WEEK` cố tình chặn hồi sinh chuỗi gãy nặng. Copy phải nói thật, không hứa cứu chuỗi khi không cứu được.
- **Không đụng logic bù lõi.** Tái dùng nguyên `canBackfill`, `backfillRemaining`, `computeStreakCounts`, `BackfillSheet`. Chỉ thêm lớp *phát hiện + điều hướng* ở Home.

## 1. Dữ liệu đầu vào

| Nguồn | Lấy gì | Ghi chú |
|---|---|---|
| `useBackfillStatus(userId)` | `backfillsUsedThisWeek`, `freezeDates` | đã có sẵn |
| `useCalendarData` / daily_summary | ngày nào trong tuần có hoạt động | để biết ngày trống |
| `getLocalDate()`, `getWeekStart()` | `today`, `currentWeekStart` | biên tuần |
| `game/backfill.ts` | `canBackfill`, `backfillRemaining` | guard + quota còn lại |

Không thêm bảng/khoá mới. Nudge là **hàm dẫn xuất** từ trạng thái đã có.

## 2. Tính "ngày lỡ đủ điều kiện bù" (eligibleMissedDays)

Duyệt mỗi ngày `d` trong **tuần hiện tại**, từ `currentWeekStart` đến `today - 1`:

```
eligible(d) = canBackfill({
  date: d, today, weekStartOfDate: getWeekStartFor(d), currentWeekStart,
  dayHasActivity: dayMap[d] != null,
  backfillsUsedThisWeek,
  hasStreakFreeze: freezeDates.has(d),
}).allowed
```

`eligibleMissedDays = [d for d in tuần nếu eligible(d)]` (sắp tăng dần theo ngày).

Suy ra:
- `pending = eligibleMissedDays.length`
- `remaining = backfillRemaining(backfillsUsedThisWeek)` (tối đa 2)
- `fixable = min(pending, remaining)` — số ngày thực tế bù được tuần này.

> Ngày lỡ ở **tuần trước** không bao giờ vào danh sách (`NOT_CURRENT_WEEK`). Không nhắc, không đếm.

## 3. Điều kiện hiện chip (trigger)

Hiện chip khi **tất cả** đúng:

1. `pending >= 1` (có ngày lỡ còn cứu được trong tuần)
2. `remaining >= 1` (còn lượt)
3. Chưa bị dismiss trong phạm vi hiện hành (§6)

Nếu `pending >= 1` nhưng `remaining == 0` → **không hiện chip điều hướng bù** (không còn cứu được); tùy chọn hiển thị biến thể "hết lượt / tuần sau reset" — mặc định **ẩn** để tránh nhiễu (quyết định mở, §8).

Ẩn hoàn toàn khi `pending == 0`.

## 4. Máy trạng thái chip

| State | Điều kiện | Hành vi |
|---|---|---|
| `HIDDEN` | `pending==0` hoặc bị dismiss | không render |
| `PROMPT_FULL` | `1 <= pending <= remaining` | "Lỡ N ngày · bù hết sẽ nối lại chuỗi" → CTA mở day-picker |
| `PROMPT_CAPPED` | `pending > remaining >= 1` | "Lỡ N ngày, chỉ bù được `fixable` (giới hạn lượt) — chuỗi khó cứu trọn" → CTA vẫn mở |
| `DONE_RECONNECTED` | vừa bù xong & chuỗi nối lại (§5) | "Đã bù, chuỗi được nối lại" → tự ẩn sau vài giây |
| `DONE_PARTIAL` | vừa bù xong nhưng vẫn còn ngày trống | "Đã ghi lại hoạt động · chuỗi vẫn đứt ở ngày chưa bù" → tự ẩn |
| `QUOTA_OUT` (tùy chọn) | `pending>=1 && remaining==0` | biến thể "bắt đầu lại" hoặc ẩn |

Chuyển trạng thái chỉ do: (a) recompute §2 sau mỗi lần khoá ngày, (b) user dismiss.

## 5. Luật nối lại chuỗi (khi nào "cứu" được)

Dựa `computeStreakCounts` (active→+1, trống→reset 0). Chuỗi hiện tại (tính tới hôm nay) chỉ liền lại nếu **mọi ngày trống trong dải liên tiếp** từ sau ngày active gần nhất tới hôm nay đều được lấp.

Định nghĩa `brokenRun` = dãy ngày trống liên tiếp kết thúc ở hôm qua (ngăn hôm nay khỏi chuỗi cũ).

```
reconnect khả thi ⇔ mọi d ∈ brokenRun đều eligible (tuần này, trống, không freeze)
                   ∧ |brokenRun| <= remaining
```

Hệ quả vận hành:
- `|brokenRun| > 2` → **không bao giờ** nối lại (quota chặn). Chip dùng `PROMPT_CAPPED`, không hứa cứu chuỗi.
- Bù *một phần* vẫn ghi điểm/sao qua `computeBackfillSession` → không vô ích, chỉ không phục hồi streak. Copy phản ánh đúng (`DONE_PARTIAL`).
- Chỉ set `DONE_RECONNECTED` khi sau khi khoá, `brokenRun` rỗng.

## 6. Dismiss & tái hiện (persistence)

- Nút ✕ = dismiss. Lưu cờ dismiss theo **ngày** (key: `backfillNudgeDismissed:<today>`), không theo session → tránh nhắc lại liên tục trong ngày nhưng vẫn xuất hiện lại nếu qua hôm sau vẫn còn ngày lỡ eligible.
- Tự reset khi: sang ngày mới, hoặc `pending` giảm về 0 rồi tăng lại (lỡ ngày mới).
- Quyết định mở: có tôn trọng dismiss "vĩnh viễn trong tuần" không (§8).

## 7. Instrumentation (làm TRƯỚC UI)

Log tối thiểu để có baseline discovery:

| Event | Khi nào | Thuộc tính |
|---|---|---|
| `backfill_nudge_shown` | chip render | `pending`, `remaining`, `state` |
| `backfill_nudge_cta` | bấm CTA mở day-picker | `pending`, `remaining` |
| `backfill_nudge_dismissed` | bấm ✕ | `pending` |
| `backfill_sheet_opened` | mở `BackfillSheet` (mọi nguồn: Home/Calendar) | `source: 'home' \| 'calendar'`, `date` |
| `backfill_saved` | khoá ngày thành công | `date`, `entryCount`, `reconnected: bool` |

Chỉ số theo dõi: tỉ lệ `sheet_opened` từ `source='home'` vs `'calendar'`; tỉ lệ `saved/shown`.

## 8. Quyết định còn mở (cần chốt trước khi code)

1. **`pending > remaining`**: vẫn nhắc (`PROMPT_CAPPED`) hay ẩn? — Đề xuất: **vẫn nhắc**, đổi giọng, vì user vẫn cứu được `fixable` ngày và ghi lại hoạt động.
2. **Dismiss**: reset theo ngày (đề xuất) hay ẩn cả tuần?
3. **`QUOTA_OUT`**: ẩn (đề xuất) hay hiện biến thể "bắt đầu lại"?
4. **Tần suất**: giới hạn tối đa 1 lần hiện/ngày kể cả reload? (đề xuất: có).

## 9. Non-goals

- Không đổi `WEEKLY_BACKFILL_QUOTA`, không đổi guard trong `canBackfill`.
- Không push notification (đã loại vì gây phiền).
- Không đụng Calendar affordance ở plan này (tách riêng — xem idea #2/#3).
- Design/visual/copy cuối: chủ dự án tự lo.

## 10. Thứ tự triển khai

1. §7 instrument + baseline (1 buổi).
2. Hàm dẫn xuất §2 + selector state §4 (thuần, unit-test như `backfill.test.ts`).
3. Chip Home + điều hướng sang `BackfillSheet` hiện có (đa-ngày qua day-picker).
4. Copy trung thực theo §5.
5. Bật sau cờ, so `saved/shown` với baseline trước khi mở rộng (Calendar dot, streak-break toast).

## 11. Rủi ro

- **Over-nudge** làm loãng động lực làm-đều → chặn bằng dismiss theo ngày + chỉ hiện khi còn cứu được.
- **Copy sai về streak** gây mất niềm tin → §5 là nguồn chân lý; test riêng ca `|brokenRun|>quota`.
- **Biên tuần/timezone**: `eligibleMissedDays` phải tính theo `getWeekStart`/`getLocalDate` đang dùng, không tự parse ngày.

---
*Gợi ý tự động hóa: gói §7 thành Claude Skill "add-analytics-event" — chèn call log + tên event type-safe + cập nhật bảng event, tránh sót chỗ.*
