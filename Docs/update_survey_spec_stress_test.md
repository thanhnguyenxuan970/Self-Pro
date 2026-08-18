# Stress test — `Docs/update_survey_spec.md`

Tự phản biện, đối chiếu từng khẳng định với code thật. **8 lỗi, trong đó 3 lỗi đủ nghiêm trọng để làm hỏng tính năng.** Kèm 1 bug đang chạy trên production phát hiện được trong lúc kiểm.

---

## 🔴 P0-1 — Sentinel `pre_gate` làm tính năng chết câm

**Spec nói gì:** §2 lưu `'pre_gate'` cho user cũ. §4 luật 3 chỉ bắn khi "nhảy minor trở lên", so version **có cấu trúc**.

**Vì sao sai:** hai điều đó không tương thích. `parseVersion('pre_gate')` → `NaN`. Mọi phép so với `NaN` đều `false` → `isMinorOrGreaterJump()` trả `false` → **không một user cũ nào được bắn survey**.

**Vì sao đây là lỗi tệ nhất trong tài liệu:** nó **fail closed và im lặng**. Không crash, không log, không lỗi ở client. Bạn ship, đợi hai tuần, thấy 0 phiếu, và kết luận "user không quan tâm" — trong khi thực tế modal chưa từng render một lần nào. Bạn sẽ đi debug survey trong khi lỗi nằm ở hàm so version.

**Nghiêm trọng gấp đôi vì:** `pre_gate` không phải nhánh phụ. Ở release đầu tiên chứa gate, **100% user cũ đi qua đúng nhánh này** (xem P0-2). Nhánh chết = tính năng chết hoàn toàn ở đúng lần ra mắt bạn đang nhắm.

**Sửa:** `pre_gate` phải là carve-out tường minh, kiểm **trước** mọi phép so số:
```
if (lastSeen === 'pre_gate') → đủ điều kiện, BỎ QUA kiểm minor-jump
```
Và `compareVersions()` phải trả kiểu `'older' | 'same' | 'newer' | 'unknown'` — không phải số. Kiểu union buộc chỗ gọi phải xử lý `'unknown'`; kiểu số cho phép `NaN` trôi qua lặng lẽ. Đây là khác biệt giữa lỗi biên dịch và hai tuần mất trắng.

---

## 🔴 P0-2 — `habit_tracker_onboarded` KHÔNG phân biệt được new vs existing

**Spec nói gì:** §2 dùng `habit_tracker_onboarded` làm bộ phân biệt cold-start, và đánh giá nó tại thời điểm trigger (lần log đầu sau update).

**Vì sao sai — bằng chứng trong `src/hooks/useAuth.ts`:**

| Dòng | Hành vi |
|---|---|
| 230 | `completeOnboarding()` → set `'true'` |
| 250 | `result.isNew ? removeItem : setItem('true')` — user cũ đăng nhập máy mới được set **ngay lúc sign-in** |
| 210, 297 | **Xoá** key khi sign-out / clear auth state |

**Hỏng cả hai chiều:**

*Chiều 1 — user mới ăn cả hai survey.* Người cài mới: sign-in (`isNew` → key bị **xoá**) → xong onboarding (key **được set**) → log lần đầu. Đúng lúc gate của tôi chạy thì `onboarded !== null` và `lastSeen === null` → **bị phân loại là user cũ vừa cập nhật.** §3 luật 1 chỉ *hoãn*, không *cấm*: D0 hiện, `pending` được xoá, và ở **lần log kế tiếp** update survey bắn. Người dùng mới nhận đủ 2 survey. Đây đúng bằng điều tôi tuyên bố ở §3 là "không bao giờ được xảy ra".

*Chiều 2 — user cũ bị bỏ sót.* Ai đang ở trạng thái đã sign-out lúc cập nhật thì `onboarded === null` → bị coi là user mới → **vĩnh viễn không bao giờ được hỏi**. Mất mẫu không dấu vết.

**Nguyên nhân gốc không phải chọn sai key — mà là chọn sai THỜI ĐIỂM ĐO.** Sau onboarding thì hai nhóm trông giống hệt nhau. Chỉ có đúng một khoảnh khắc chúng còn phân biệt được: **lần mount đầu tiên của binary mới, trước khi bất kỳ logic auth/onboarding nào chạy.**

**Sửa:** lấy mẫu và chốt `habi_last_seen_version` **ngay lúc boot**, trong effect chạy trước `useAuth`'s restoration — không phải lazily lúc trigger. Ở thời điểm đó bản cài mới thật sự có `onboarded === null`. Sau boot, giá trị đã latch; các lớp sau chỉ đọc.

---

## 🔴 P0-3 — Móc vào "cạnh dòng 509" là hướng dẫn sai

**Spec nói gì:** checklist — *"Móc vào `src/queries/useToday.ts` cạnh dòng 509"*.

**Vì sao sai:** dòng 509 nằm **bên trong** `if (data.isFirstEverLog) {`:
```ts
if (data.isFirstEverLog) {
  markSurveyD0Pending().then(notifyFirstEverLog).catch(() => {});   // ← 509
}
```
Đặt notifier update vào đây thì nó chỉ bắn cho **người log lần đầu đời** — tức đúng nhóm user mới phải bị loại trừ, và **không bao giờ** cho user cũ, những người đã tiêu mất sự kiện `isFirstEverLog` từ nhiều tuần trước.

Kết hợp với P0-1, hai lỗi này che nhau: một lỗi khiến 0 phiếu, lỗi kia khiến phiếu đến từ sai người. Chữa một cái vẫn ra kết quả vô nghĩa.

**Sửa:** đặt trong `onSuccess` **ngoài** khối `if`, và điều kiện là "chưa từng bắn ở version này trong session này", không dính gì tới `isFirstEverLog`.

---

## 🟠 P1-4 — Luật minor-jump vô hiệu ở đúng bản phát hành bạn đang làm

§0 cảnh báo: patch cosmetic thì câu "bản mới thế nào?" không trả lời được. §4 luật 3 được đặt ra để chặn việc đó.

**Nhưng ở release đầu tiên chứa gate, không tồn tại version trước để so.** Mọi user cũ đi nhánh `pre_gate`, mà nhánh đó (sau khi sửa P0-1) phải bỏ qua kiểm minor-jump — nếu không thì chết câm. Nghĩa là **luật bảo vệ không hoạt động ở đúng lần bạn cần nó nhất**: patch bug/UI vặt bạn vừa mô tả.

Tài liệu tự mâu thuẫn: §0 nói "đừng hỏi về patch cosmetic", §4 hứa chặn việc đó, còn cơ chế thì không chặn được ở lần đầu.

**Sửa — chọn một, tôi nghiêng về (b):**
- (a) Ship gate ở patch này nhưng **tắt bằng cờ**, chỉ bật ở release có nội dung user nhìn thấy được. Hạ tầng đi trước, câu hỏi đi sau.
- (b) Bỏ hẳn Q1 khỏi bộ câu hỏi. Q2 + Q3 không phụ thuộc nội dung patch và mang toàn bộ giá trị. Còn 1 MCQ + 1 câu mở — ngắn hơn, tỉ lệ hoàn thành cao hơn, và **mâu thuẫn biến mất thay vì được vá**.

---

## 🟠 P1-5 — `days_since_install` không tính được

§6 ghi field này "từ `activity_log`/`onboarded`, không hỏi user". Kiểm lại: `ONBOARDED_KEY` lưu đúng chuỗi `'true'`, **không có timestamp**. Không có khoá install-date nào trong toàn bộ AsyncStorage của app. `activity_log` cho ngày log đầu tiên, không phải ngày cài.

Thêm khoá mới lúc boot cũng không cứu được: nó `null` cho mọi user cũ — **đúng nhóm mà survey này nhắm tới**.

**Sửa:** bỏ khỏi payload client. Suy ra ở phía server khi phân tích, join `auth.users.created_at` qua `user_email`. Số này vốn thuộc về server, không thuộc về client.

---

## 🟡 P2-6 — Random hoá không được đụng vào option "thoát"

§5 bảo random thứ tự Q2 bằng `shuffled()`. Nhưng Q2-F ("Không có gì — tôi vẫn dùng đều") là option thoát, và Q1-D ("Chưa để ý thấy gì") cũng vậy. **Option thoát phải luôn ghim cuối.** Thả nó vào giữa danh sách thì nó biến thành một lựa chọn ngang hàng và hút phiếu từ những người lẽ ra đã chọn một rào cản thật.

Đáng nói: tài liệu D0 xử lý đúng chuyện này cho option exclusive của Q3, tôi chỉ không mang nguyên tắc đó sang. Random hoá **phần cạnh tranh**, ghim phần còn lại.

---

## 🟡 P2-7 — Tiêu chí dừng là tung đồng xu

§8: "sau 2 chu kỳ patch mà < 5 phiếu thì gỡ". Nhưng §0 tự ước lượng **2–5 phiếu mỗi chu kỳ** → kỳ vọng sau 2 chu kỳ là 4–10 phiếu. Ngưỡng nằm ngay giữa khoảng dự đoán của chính nó, nên nó bắn khoảng 50% số lần **kể cả khi mọi thứ chạy đúng như thiết kế**. Đó không phải luật quyết định, đó là ngẫu nhiên đội lốt kỷ luật.

**Sửa:** đổi tiêu chí từ *đếm* sang *nội dung*. "Nếu không phiếu nào ở Q3 chứa một phát biểu cụ thể, hành động được — gỡ." Ba phiếu có nội dung thắng ba mươi phiếu chỉ có MCQ, và ở n nhỏ thì đó mới là thứ đáng đo.

---

## 🟡 P2-8 — Chồng modal với chính D0

§3 chặn theo `readSurveyD0Pending()`, nhưng `TodayScreen` giữ state riêng `showSurveyD0` (dòng 234). `pending` bị xoá **ngay khi sheet hiện** (`markSurveyD0Shown()`), nên tồn tại một cửa sổ mà `pending === false` trong khi sheet D0 **vẫn đang hiển thị**. Điều kiện của tôi cho qua ở cửa sổ đó → hai `<Modal>` chồng nhau.

**Sửa:** thêm `!showSurveyD0` vào điều kiện gate, cùng chỗ với `pendingLevelUp`/`pendingStreakMilestone`.

---

# 🐞 Ngoài lề: một bug ĐANG CHẠY trong survey D0 đã ship

Không thuộc phạm vi tài liệu, phát hiện trong lúc kiểm.

`src/utils/feedbackLogic.ts:22-26`
```ts
export function validateFeedbackMessage(message: string, type: FeedbackType = 'BUG'): boolean {
  const len = message.trim().length;
  if (type === 'SURVEY_D0' && len === 0) return true;   // ← chỉ miễn trừ ĐÚNG ca rỗng
  return len >= FEEDBACK_MIN_LENGTH && len <= FEEDBACK_MAX_LENGTH;
}
```
`SurveyD0Sheet.tsx:81` dùng chính hàm này làm điều kiện bật nút gửi ở bước 6.

**Hệ quả:** user gõ **1 hoặc 2 ký tự** vào Q3 → `len = 1`, không rỗng nên không được miễn trừ, và `< FEEDBACK_MIN_LENGTH` → `false` → **nút gửi tắt, không một thông báo lỗi nào**. Form đứng im. Người dùng không hiểu vì sao và không có cách nào biết rằng phải **xoá** thứ vừa gõ mới gửi được.

Ai bị dính? Người gõ `"k"`, `"no"`, `"ok"`, `":)"` — tức là **những người ít nhiệt tình nhất, đúng nhóm mà bạn cần ý kiến nhất**. Người viết cả đoạn không bao giờ chạm vào lỗi này, nên nó sẽ không bao giờ lộ ra trong lúc bạn tự test.

**Sửa:** với type survey, coi input dưới ngưỡng là rỗng thay vì là không hợp lệ:
```ts
if (isSurveyType(type)) return len === 0 || len <= FEEDBACK_MAX_LENGTH;
```
rồi ở chỗ gửi, chuẩn hoá `q6.trim().length < FEEDBACK_MIN_LENGTH ? '' : q6.trim()`. Không bao giờ chặn user vì một field **không bắt buộc**.

**Kèm theo:** `'SURVEY_D0'` đang được kiểm bằng so sánh literal ở **hai** chỗ độc lập (`feedbackLogic.ts:24` và `:39`). Thêm `'SURVEY_UPDATE'` mà sót một chỗ thì hỏng im lặng. Thay bằng một tập dùng chung: `const SURVEY_TYPES = new Set<FeedbackType>([...])` + `isSurveyType()`. Một nguồn sự thật, không thể sót.

---

# Tổng kết

| # | Lỗi | Mức | Triệu chứng nếu bỏ qua |
|---|---|---|---|
| P0-1 | `pre_gate` gãy khi so version | 🔴 | 0 phiếu, không lỗi, debug nhầm chỗ |
| P0-2 | Sai thời điểm đo new-vs-existing | 🔴 | User mới ăn 2 survey; user cũ bị bỏ sót |
| P0-3 | Móc sai vị trí trong `useToday` | 🔴 | Bắn cho đúng nhóm phải loại trừ |
| P1-4 | Minor-jump vô hiệu ở release đầu | 🟠 | Hỏi câu vô nghĩa về patch cosmetic |
| P1-5 | `days_since_install` không tính được | 🟠 | Field rỗng hoặc code không viết nổi |
| P2-6 | Random hoá cả option thoát | 🟡 | Q2 lệch, hút phiếu sai |
| P2-7 | Ngưỡng dừng = tung đồng xu | 🟡 | Gỡ nhầm tính năng đang chạy tốt |
| P2-8 | Chồng modal với D0 | 🟡 | Hai modal đè nhau, hiếm |
| 🐞 | `validateFeedbackMessage` 1–2 ký tự | 🔴 | **Đang chạy production**, form đứng im |

**Ba lỗi P0 cộng lại thì tính năng không chạy chút nào mà không phát ra một lỗi nào** — kết cục tệ nhất có thể: bạn mất một chu kỳ phát hành và kết luận sai rằng user không muốn trả lời.

**Đánh giá lại tổng thể:** phần chống làm phiền (§4) và loại trừ tương hỗ (§3) vẫn đứng vững. Phần cơ chế phát hiện version (§2) sai ở tầng thiết kế, không phải tầng chi tiết — nó cần chuyển từ "đo lúc trigger" sang "chốt lúc boot", và đó là thay đổi kiến trúc chứ không phải sửa một dòng.

**Nếu chỉ sửa được một thứ:** làm P0-2 trước. P0-1 và P0-3 là lỗi cục bộ, sửa xong là xong. P0-2 thay đổi *thời điểm* toàn bộ hệ thống lấy mẫu — nếu để sau, hai cái kia phải viết lại.
