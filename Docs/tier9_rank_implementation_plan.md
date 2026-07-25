# Tier 9 Rank — Implementation Plan (sau Ascended, 2560⭐)

> Mock sống: `ui_kits/tier9-cosmic-concepts.html` · Config gốc: `habit-tracker/src/config/ranks.config.ts`
> Hướng đã chốt: **Cosmic/Void · giữ starPoints · tên Vi hài/slang · cute-flat on-brand (cosmic = accent)**

---

## 0. Bối cảnh & ràng buộc kỹ thuật

| Mục | Giá trị | Nguồn |
|---|---|---|
| Threshold | **2560⭐** — tự đúng, `getRankThreshold` đã tính `320 · 2^(order−7)` | `ranks.config.ts:353` |
| Geometry (auto) | `outer: 26 + 9·1.5 = 39.5` · `innerRatio: 0.62 − 9·0.028 = 0.368` (gai nhất hệ) | công thức map cuối file |
| Band | cap tại 4 (`Math.min(4, floor(9/2))`) — không cần sửa | map cuối file |
| Renderer | `RankMascot.tsx` hỗ trợ sẵn `geometry.points` tuỳ biến + `bodyStyle: 'flat' \| 'luminous'` | tier 8 dùng luminous |
| Việc cần làm | **Chỉ thêm 1 entry `RANK_DATA` + entry `FRONT[9]`/`BACK[9]` + sfx + test** | không sửa renderer (cả 3 mock đều flat) |

---

## 1. Ba concept

### MOCK A · **Cosmic** — Vi: *Ngoài Vùng Phủ Sóng* — descriptor: `left the chat`

**Ý tưởng:** Tiến hoá trực tiếp từ Ascended: halo (vòng nhỏ trên đầu) → **vành planet bao quanh cả thân** + moon nhỏ quay quanh. Em sao đã "rời khỏi cuộc trò chuyện", trôi vô trọng lực ngoài vũ trụ.

**Design spec**

| Token | Giá trị |
|---|---|
| `color` | `#5B4BC4` (indigo đậm — tách khỏi tier 1 `#818CF8` và tier 7 `#6D28D9`) |
| `edge` | `#2E2378` |
| `glow` / `glowOpacity` | `#A78BFA` / `0.55` |
| `bodyStyle` | `flat` |

- **BACK:** ellipse vành planet `rx 54 / ry 15`, xoay `−16°`, stroke `#C4B5FD` w2.4 op .5; moon `r 3.6` fill `#F9A8D4` (renderer tĩnh — mock có spin 18s, app để tĩnh hoặc thêm sau).
- **FRONT:** cung trước của vành `M-49,7 Q0,25 49,7` stroke `#C4B5FD` w2.4 (đè lên thân → hiệu ứng vành xuyên qua); 2 sparkle 4 cánh (trắng tại `22,−34`, tím `−27,14`… kiểu path C-curve như FRONT[2]/FRONT[3] hiện có).
- **FACE (stroke `#2A2540`):** mắt nhắm cong hạnh phúc `M-10,-5 q3,3 6,0` + mirror; má hồng `#F9A8D4` r2.2 tại `±11,1`; miệng mỉm `M-5,5 q5,4 10,0`.
- **Ambient FX (mock/celebration):** 5 twinkle ✦ tím nhạt toạ độ cố định quanh tâm, nhấp nháy lệch pha.

**Animation — RankAnim (paste-ready)**

```ts
anim: { duration: 3200, loop: true, channels: {
  translateY: [[0, 3], [0.5, -6], [1, 3]],
  rotate:     [[0, -3], [0.5, 3], [1, -3]],
  scale:      [[0, 1], [0.5, 1.02], [1, 1]],
}}
```

Cảm giác: **trôi vô trọng lực** — chu kỳ 3.2s chậm hơn mọi tier trừ Final Boss; lên 9px kết hợp nghiêng ±3° liên tục, không có điểm "đáp đất". Đối lập chủ đích với bounce có nhịp của tier 8.

---

### MOCK B · **Singularity** — Vi: *Gánh Cả Vũ Trụ* — descriptor: `event horizon`

**Ý tưởng:** Hố đen dễ thương: thân tím thẫm gần đen, **viền vàng-cam = chân trời sự kiện**, hạt sáng bị hút xoáy vào tâm. Trầm tĩnh, nặng, tự tin — "vượt qua thần thánh" bằng tương phản trắng→đen với Ascended.

**Design spec**

| Token | Giá trị |
|---|---|
| `color` | `#1E1436` |
| `edge` | `#FFB347` (`sw 3` — renderer hardcode `tier >= 6 ? 3 : 2.4`, không tuỳ chỉnh được per-rank) |
| `glow` / `glowOpacity` | `#FF8C42` / `0.5` |
| `bodyStyle` | `flat` |

- **BACK:** 2 cung accretion: `M0,-50 A50,50 0 0 1 47,17` stroke `#FF8C42` w2.2 op .5 và cung đối xứng nhỏ hơn `#FFB347` w1.5 op .35 (mock quay ngược 11s; app tĩnh).
- **FRONT:** 1 sparkle xoáy `#FFB347` tại `24,−26` (path 4 cánh cong).
- **FACE (stroke `#FFE8C2` — nền tối, cùng logic tier 7 dùng accent sáng):** mày xếch tự tin `M-13,-8 l8,2.5` + mirror (Gigachad-lite); mắt cong cute `M-11,-1 q3,3 6,0` + mirror; má `#FF8C42` op .55 r2.2 tại `±13,4`; miệng smirk `M-5,6 q5,4 11,-1`.
- **Ambient FX:** 6 hạt cam xoáy **vào** tâm (rotate 420° + translateX 96→6px, scale 1→0.2), lệch pha 0.7s.

**Animation — RankAnim (paste-ready)**

```ts
anim: { duration: 4200, loop: true, channels: {
  scale:      [[0, 1], [0.45, 0.96], [0.7, 1.05], [0.85, 1.01], [1, 1]],
  rotate:     [[0, 0], [0.45, -1], [0.7, 0.5], [1, 0]],
  translateY: [[0, 1], [0.7, -2], [1, 1]],
}}
```

Cảm giác: **nhịp thở trọng lực** — 4.2s chậm nhất toàn hệ; nén 4% (hút vào) rồi nở 5% (giải phóng), xoay <1° gần như không nhận ra. Càng cao rank càng ít cử động = càng quyền lực.

---

### MOCK C · **Supernova** — Vi: *Cháy Hết Nấc* — descriptor: `went nova`

**Ý tưởng:** Vụ nổ sao dễ thương: **8 cánh** (duy nhất toàn hệ), lõi vàng ấm, mắt sparkle, shockwave lan từ tâm. Năng lượng cao nhất — hợp moment celebration.

**Design spec**

| Token | Giá trị |
|---|---|
| `color` | `#FFD166` (ấm hơn GOATED `#F4C842` để tách vibe) |
| `edge` | `#FF6B4A` (đỏ-cam — GOATED viền nâu `#A87B12`) |
| `glow` / `glowOpacity` | `#FFE066` / `0.55` |
| `geometry` override | `{ points: 8, innerRatio: 0.52 }` (renderer hỗ trợ sẵn `points`) |
| `bodyStyle` | `flat` |

- **BACK:** 4 tia tam giác nhỏ `#FFE066` tại 4 hướng chính, bán kính 58 (mock quay 16s; app tĩnh).
- **FRONT:** không cần — mặt đã đủ chi tiết.
- **FACE (stroke/fill `#2A2540`):** mắt = 2 sparkle 4 cánh (path C-curve như FRONT[2] thu nhỏ) tại `±11,−3.5`; má `#FF6B4A` op .45 r2.6 tại `±18,6`; miệng cười rộng `M-7,6 q7,7 14,0` + 2 răng thò trắng `M-3.5,8.5 l1.4,3 l1.4,-3` ×2 (mượn DNA Final Boss).
- **Ambient FX:** shockwave ring `#FFE066` nở 60→200px sync với nhịp "bung" của anim (delay khớp offset 0.58 ≈ 1.4s), 2 ring lệch pha.

**Animation — RankAnim (paste-ready)**

```ts
anim: { duration: 2400, loop: true, channels: {
  scale:      [[0, 1], [0.55, 0.92], [0.66, 1.12], [0.78, 1], [0.88, 1.05], [1, 1]],
  rotate:     [[0, 0], [0.55, -2], [0.66, 1], [1, 0]],
  translateY: [[0, 0], [0.66, -3], [1, 0]],
}}
```

Cảm giác: **nhịp tim nén→bung** — im 55% chu kỳ, nén nhanh 8% rồi bung 12% trong 0.26s, dư chấn nhỏ 5% rồi lặng. Shockwave FX bắn đúng frame bung (offset 0.66).

---

## 2. So sánh & khuyến nghị

| Tiêu chí | A · Cosmic | B · Singularity | C · Supernova |
|---|---|---|---|
| Tương phản với Ascended | Trung bình (cùng họ tím) | **Cao nhất** (trắng→đen, nhẹ→nặng) | Trung bình (cùng họ vàng ấm) |
| Rủi ro trùng vibe | tier 1/7 (tím) | không | GOATED (vàng) — đã giảm bằng edge đỏ-cam |
| Chi phí code | thấp | thấp | thấp (+1 dòng geometry override) |
| Đọc ở 24px | tốt (vành planet rõ) | tốt (viền sáng nổi) | khá (8 cánh hơi dày nét nhỏ) |

**Khuyến nghị: B (Singularity)** — logic thăng tiến mạnh nhất: god-mode trắng-vàng → nuốt cả ánh sáng. A là lựa chọn an toàn nếu muốn liền mạch thị giác với tier 8.

> **✅ Update 2026-07-18 (ring dust):** thêm `COSMIC_DUST` — 3 hạt bụi `#C4B5FD` (đường kính 3.2 unit, opacity 0.8) chạy cùng ellipse với moon nhưng chu kỳ **14s** (moon 9s) tạo chiều sâu parallax; lệch pha bằng cách xoay mảng sample (offsets 4/13/19 trên 24 bước — không cần thêm Animated.Value per-hạt ngoài 1 driver chung), cùng cơ chế front/back swap. Mock HTML đồng pha qua `begin` âm (−2.33/−7.58/−11.08s). Verified: rotation seamless (rot[0]==rot[24]) và front-flag đồng bộ toạ độ ở cả 3 pha.
>
> **✅ Update 2026-07-18 (orbit):** moon giờ **chạy quỹ đạo thật** quanh thân — `RankMascot.tsx` thêm `COSMIC_ORBIT` (24 điểm sample trên ellipse nghiêng −16°, chu kỳ 9s, native driver): moon render 2 lớp overlay, **đi trước thân ở nửa gần (dưới) và khuất sau thân ở nửa xa (trên)** qua opacity swap; tôn trọng `reduceMotion`/`shouldRunRankLoop` (tĩnh tại t=0 khi tắt). Moon bỏ khỏi `BACK[9]` config (chỉ còn ring path) — test đã cập nhật. Mock HTML dùng SMIL `animateMotion` cùng path, cùng hành vi. Verified: điểm t=0 trùng đầu ring path, extent 58.2 ≤ 60, front-half đúng nửa gần.
>
> **✅ ĐÃ CHỐT & IMPLEMENT: Mock A (Cosmic)** — 2026-07-18. Code trước đó lỡ implement Mock B; đã swap toàn bộ B→A tại: `ranks.config.ts` (entry tier 9 + BACK[9] planet-ring qua arc path vì SvgEl không có transform + FRONT[9]), `i18n.ts` (4 map), `RankAmbientFx.tsx` (bỏ nhánh infall riêng tier 9 → dùng twinkle ✦ mặc định, đúng spec A), `migrations.ts` (v22 sửa tên cho fresh install + **v23 mới** rename `Singularity`→`Cosmic` cho DB đã chạy v22 cũ), `ranks.config.test.ts` (names/colors/sfx/snapshot). Verify: 18/18 assertion PASS chạy trực tiếp từ config (kể cả extent ≤ 60, worst 54.0).

---

## 3. Các bước triển khai (sau khi chốt mock)

1. `ranks.config.ts`: thêm entry tier 9 vào `RANK_DATA` (name/nameVi/stars 2560/descriptor/color/edge/glow/face/anim/sfx/haptic `heavy-success`) + `FRONT[9]`, `BACK[9]`; mock C thêm geometry override trong map cuối file.
2. Sfx: thêm asset + key mới vào `uiSounds.ts` (`cosmic` / `singularity` / `supernova`).
3. i18n: label rank trong `i18n.ts` (nếu rank names có key riêng ngoài config).
4. Kiểm tra `RankScreen` / `RankInfoSheet` / `LevelUpCelebrationModal`: các chỗ hardcode "rank cuối" (kiểu `RANKS.length - 1`, thông báo "đã tiến hoá tối đa") — cập nhật tier 9 thành đỉnh mới.
5. Test: cập nhật `ranks.config.test.ts` (threshold 2560, tier count 10) + `rankCelebrationBehavior.test.ts`.
6. Verify: chạy test suite + xem mascot ở cả RankScreen (lớn) và Today (nhỏ) để soát khả năng đọc ở size bé.

**Rủi ro cần soát trước khi merge:** migration/Supabase có bảng nào lưu max tier không (`017_publish_*.sql` từng đụng rank); `rankMascotBridge.ts` có switch-case theo tier không.

---

## 4. Kết quả stress-test fidelity (mock vs renderer thật)

Đối chiếu mock với `RankMascot.tsx` + mô phỏng số học 1000 điểm/channel. Các điểm lệch đã phát hiện và **đã sửa trong mock v2.1**:

| # | Lệch | Chi tiết | Fix |
|---|---|---|---|
| 1 | Easing | App dùng RN `p.interpolate` + `Easing.linear` = nội suy **tuyến tính thuần**; mock cũ dùng ease-in-out → lệch tối đa **1.09px / 0.73°** (mock A, t=0.38) | Mock chuyển sang linear — giờ khớp từng frame |
| 2 | viewBox | App: `-60 -60 120 120`, RN Svg **có clip**; mock cũ `-70` + overflow visible → che giấu nguy cơ cắt hình | Mock về −60..60; verify mọi element extent ≤ 58 → không clip |
| 3 | Body strokeWidth | Renderer hardcode `tier >= 6 ? 3 : 2.4` — mock B dùng 3.4 là **không đạt được** | Mock B → sw 3; plan đã sửa |
| 4 | Band pips | App luôn vẽ `band+1` pip dưới chân (tier 9: 5 pip hồng `#FF9ECB`, y 47.8–54.2) — mock thiếu | Đã thêm vào cả 4 card |
| 5 | Ascended ref | App render luminous (gradient trắng→`#F0D084` + aura polygon + core trắng), mock cũ vẽ flat | Ref render đúng luminous |
| 6 | FX sync (C) | Shockwave xuất hiện tại 0.58 nhưng frame "bung" ở 0.66 → lệch ~190ms | CSS sync về 0.66 |
| 7 | BACK động | Mock cũ có spin (animateTransform) — app render BACK **tĩnh** | Mock chuyển tĩnh; nếu muốn spin trong app phải thêm feature riêng |

Đã verify khớp: geometry (39.5 / 0.368 đúng công thức), threshold 2560 qua `getRankThreshold`, `geometry.points` 8 renderer hỗ trợ, transform order (translate→rotate→scale) trùng app, skewX không dùng (app skip channel này).
