# Habi — Spec: Survey bật sau khi cập nhật (user cũ)

**Trạng thái đã có:** survey D0 (`SurveyD0Sheet` + `pendingSurveyD0` + `useSurveyD0Intent`) đã ship và chạy. Spec này là trigger **thứ hai**, độc lập, cho user CŨ sau khi họ cập nhật lên bản mới.

**Chốt từ bạn:** hai survey tách biệt · bắn sau lần log đầu tiên hậu update · patch tới là bug/UI vặt hoặc chưa chốt.

---

## 0. ⚠️ Đọc trước — phản biện về chính cái trigger này

**Với patch chỉ sửa bug/UI vặt, câu "bản mới thế nào?" là câu hỏi không trả lời được.** User không cảm nhận được thay đổi cosmetic; Q1 sẽ về gần như toàn bộ "không khác gì" và bạn tốn một lần làm phiền để thu 0 bit thông tin.

**Cân nhắc trigger thay thế: "quay lại sau ≥3 ngày vắng".** Nó chạm gần đúng nhóm người đó (user cũ còn sống), nhưng câu hỏi kèm theo *trả lời được*: "điều gì khiến bạn quay lại / vì sao bạn vắng". Version-gate chỉ thực sự đáng khi patch có thứ user **nhìn thấy được**.

**Nếu vẫn làm version-gate** (hợp lý nếu bạn muốn hạ tầng sẵn cho các patch feature sau), thì spec dưới đây thiết kế để **Q1 là câu phụ, Q2 + Q3 mới là phần mang giá trị** — và chúng không phụ thuộc vào nội dung patch. Đó là cách duy nhất để trigger này không lãng phí trong trường hợp patch cosmetic.

**Kích thước mẫu thực tế:** 27 organic · 0 đạt D7 · 10/13 log đúng 1 ngày rồi biến. Số người vừa còn cài app, vừa cập nhật, vừa mở lại, vừa log = **ước lượng 2–5 người**. Đừng kỳ vọng phân tích; kỳ vọng 2–5 đoạn văn của Q3. Toàn bộ giá trị nằm ở đó.

---

## 1. PREREQ — sửa `APP_VERSION` trước, không thể bỏ qua

`src/api/feedbackService.ts:15`
```ts
const APP_VERSION = '1.1.0.0';   // app.json đang là "2.0.1.5"
```

Lệch 1 major version, comment ngay trên nó ghi "Keep in sync with app.json" — bằng chứng sống rằng hằng số chép tay **sẽ** trôi. Version-gate dựng trên hằng số này thì cổng sai từ ngày đầu, và mọi feedback row hiện có trong DB đang mang version sai.

**Nguồn version phải là runtime, không phải hằng số.** Ba lựa chọn:

| Cách | Đọc ra cái gì | Đánh giá |
|---|---|---|
| `expo-application.nativeApplicationVersion` | Version của **binary đã cài** | ✅ Đúng ngữ nghĩa cho update qua Play Store. Cần dep mới + build mới. |
| `expo-constants` → `Constants.expoConfig.version` | Version trong **bundle JS** | Đúng hơn nếu sau này bạn đẩy OTA qua EAS Update. |
| Hằng số chép tay | Bất kỳ thứ gì bạn quên sửa | ❌ Đã chứng minh là hỏng. |

**Khuyến nghị: `expo-application`**, và dùng luôn nó cho `APP_VERSION` để sửa cả hai chỗ trong một lần.

**Bắt buộc dùng lại pattern guard của `SettingsContext.tsx:58–73`** — kiểm tra `NativeModules.ExpoApplication` tồn tại *trước khi* `require('expo-application')`. Lý do đã ghi trong comment ở file đó: bundle JS mới chạy trên binary native cũ (Metro fast-refresh, hoặc OTA thật) sẽ làm `requireNativeModule()` **crash cả app**, không phải throw bắt được. Cùng lớp lỗi, cùng cách chặn.

Fallback khi module vắng mặt: coi như **không xác định được version → không bắn survey**. Fail closed. Fail open ở đây nghĩa là spam form cho người dùng bản cũ.

---

## 2. Cái bẫy nguy hiểm nhất: cold-start không phân biệt được "vừa update" với "cài mới"

Lần đầu build mới chạy, `habi_last_seen_version` = `null`. Ở trạng thái đó **user mới tinh và user vừa cập nhật trông y hệt nhau**. Nếu coi `null` = "vừa update", mọi người cài mới sẽ ăn cả survey update lẫn survey D0.

**Bộ phân biệt đã có sẵn trong code: khoá `habit_tracker_onboarded`.**

```
đọc lastSeen = habi_last_seen_version
đọc onboarded = habit_tracker_onboarded

lastSeen === null  &&  onboarded !== null  → user CŨ, binary trước không có gate
                                              ghi lastSeen = 'pre_gate'
                                              → ĐỦ ĐIỀU KIỆN bắn (một lần duy nhất)

lastSeen === null  &&  onboarded === null  → user MỚI
                                              ghi lastSeen = versionHiệnTại
                                              → KHÔNG BAO GIỜ bắn update survey
                                              → để survey D0 lo

lastSeen !== null  &&  lastSeen !== hiệnTại → vừa cập nhật thật
                                              → ĐỦ ĐIỀU KIỆN bắn

lastSeen === hiệnTại                        → không có gì xảy ra
```

**Thời điểm ghi `habi_last_seen_version` = hiện tại:** khi sheet **hiện ra**, hoặc khi đã xác định là không đủ điều kiện bắn. **Không phải lúc submit** — cùng lý do đã áp cho `markSurveyD0Shown()`: đóng form ≠ chưa được hỏi.

---

## 3. Loại trừ tương hỗ với survey D0 — phải cứng

Một user không bao giờ được thấy cả hai. Kiểm tra theo đúng thứ tự này, dừng ở điều kiện đầu tiên đúng:

```
1. readSurveyD0Pending() === true          → HOÃN update survey (D0 ưu tiên tuyệt đối)
2. habi_survey_d0_v1 === null && onboarded === null  → user mới → không bắn
3. đang có pendingLevelUp / pendingStreakMilestone   → hoãn (đã là pattern ở TodayScreen:263)
4. cooldown toàn cục chưa hết               → không bắn
5. còn lại                                  → bắn
```

Điều kiện 3 đã tồn tại trong `TodayScreen.tsx:263` cho D0 — dùng lại y nguyên. Chồng modal lên màn hình lên cấp là cách nhanh nhất biến một khoảnh khắc thưởng thành phiền toái.

---

## 4. Chống làm phiền — phần dễ bị bỏ qua nhất

Version-gate không có chống lặp = **mỗi patch một cái form**. Với app đang có 0 người đạt D7, đó là cách tự tay giết nốt vài user còn lại.

| Luật | Giá trị | Lý do |
|---|---|---|
| Cooldown toàn cục giữa mọi loại survey | **30 ngày** | Khoá dùng chung `habi_survey_last_shown_at`, D0 cũng ghi vào |
| Tối đa số lần bắn update survey / user | **3 lần trọn đời** | Sau 3 lần mà user vẫn không nói gì, họ sẽ không nói |
| Chỉ bắn khi bước nhảy version đủ lớn | **minor trở lên** | `2.0.1.5 → 2.0.1.6` là patch — không hỏi. `2.0.x → 2.1.x` mới hỏi |
| Nút bỏ qua | **bắt buộc, hiện ngay** | Modal chặn ngay sau khi log = mất user |

Luật thứ 3 quan trọng nhất và cần **so sánh version có cấu trúc**, không phải so chuỗi. `'2.0.1.10' > '2.0.1.9'` sai khi so chuỗi. Parse thành mảng số rồi so từng phần.

---

## 5. Bộ câu hỏi — 2 MCQ + 1 câu mở

Ngắn có chủ đích. User cũ đang bị cắt ngang giữa lúc dùng app, không phải người mới đang trong tâm thế khám phá.

### Q1 — Cảm nhận về bản mới *(câu phụ, thấp kỳ vọng)*

| | EN | VI |
|---|---|---|
| **Câu hỏi** | You're on a new version of Habi. Notice any difference? | Bạn đang dùng bản Habi mới. Có thấy khác gì không? |
| A | Yes — it's better | Có, tốt hơn |
| B | Yes — but something got worse | Có, nhưng có chỗ tệ đi |
| C | Feels the same to me | Với tôi thì như cũ |
| D | Haven't noticed anything | Chưa để ý thấy gì |

*Single select · bắt buộc*

Với patch cosmetic, C+D sẽ chiếm gần hết. **Đó là kết quả đúng, không phải thất bại** — nó nói rằng patch không đáng để thông báo cho user. Nếu B xuất hiện dù chỉ 1 lần, đọc ngay Q3 của người đó: bạn vừa làm hồi quy một thứ gì đó.

### Q2 — Rào cản dùng đều đặn ⭐ *(câu mang giá trị chính)*

Đây là câu hỏi churn hỏi người **vẫn còn sống** — cách gần nhất bạn tới được câu "vì sao người ta bỏ", vì người đã bỏ thì không có ở đây để trả lời.

| | EN | VI |
|---|---|---|
| **Câu hỏi** | What most gets in the way of using Habi regularly? | Điều gì cản trở bạn dùng Habi đều đặn nhất? |
| A | I forget — nothing reminds me | Tôi quên mất, không có gì nhắc |
| B | Logging takes too much effort | Ghi nhận mất công quá |
| C | I can't see my own progress clearly | Tôi không thấy rõ tiến bộ của mình |
| D | I lost interest / motivation | Tôi hết hứng thú |
| E | Bugs, slowness, or something broke | Lỗi, chậm, hoặc có gì đó hỏng |
| F | Nothing — I use it regularly | Không có gì, tôi vẫn dùng đều |

*Single select · bắt buộc · **random hoá thứ tự option** (dùng lại hàm `shuffled()` đã có trong `SurveyD0Sheet.tsx:26`)*

Ép chọn MỘT là cố ý. Multi-select ở đây cho ra "mọi thứ đều hơi vướng" — vô dụng cho việc ưu tiên.

### Q3 — Câu mở ⭐ *(nguồn thông tin thật sự duy nhất ở n=2–5)*

| | EN | VI |
|---|---|---|
| **Câu hỏi** | If Habi disappeared tomorrow, what would you miss? If nothing, say so — that's useful too. | Nếu mai Habi biến mất, bạn sẽ tiếc điều gì? Nếu không tiếc gì, cứ nói thẳng — điều đó cũng có ích. |
| Placeholder | One line is enough. | Một dòng cũng đủ. |

*Free text · **không bắt buộc** · min 3 ký tự nếu có nhập · max 2000*

Đây là biến thể đảo của câu hỏi Sean Ellis. "Bạn có góp ý gì không?" cho ra sự lịch sự; "bạn sẽ tiếc gì?" buộc user phải nêu ra giá trị cụ thể — hoặc thừa nhận là không có, và **câu trả lời "không tiếc gì" là dữ liệu đắt nhất bạn có thể thu được lúc này**.

---

## 6. Lưu trữ

Dùng lại nguyên hạ tầng D0 — cùng bảng `feedback`, cùng cột `answers` jsonb, cùng Edge Function.

```jsonc
{
  "survey": "update_v1",
  "q1_version_impression": "C",
  "q2_blocker": "A",
  "from_version": "2.0.1.5",   // hoặc "pre_gate"
  "to_version": "2.1.0.0",
  "locale": "en-PK",
  "device_lang": "en",
  "app_lang": "en",
  "days_since_install": 23     // từ activity_log/onboarded, không hỏi user
}
```

`type` gửi lên: thêm `'SURVEY_UPDATE'` vào union `FeedbackType` trong `src/utils/feedbackLogic.ts`.

⚠️ **Kiểm tra lại `validateFeedbackMessage()`.** Với D0 bạn đã phải xử lý ca message rỗng. Q3 ở đây cũng không bắt buộc → **cùng lỗi sẽ tái phát nếu `SURVEY_UPDATE` không được miễn trừ giống `SURVEY_D0`**. Cùng lý do, cùng chỗ, dễ quên vì lần trước đã sửa rồi.

⚠️ **Edge Function `feedback-submit` phải whitelist `SURVEY_UPDATE`** trong danh sách type hợp lệ. Nếu nó validate type theo enum cứng, phiếu bị từ chối và bạn không thấy lỗi nào ở client ngoài `'FAILED'`.

⚠️ **Miễn trừ cooldown 60 giây** (`FEEDBACK_COOLDOWN_MS`) cho `SURVEY_UPDATE`, cả client lẫn server — giống D0.

---

## 7. Checklist triển khai

**Prereq**
- [ ] Thêm `expo-application` vào deps
- [ ] Viết `src/utils/versionLogic.ts`: `parseVersion()`, `compareVersions()`, `isMinorOrGreaterJump()` — thuần, không import RN, unit-test được (cùng quy ước với `feedbackLogic.ts` / `localeLogic.ts`)
- [ ] Viết `getRuntimeAppVersion()` với guard `NativeModules.ExpoApplication`, fallback trả `null`
- [ ] **Sửa `feedbackService.ts:15`** dùng `getRuntimeAppVersion()`, bỏ hằng số `'1.1.0.0'`
- [ ] Build native mới (dep mới → OTA không đủ)

**Gate**
- [ ] `src/game/pendingSurveyUpdate.ts` — mirror `pendingSurveyD0.ts`; khoá: `habi_last_seen_version`, `habi_survey_update_count`, `habi_survey_last_shown_at`
- [ ] Logic cold-start theo §2 (dùng `habit_tracker_onboarded` để phân biệt)
- [ ] Ghi `habi_survey_last_shown_at` vào **cả** đường D0 (sửa `markSurveyD0Shown()`) để cooldown 30 ngày thật sự dùng chung
- [ ] Loại trừ tương hỗ theo đúng thứ tự §3

**Trigger**
- [ ] `notifyFirstLogAfterUpdate()` trong `useSurveyD0Intent.ts` — **notifier riêng**, không dùng lại `notifyFirstEverLog` (điều kiện khác hẳn: "log đầu sau update" ≠ "log đầu đời")
- [ ] Móc vào `src/queries/useToday.ts` cạnh dòng 509
- [ ] Subscribe trong `TodayScreen`, dùng lại chốt chặn `pendingLevelUp / pendingStreakMilestone` ở dòng 263
- [ ] Delay 800ms sau animation ghi nhận

**UI + i18n**
- [ ] `SurveyUpdateSheet.tsx` — copy cấu trúc `SurveyD0Sheet.tsx`, `TOTAL_STEPS = 3`
- [ ] Nút bỏ qua hiện ngay từ bước 1
- [ ] Thêm key vào **cả hai** block `vi` và `en` của `src/config/i18n.ts`
- [ ] Dùng lại `shuffled()` cho Q2

**Backend**
- [ ] `FeedbackType` += `'SURVEY_UPDATE'`
- [ ] Miễn trừ `validateFeedbackMessage()` + `FEEDBACK_COOLDOWN_MS`
- [ ] Whitelist type + field `answers` trong Edge Function
- [ ] Verify end-to-end: submit thật, query lại `feedback` xem `answers` có nằm trong DB không (**đây là bước hay bị bỏ và là chỗ hỏng ngầm phổ biến nhất**)

**Test thủ công — 4 ca bắt buộc**
- [ ] Cài mới hoàn toàn → chỉ thấy D0, **không** thấy update survey
- [ ] User cũ (`onboarded` có, `habi_last_seen_version` null) → thấy update survey đúng 1 lần
- [ ] Mở lại app lần 2, 3 → **không** thấy lại
- [ ] Bump version lần nữa trong vòng 30 ngày → **không** bắn (cooldown)

---

## 8. Tiêu chí dừng

Nếu sau **2 chu kỳ patch** mà tổng số phiếu update survey < 5: trigger này không đủ mẫu để tồn tại. Gỡ nó, và chuyển ngân sách sang phỏng vấn trực tiếp 3 người qua email từ bảng `feedback`. Ở quy mô này, một cuộc chat 10 phút thắng mọi survey.
