# Rank Mascot v2 — Implementation Plan

> Nguồn thiết kế đã chốt: `ui_kits/rank-mascot-concepts.html` (demo evolution, đã stress test ALL PASS)
> và `ui_kits/rank-top-variants.html` (bộ chọn 3 phương án — đã chốt **6C · 7C · 8A**).
> Đích: `habit-tracker/src/config/ranks.config.ts` + `habit-tracker/src/components/RankMascot.tsx`.

---

## 1. Phạm vi

| Hạng mục | Quyết định |
|---|---|
| Concept | **Nova** — thân sao 5 cánh, mỗi rank một motif riêng, không tay/không tóc |
| Top ranks | GOATED = **6C Vô Địch** (vương miện + nguyệt quế) · Final Boss = **7C Ác Đế** (vương miện gai + cape đỏ) · Ascended = **8A Sao Ánh Sáng** (2 lớp + lõi phát quang + halo) |
| Ngôn ngữ bậc thang | Thân **to dần** + cánh sao **sắc dần** + **pip băng độ hiếm** (tối đa 5) + glow tăng dần |
| Idle animation | 9 chữ ký riêng (bảng §4) — rank thấp nhanh/nhí nhố, rank cao chậm/nặng |
| Ambient FX | 9 hiệu ứng nền riêng (bảng §6) |
| Evolution | 4 phase chung + **reveal riêng từng rank đích** (bảng §5) |

**Nguyên tắc scale khi thêm rank mới**: size/sharpness/glow là hàm liên tục theo `tier`;
pip theo `band` (0–4, có thể mở band 5). Thêm rank = thêm entry config, không sửa engine.

---

## 2. Thay đổi schema `ranks.config.ts`

Giữ nguyên `Rank` hiện có, **thêm** các field:

```ts
export interface Rank {
  // ...các field hiện có (tier, name, nameVi, stars, color, edge, glow, face, anim, sfx, haptic)...

  band: 0 | 1 | 2 | 3 | 4;        // COMMON→MYTHIC, pip = band+1 (thay pip đếm bậc — không scale)
  geometry: {
    outer: number;                 // 26 + tier*1.5
    innerRatio: number;            // 0.62 - tier*0.028 (sắc dần)
    points?: number;               // mặc định 5
  };
  back?: SvgEl[];                  // vẽ SAU lưng thân (nguyệt quế, cape, tia hào quang)
  front?: SvgEl[];                 // vẽ TRƯỚC thân (vương miện, sparkle, charm)
  bodyStyle?: 'flat' | 'luminous'; // 8A dùng 'luminous' (2 lớp + gradient + lõi)
  reveal: RevealSpec;              // §5
  ambientFx: AmbientSpec;          // §6
}
```

`limbs` cũ: **bỏ** (design mới không có tay). Xoá `STAR_POINTS` cứng — sinh polygon từ `geometry`:

```ts
export function starPoints(cx:number, cy:number, g:Rank['geometry']): string {
  const pts:string[] = []; const n = g.points ?? 5;
  for (let k=0; k<n*2; k++) {
    const r = k%2===0 ? g.outer : g.outer*g.innerRatio;
    const a = -Math.PI/2 + k*Math.PI/n;
    pts.push(`${(cx+Math.cos(a)*r).toFixed(1)},${(cy+Math.sin(a)*r).toFixed(1)}`);
  }
  return pts.join(' ');
}
```

Toạ độ chuẩn: viewBox `0 0 120 120`, tâm thân `(60,62)`, pip row `y=112`.
SVG chi tiết từng tier (face/back/front): **copy nguyên từ hàm `conceptNova()` trong mockup** —
mọi path đã đúng toạ độ hệ này, chỉ cần chuyển sang mảng `SvgEl`.

### Bảng band

| Band | Pip | Nhãn | Màu pip | Tier hiện tại |
|---|---|---|---|---|
| 0 | 1 | COMMON | `#c8c2e0` | 0,1 |
| 1 | 2 | RARE | `#7ec0ff` | 2,3 |
| 2 | 3 | EPIC | `#d7a6ff` | 4,5 |
| 3 | 4 | LEGENDARY | `#ffdd6b` | 6,7 |
| 4 | 5 | MYTHIC | `#ff9ecb` | 8 |

---

## 3. Thay đổi `RankMascot.tsx`

Thứ tự render: `back → body → face → front → pips`.

1. **Gradient ID theo instance** (bug đã gặp ở mockup — nhiều instance cùng mount làm fill chết):
   ```ts
   const gid = useRef(`lum8_${Math.random().toString(36).slice(2)}`).current;
   ```
   Dùng cho `RadialGradient` của tier 8 (và mọi gradient sau này).
2. **Gigachad gồng từ chân**: RN không có transform-origin — bọc `Animated.View` và
   thêm cặp `translateY: +14` trước scale, `-14` sau (origin 74% của khung 120).
3. **Final Boss "đèn chớp tắt"**: RN không animate `brightness` — thêm 1 `Animated.View`
   overlay đen phủ đúng bounding mascot, animate `opacity` theo channel `darken` (§4).
4. `shouldRunRankLoop` (reduceMotion) giữ nguyên — mọi loop mới đều đi qua gate này.
5. Pips: render tĩnh trong SVG (không animate) — `band+1` hình thoi tại `y=112`, cách nhau 10px, tâm 60.

---

## 4. Idle animation — 9 chữ ký (map sang `anim.channels` hiện có)

Engine hiện tại đã hỗ trợ `translateX/Y, rotate, scale, scaleX/Y` (native driver). Thêm channel ảo `darken` (áp cho overlay riêng, không phải transform).

| Tier | Tên nhịp | Duration | Channels (keyframe chính) |
|---|---|---|---|
| 0 Delulu | lắc noodle nhẹ | 1900ms | rotate `-7→6→-5→7→-7`, scaleY `1→.96→1.05→1` |
| 1 Mewing | giữ dáng nghiêng | 2000ms | rotate `-9→-6→-9`, translateY `0→-2→0` |
| 2 Rizz | griddy | 550ms alternate | translateX `-3→3`, rotate `-6→6` |
| 3 Gigachad | gồng từ chân | 1700ms | scale `1→1.13,1.07 (giữ 35–55%)→.95→1.03→1` + translateY bù origin (§3.2) |
| 4 Aura Farmer | lơ lửng thở (KHÔNG xoay) | 2200ms | translateY `2→-5→2`, scale `1→1.04→1` |
| 5 Main Character | bồng bềnh sân khấu | 1800ms | translateY `2→-5→2`, rotate `-2→2→-2` |
| 6 GOATED | chào khán giả: nhảy 2 nhịp + cúi 7° | 2600ms | translateY `0→-11→0(-squash .93)→-5→0`, rotate `0…70%:7→84%:0` |
| 7 Final Boss | trỗi chậm + đèn chớp tắt | 3600ms | translateY `0→-5 (giữ)→-2→0`, scale `1→1.05→1.02→1`, rotate `-1→.5→1.5→-1`, **darken** `0→0 (40%)→.65 (50%)→0 (54%)→.55 (58%)→0 (63%)→.2 (82%)→0` |
| 8 Ascended | thiền bay | 3000ms | translateY `3→-6→3`, rotate `-1→1→-1`, scale `1→1.03→1` |

---

## 5. Evolution — `playEvolution(from, to)` (mở rộng `playRankUp`)

Component mới `RankEvolutionModal` (overlay full-screen, nền `rgba(8,5,20,.88)`).

### Phase chung (mọi rank)

| Phase | Thời lượng | Nội dung | Haptic/SFX |
|---|---|---|---|
| 1 Charge | 950ms | mascot cũ shake (±4px, 300ms/vòng) + glow tụ (`shadowRadius 0→90`, màu `from.glow`) | impact light lặp |
| 2 Whiteout | 900ms | toàn bộ fill/stroke → trắng (render lại body/face fill `#fff`), pulse scale `1↔1.12`, glow → trắng | — |
| 3 Flash + Swap | 450 + 230ms | flash trắng opacity .95; **đổi SVG sang rank mới khi đang trắng** | haptic heavy |
| 4 Reveal | 1200–1900ms | choreography riêng (bảng dưới) → confetti + banner độ hiếm | `playRankSound(to.tier)` |

Đóng modal sau reveal + 1500ms. **Dọn overlay khi đóng** (bug id trùng §3.1).

### Reveal riêng từng rank đích

| Đích | Choreography | Primitives RN |
|---|---|---|
| 1 Mewing | hít sâu nén khí (scaleY 1.22→scaleX 1.15) + 6 vệt gió lướt ngang | Animated scale + 6 View gradient translateX |
| 2 Rizz | sét ⚡ đánh 2 nhịp → hiện hình nhấp nháy → griddy trượt ±26px | opacity steps + translateX sequence |
| 3 Gigachad | rơi từ trên (-210px) đáp RẦM: squash `.82` + rung khung 7px + 2 vòng xung kích | translateY bounce + 2 Circle scale-fade |
| 4 Aura Farmer | xoáy vào `rotate -720°, scale .15→1` + 6 orb bung quỹ đạo xoắn | rotate+scale, 6 View translate polar |
| 5 Main Character | spotlight quét từ trái + từ silhouette đen bừng sáng + ✦ nổ | overlay đen opacity 1→0, beam View, 5 sparkle pop |
| 6 GOATED | nhảy vọt `+60→-26→0` (đăng quang) + 2 vòng vàng lan + mưa sao ★ ×9 | translateY spring + rings + star rain |
| 7 Final Boss | veil tối sập → trồi từ dưới (+130px, brightness .3→1) → 1 nhịp chấn động + tàn lửa ×6 | overlay opacity, translateY, shake 1 lần |
| 8 Ascended | bay lên êm + cột sáng vàng dọc + vòng vàng lan + ✦ rơi ×5 | translateY ease-out, beam View fade, ring |

Timing chuẩn từng reveal: lấy đúng số trong `REVEALS{}` của mockup.

---

## 6. Ambient FX (idle, chạy nền trong card rank)

Giới hạn hiệu năng: **≤ 7 phần tử/FX**, mọi loop qua `shouldRunRankLoop`.

| Tier | FX | RN implementation |
|---|---|---|
| 0 | 💜 tim bay lên ×5 | Animated translateY+opacity loop, stagger delay |
| 1 | vệt gió ngang ×4 | View 2px gradient, translateX loop |
| 2 | ⚡ chớp nhấp nháy ×4 | opacity steps() ≈ Animated.sequence delay |
| 3 | vòng sóng lực lan ×2 | Circle scale 36→150 + fade, lệch pha 750ms |
| 4 | 3 orb quỹ đạo | rotate interpolate quanh tâm r=58 (KHÔNG xoay thân) |
| 5 | spotlight đảo + ✦ ×4 | beam View rotate ±3°, sparkle scale-pulse |
| 6 | mưa sao vàng ★ ×6 | translateY -18→120 + rotate, random delay |
| 7 | tàn lửa tím ×6 + viền rung nhịp | ember views + `shadowOpacity` pulse (hoặc overlay inset) |
| 8 | vòng tia thánh xoay chậm 14s + ✦ rơi ×4 | conic thay bằng 8 tia Svg rotate loop chậm |

---

## 7. Pitfalls đã phát hiện (không lặp lại)

1. **Trùng gradient ID** giữa nhiều instance → mascot tàng hình. Fix: id theo instance (§3.1) + cleanup overlay.
2. **Pip đếm theo tier không scale** — dùng band (§2), thêm rank không phình pip.
3. **Xoay thân Aura Farmer** làm lệch trường hào quang — thân chỉ translateY/scale, chuyển động xoay giao cho orb.
4. **Scale quanh tâm với Gigachad** trông như trôi — cần origin thấp (§3.2).
5. **Delulu biên độ >±10°** gây khó chịu — giữ ≤ ±7°.
6. Native driver **không animate** `width/height/fill` — chỉ transform + opacity; brightness → overlay đen.
7. `skewX` không hỗ trợ native driver (đã ghi chú sẵn trong RankMascot) — không dùng.

---

## 8. Thứ tự PR đề xuất

1. **PR1 — Config & render tĩnh**: schema mới + 9 entry + RankMascot render back/body/face/front/pips (không animation mới). Snapshot test 9 tier.
2. **PR2 — Idle animations**: 9 channel set + overlay darken (tier 7) + origin fix (tier 3). Gate reduceMotion.
3. **PR3 — Ambient FX**: component `RankAmbientFx` theo bảng §6, budget phần tử, chỉ mount ở màn Rank chính.
4. **PR4 — Evolution modal**: 4 phase + 8 reveal + confetti + banner + sfx/haptic timing. Wire vào `useRank` khi tier tăng.
5. **PR5 — Polish**: locked silhouette (brightness .16 + glow + dấu ?), i18n string "X đã tiến hoá thành Y!", âm thanh mới nếu cần.

## 9. QA checklist (mirror stress test đã pass trên mockup)

- [ ] Mount 20+ RankMascot cùng lúc (gallery) — không mất fill, không trùng id.
- [ ] Spam nút rank-up khi đang evolution — bị chặn, `busy` reset đúng.
- [ ] Chạy evolution liên tiếp 0→8 — không leak timer/animation.
- [ ] Tier ngoài range (config tương lai) — clamp, không crash.
- [ ] reduceMotion ON — mọi loop tắt, evolution rút gọn còn flash + đổi hình.
- [ ] Dark/light mode — kiểm tra tier 8 (thân sáng) trên nền sáng: cần stroke `#C9A227` đủ đậm.
- [ ] Đo FPS màn Rank trên Android tầm trung (target ≥ 55fps với 1 mascot + ambient FX).

---

## Phụ lục A — Chi tiết timeline 4 phase chung (evolution)

| Bước | Mốc (ms) | Chi tiết |
|---|---|---|
| Charge | 0–950 | Mascot cũ: shake ±4px chu kỳ 300ms; glow nở `0 → blur 130px / spread 90px`, màu `from.glow` opacity .55 |
| Whiteout | 950–1850 | Toàn bộ fill+stroke → `#fff`; pulse scale `1 ↔ 1.12` chu kỳ 500ms; glow chuyển trắng `blur 170px / spread 120px` opacity .75 |
| Flash + Swap | 1850–2300 | Flash trắng full-screen opacity `0→.95→0` trong 450ms; **swap SVG sang rank mới tại đỉnh flash** (~+230ms) |
| Reveal | 2300+ | Choreography riêng (Phụ lục B); glow đổi về `to.glow` blur 120px trong 600ms |
| Kết | reveal xong | Confetti 70 mảnh (8×12px, dist 80–280px, rơi +300px, duration 1200–1700ms, easing `cubic-bezier(.2,.7,.3,1)`); banner độ hiếm: `translateY 24→0→-12`, `scale .6→1`, 1400ms; đóng modal sau +1500ms, **clear nội dung overlay** |

## Phụ lục B — Chi tiết 8 reveal (số liệu chuẩn để code)

**→1 Mewing** (done @1250ms): body scale `(.7,.7) → 45%:(.92,1.22) → 70%:(1.15,.85) → (1,1)` 900ms ease-in-out. Gió: 6 vệt tại top `25+k·10%`, width `0→120→40px`, translateX `-40→+190px`, 700ms, delay `350+k·60ms`.

**→2 Rizz** (done @1350ms): sét ⚡ tại top: translateY `-40→0`, scale `.6→1.2`, opacity `0→1(25%)→0(45%)→1(55%)→0`, 600ms. Body: opacity `0→1` + brightness `3→1.6→1` 500ms; griddy: translateX `0→-26(25%)→+26(50%)→-14(75%)→0` kèm rotate `∓8°`, 800ms, delay 450ms.

**→3 Gigachad** (done @1400ms): body translateY `-210→0` + scale `1.15→(55%)(1,.82)→(75%)(.96,1.06)→1`, opacity `.6→1`, 750ms `cubic-bezier(.3,.7,.4,1)`. @420ms: rung khung ±7px 240ms ×2 vòng; 2 vòng xung kích `40→300px` fade, 700ms, delay 0/160ms.

**→4 Aura Farmer** (done @1550ms): body rotate `-720°→0` + scale `.15→(70%)1.1→1`, opacity `0→1`, 950ms `cubic-bezier(.2,.9,.3,1)`. @650ms: 6 orb 9px góc `k·60°`, bay `0→(60%)95px→(100%)112px` lệch thêm +0.9rad, opacity `0→1→0`, 1000ms ease-out.

**→5 Main Character** (done @1650ms): spotlight translateX `-160%→-50%` + rotate `-14°→0`, opacity `0→1→.85`, 900ms giữ; body brightness `0 (giữ tới 50%) → (80%)1.35 + scale 1.06 → 1`, 1100ms; 5 sparkle ✦ vị trí random `20–80% / 15–70%`, scale `.4→1.3→.6`, 600ms, delay `800+k·120ms`; spotlight fade 400ms sau khi body sáng.

**→6 GOATED** (done @1800ms): body translateY `+60→(55%)-26→(78%)0` + scale `.8→1.08→(1,.95)→1`, opacity `.5→1`, 950ms `cubic-bezier(.3,1.2,.4,1)` (nhảy đăng quang). @780ms: 2 vòng vàng `#F4C842` `40→280px`, 750ms, delay 0/180ms. Mưa sao: 9 ★ (10–19px) từ top `-8%` rơi `+290px` + rotate 200°, duration `1200+rand·400ms`, delay `900+rand·300ms`.

**→7 Final Boss** (done @1800ms): veil `radial(transparent 32% → rgba(35,8,50,.8))` phủ; body translateY `+130→(70%)0` + scale `.86→1` + brightness `.3→.55→1`, opacity `0→1`, 1000ms ease-out. @1000ms: rung khung ±6px 260ms ×2 + 6 tàn lửa từ bottom 8% bay `-130px`, `900+rand·400ms`. Veil fade 450ms @1400ms.

**→8 Ascended** (done @1900ms): body translateY `+50→(70%)-10→-6` + scale `.92→1.02→1`, opacity `.5→1`, 1100ms ease-out giữ. Cột sáng dọc 120px gradient vàng `rgba(255,236,170,.4)→transparent`, opacity `0→1(40%)→0`, 1500ms. Vòng `#E0A93B` `50→300px`, 1100ms, delay 500ms. 5 tia ✦ từ top rơi `+260px` + rotate -150°, `1500+rand·600ms`, delay `300+rand·500ms`.

## Phụ lục C — Chi tiết ambient FX (thông số đầy đủ)

| Tier | Phần tử | Size | Duration | Delay | Quỹ đạo |
|---|---|---|---|---|---|
| 0 | 5 tim 💜 | 9–14px | 2.2–3.6s | 0–2.5s | bottom 18% bay lên -70px, scale .5→1.1, xoay -8°→10° |
| 1 | 4 vệt gió | w 26–46px, h 2px | 1.6–2.6s | 0–2s | translateX -60→+70px, opacity 0→.7→0 |
| 2 | 4 tia ⚡ | 10–15px | 1.1–2s | 0–1.6s | nhấp nháy steps: ẩn 72% chu kỳ, loé 76–86% |
| 3 | 2 vòng lực | 36→150px | 1.5s | lệch pha 750ms | nở từ tâm, opacity .85→0 |
| 4 | 3 orb | 7px | 2.8s/vòng | lệch pha -0.93s | quỹ đạo tròn bán kính 58px quanh tâm |
| 5 | beam + 4 ✦ | beam 70px | beam 3.2s; ✦ 1.4–2.4s | ✦ 0–2s | beam lắc ±3°; ✦ scale .5→1.15 twinkle |
| 6 | 6 sao ★ | 9–14px | 2–3.4s | 0–2.8s | rơi từ top -6% xuống +120px, xoay 200° |
| 7 | 6 ember + vignette | 5px | ember 1.6–2.8s; vignette 1.3s | 0–2.2s | ember bay -85px lệch +9px; vignette opacity .4↔.95 |
| 8 | vòng 8 tia + 4 ✦ | tia 210px | tia xoay 14s/vòng; ✦ 2.6–4s | ✦ 0–3s | ✦ rơi từ top xuống +110px xoay -160° |

---

*Files tham chiếu:*
- Demo evolution: `ui_kits/rank-mascot-concepts.html`
- Bộ chọn top-rank: `ui_kits/rank-top-variants.html`
- Engine hiện có: `habit-tracker/src/components/RankMascot.tsx`, `habit-tracker/src/config/ranks.config.ts`, `habit-tracker/src/audio/rankSound.ts`, `habit-tracker/src/lib/rankPresentation.ts`
