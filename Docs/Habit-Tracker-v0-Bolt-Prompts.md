# Habit Tracker +1% — Bộ Prompt v0 / Bolt

> Dán từng block trong file này vào v0.dev hoặc bolt.new để sinh code. Phần **Master Prompt** ở đầu là context bắt buộc — gửi nó TRƯỚC mỗi component prompt (hoặc dán cùng) để công cụ AI hiểu design system.
>
> **Stack mục tiêu:** React Native + NativeWind + TypeScript (theo CLAUDE.md). Nếu dùng v0 (web React + Tailwind), thay `View/Text/Pressable` → `div/span/button` và bỏ import từ `react-native`; tokens Tailwind giữ nguyên.

---

## 0. Master Prompt (gửi kèm mỗi component)

```
Bối cảnh: tôi đang xây "Habit Tracker +1%" — habit tracker tối giản, mindful, zero FOMO.
Stack: React Native + NativeWind + TypeScript. Atomic Design (Atoms · Molecules · Organisms).
Quy ước:
- Style 100% qua `className` (NativeWind), KHÔNG dùng StyleSheet trừ khi bắt buộc.
- Hỗ trợ Dark Mode qua `dark:` variant. Không hardcode màu hex trong component.
- Mọi component export named + default.
- Props khai báo TypeScript interface đầy đủ.
- Tự xử lý 5 trạng thái cơ bản: default · pressed (active:) · focus · disabled · (loading nếu có).
- Accessibility: thêm role và labels khi cần.

Design tokens (đã có sẵn trong tailwind.config.js):
- Sage scale: sage-50..900 (primary = sage-500 #2E9C6A; sage-400 cho dark)
- Semantic: bg, surface{,-alt}, ink{,-2,-muted,-faint}, line{,-2}, primary{,-soft,-ink,-hover,-press}, star{,-soft}, danger{,-soft}, warning
- Mọi token có biến thể -dark (vd surface-dark, ink-dark-muted)
- Radius tokens: xs(6) sm(10) md(14) lg(18) xl(22) 2xl(26) pill(999)
- Font sizes preset: display 22/800, title 18/700, body 14, caption 12/600, micro 11/700

Luật miền (rules engine — đã chốt 25/05/2026):
- Điểm: 1 việc = 1 điểm; nếu duration > 30 phút thì Điểm = floor(min/30).
- Sao: +1 mỗi việc tốt; +1 thưởng streak khi Điểm/ngày ≥ 50; thói xấu = −50 Sao (cho phép âm).
- Sao tuần → Rank; reset Thứ Hai 00:00 nhưng RETAIN — Sao tuần đặt về ngưỡng sàn của hạng đã đạt, không về 0.
- Quỹ thưởng: vượt mốc 5/10/20/40/80/160 ★ trong tuần → cộng dồn ₫ = (Sao mốc × 1.000). Vượt nhiều mốc/tuần thì stack hết.

Hãy sinh component theo spec dưới đây.
```

---

## ATOMS

### A1. Button

```
Tạo `src/atoms/Button.tsx` (RN + NativeWind + TS).

Props:
- label: string
- onPress?: () => void
- variant?: 'primary' | 'danger' | 'ghost'  (default 'primary')
- disabled?: boolean
- loading?: boolean
- fullWidth?: boolean

Hành vi:
- Pressable bo md (14px), padding x-5 y-3.5, flex-row items-center justify-center.
- primary: bg-primary, active:bg-primary-press, text trắng, bold 15px. Dark: bg-primary-dark.
- danger: bg-danger, text trắng. Dark: bg-danger-dark.
- ghost: bg-transparent, border line-2, text ink. Dark: border line-dark-2, text ink-dark.
- disabled: opacity-40, không nhận onPress.
- loading: hiện ActivityIndicator thay label, không nhận onPress.
- Accessibility role="button", accessibilityState={{ disabled }}.
```

### A2. Chip

```
Tạo `src/atoms/Chip.tsx`.

Props:
- label: string
- selected?: boolean
- disabled?: boolean
- emoji?: string
- onPress?: () => void

Hành vi:
- Pressable, padding x-3 y-2, rounded-pill, border.
- Default: bg-surface, border line-2, text ink-muted font-semibold 12.5px.
- Selected: bg-primary-soft, border primary-soft, text primary-ink font-bold.
- active:bg-surface-alt khi không selected.
- Hỗ trợ dark: cho mọi state (bg-surface-dark, border line-dark-2, text ink-dark-muted, primary-dark-soft…).
- Emoji rendered trước label (nếu có), font 12px.
```

### A3. Checkbox (round)

```
Tạo `src/atoms/Checkbox.tsx` — checkbox tròn 28px.

Props:
- variant?: 'default' | 'done' | 'bad'  (default 'default')
- onPress?: () => void
- disabled?: boolean

Hành vi:
- Pressable, w-7 h-7 rounded-full border-2, items-center justify-center, active:scale-90.
- default: bg-surface, border line-2 (dark variants tương ứng).
- done: bg-primary, border primary, hiển thị '✓' text trắng 13px bold.
- bad: bg-danger, border danger, hiển thị '✕' text trắng (không nhận onPress — đã là sự kiện cố định).
- accessibilityRole="checkbox", accessibilityState={{ checked: variant !== 'default' }}.
```

### A4. StarValue

```
Tạo `src/atoms/StarValue.tsx` — hiển thị icon ★ + giá trị Sao.

Props:
- value: number
- size?: 'sm' | 'md' | 'lg' | 'xl'  (default 'md')
- tone?: 'auto' | 'positive' | 'negative' | 'muted'  (default 'auto')

Hành vi:
- View row gap-1, ★ màu star (dark: star-dark), số font-bold theo size:
  sm 12 / md 14 / lg 18 / xl 40.
- tone='auto': nếu value < 0 → negative (text-danger), ngược lại positive (text-primary).
- muted: text ink-faint.
```

### A5. ProgressBar

```
Tạo `src/atoms/ProgressBar.tsx`.

Props:
- value: number  (0..1, sẽ clamp)
- height?: number  (default 10)
- tone?: 'primary' | 'star' | 'danger'  (default 'primary')

Hành vi:
- View track bg-surface-alt (dark: surface-dark-alt), rounded-pill overflow-hidden, style={{ height }}.
- Inner fill theo tone: primary/star/danger, width = pct%.
```

### A6. Icon

```
Tạo `src/atoms/Icon.tsx` — bộ stroke icon dùng react-native-svg.

Props:
- name: 'home' | 'chart' | 'gift' | 'trophy' | 'plus' | 'star'
       | 'sun' | 'moon' | 'check' | 'close' | 'chevron-right'
- size?: number  (default 24)
- color?: string (default '#1B1F1D')
- filled?: boolean

Hành vi:
- Switch theo name, render SVG path với stroke=color, strokeWidth 1.9 (2.4 cho 'plus'/'check'), fill 'none' (trừ 'star' fill color).
- filled=true: dùng fill=color, strokeWidth=0.
```

### A7. TextField

```
Tạo `src/atoms/TextField.tsx`.

Props:
- value: string
- onChangeText: (v: string) => void
- placeholder?: string
- error?: string
- disabled?: boolean
- autoFocus?: boolean

Hành vi:
- TextInput w-full, px-3.5 py-3 rounded-md border-2, font 14px text-ink.
- Default border line-2, bg surface-alt.
- Focused: border-primary, bg-surface, ring (shadow) màu primary-soft.
- Error: border-danger, hiện error text dưới (danger 11.5px font-semibold).
- Disabled: opacity-40, không editable.
- Placeholder color #A5ABA7.
- Dark: tất cả -dark variants tương ứng.
```

### A8. Stepper

```
Tạo `src/atoms/Stepper.tsx` — bộ tăng/giảm số theo step.

Props:
- value: number
- step?: number (default 30)
- min?: number  (default 30)
- max?: number  (default 720)
- unit?: string (default '′')
- onChange: (v: number) => void
- disabled?: boolean

Hành vi:
- View flex-row justify-between, border-2 line-2, rounded-md, bg-surface.
- 2 nút Pressable 36x36 rounded-sm bg-surface-alt, text "−" / "+" (20px font-bold).
- Số ở giữa: 15px font-extrabold + unit.
- Clamp ở min/max. disabled: opacity-40.
```

### A9. Badge

```
Tạo `src/atoms/Badge.tsx` — pill nhỏ.

Props:
- label: string
- tone?: 'neutral' | 'primary' | 'star' | 'danger'  (default 'neutral')

Hành vi:
- View px-2.5 py-1 rounded-pill self-start.
- neutral: bg-surface-alt, text ink-muted.
- primary: bg-primary-soft, text primary-ink.
- star: bg-star-soft, text star.
- danger: bg-danger-soft, text danger.
- Label uppercase tracking-wider 11px font-extrabold.
- Hỗ trợ dark variants.
```

---

## MOLECULES

### M1. TaskRow

```
Tạo `src/molecules/TaskRow.tsx` — dòng task trong Today List.

Props:
- name: string
- emoji: string
- durationMin?: number
- points?: number
- kind?: 'good' | 'bad'  (default 'good')
- done?: boolean
- onToggle?: () => void

Layout:
- Row gap-3, py-3.5, border-b line.
- Checkbox (atom) bên trái: variant 'bad' nếu kind='bad'; 'done' nếu done; ngược lại 'default'.
- Body flex-1: tên 14.5px font-semibold (line-through ink-muted nếu done); meta row dưới hiện emoji • duration′ • "= N pts" (chấm 2px ngăn cách).
- Right: text điểm "+1 ★" hoặc "−50 ★" (danger), 13px font-extrabold.
- bad task không cho onToggle.
```

### M2. CategoryFilter

```
Tạo `src/molecules/CategoryFilter.tsx` — hàng chip danh mục có scroll ngang.

Props:
- selected: 'all' | 'study' | 'sports' | 'family' | 'work'
- onSelect: (id) => void
- lang?: 'vi' | 'en'  (default 'vi')

Danh mục:
[ {id:'all',vi:'Tất cả',en:'All'},
  {id:'study',emoji:'📚',vi:'Học',en:'Study'},
  {id:'sports',emoji:'🏃',vi:'Thể thao',en:'Sports'},
  {id:'family',emoji:'👨‍👩‍👧',vi:'Gia đình',en:'Family'},
  {id:'work',emoji:'💼',vi:'Công việc',en:'Work'} ]

Layout:
- ScrollView horizontal, hide indicator, gap 7px.
- Render Chip cho mỗi mục; selected=id===selected.
```

### M3. StatCard

```
Tạo `src/molecules/StatCard.tsx`.

Props: value: string; label: string; loading?: boolean

Layout:
- bg-surface, border line, rounded-md, padding 3.5.
- Value 22px font-extrabold tracking-tight.
- Label 11px font-bold uppercase tracking-wider ink-muted.
- loading=true: thay value/label bằng skeleton blocks (bg-surface-alt, height 20/10).
```

### M4. TierRow

```
Tạo `src/molecules/TierRow.tsx` — dòng mốc thưởng.

Props:
- stars: number
- vnd: number
- tierLabel: string ("Mốc 3")
- status: 'crossed' | 'locked'
- hint?: string ("còn 68 ★")
- lang?: 'vi' | 'en'

Layout (row gap-3 py-3 border-b line):
- Badge 36x36 rounded-sm: bg star-soft (crossed) hoặc surface-alt (locked); text "5★" font-extrabold màu star/faint.
- Body flex-1: "₫5.000" 14px font-bold; sub "tierLabel · hint" 11.5px muted.
- Status pill: "Đã vượt" (primary-soft/primary-ink) hoặc "Khoá" (surface-alt/faint) — 11px uppercase tracking-wider.
```

### M5. LedgerRow

```
Tạo `src/molecules/LedgerRow.tsx`.

Props:
- icon: string  (emoji)
- label: string
- date: string  (formatted "25/05")
- amount: number (signed VND)
- balanceAfter: number
- type: 'in' | 'out'

Layout (row gap-3 py-3 border-b line):
- 32x32 rounded-sm icon container: bg primary-soft (in) hoặc surface-alt (out); icon text 15px.
- Body: label 14 font-semibold; date 11.5 muted.
- Right column items-end: amount "+₫80.000" (font-extrabold 13.5px primary nếu in, ink nếu out); dưới là balanceAfter "₫175.000" 10px font-semibold faint.
- Format số kiểu vi-VN (toLocaleString('vi-VN')).
```

### M6. RankRow

```
Tạo `src/molecules/RankRow.tsx` — dòng bậc trong Rank Ladder.

Props:
- emoji: string
- vi: string
- en: string
- threshold: string ("80–159 ★")
- current?: boolean
- debt?: boolean
- lang?: 'vi' | 'en'

Layout:
- Default: row gap-3 py-3 border-b line.
- current=true: bg primary-soft, rounded-md, -mx-2, px-3 py-3, KHÔNG border-b.
- Emoji 24px width-8 text-center.
- Body: tên chính (lang) 14 font-extrabold; tên phụ (lang còn lại) 11.5 muted.
- debt: tên màu danger.
- Threshold 11.5 font-extrabold muted (current → primary-ink).
```

### M7. SettingRow

```
Tạo `src/molecules/SettingRow.tsx`.

Props: icon: string; label: string; value?: string; danger?: boolean; onPress?: () => void

Layout (Pressable row gap-3 py-3.5 border-b line, active:bg-surface-alt):
- Icon emoji 18px w-6 text-center.
- Label flex-1 14 font-semibold (danger → text-danger).
- Value 12.5 font-bold muted (nếu có).
- Chevron right icon 18 color faint.
```

### M8. SegmentedControl

```
Tạo `src/molecules/SegmentedControl.tsx`.

Props:
- options: { id: string; label: string }[]
- value: string
- onChange: (id) => void
- tone?: 'neutral' | 'danger'

Layout:
- View row bg-surface-alt rounded-md, padding 0.5.
- Mỗi option: Pressable flex-1, py-2.5, rounded-sm.
- Selected: bg-surface, shadow-sm; text ink (hoặc danger nếu tone='danger').
- Không selected: text ink-muted.
- Dark variants đầy đủ.
```

### M9. LangToggle

```
Tạo `src/molecules/LangToggle.tsx` — pill 2 ô VI / EN.

Props: value: 'vi' | 'en'; onChange: (v) => void

Layout:
- View row border line-2 rounded-pill overflow-hidden bg-surface.
- Mỗi ô Pressable px-2.5 py-1.5.
- Selected: bg-ink, text-surface, 11px font-extrabold uppercase.
- Không selected: text ink-faint.
```

---

## ORGANISMS

### O1. HomeHeader

```
Tạo `src/organisms/HomeHeader.tsx`.

Props:
- initial: string (chữ trên avatar)
- greetingVi/En, dateVi/En
- lang: 'vi' | 'en'
- onAvatarPress?: () => void
- onLangChange: (l) => void

Layout (row gap-2.5 py-1.5):
- Avatar 40x40 rounded-full bg primary-soft + initial text 16 font-extrabold primary-ink; active:scale-95.
- Greeting block flex-1: tên 15 font-extrabold + date 12 muted.
- Theme icon button 32x32 rounded-full (dùng useColorScheme từ nativewind, toggleColorScheme).
- LangToggle (molecule).
```

### O2. StarBalanceHero

```
Tạo `src/organisms/StarBalanceHero.tsx` — thẻ số dư Sao có gradient.

Props:
- balance: number
- deltaToday: number (signed)
- rankEmoji: string
- rankName: string
- debt?: boolean
- onDemoPress?: () => void
- demoLabel?: string

Layout (LinearGradient từ 'expo-linear-gradient'):
- Colors: nếu debt ['#5C1D1E','#B0383C'], ngược lại ['#1A5039','#2E9C6A'], start (0,0) end (1,1).
- borderRadius 22, padding 20, marginTop 14, shadow hero.
- Trên: nhãn "SỐ DƯ SAO" trắng/80 12 tracking-wider.
- Giữa: Icon star size 32 + balance text trắng 40 font-extrabold.
- Dưới row: delta pill bg-white/15 (up emerald/down red); rank-chip bg-white/18 px-3 py-1.5 rounded-pill.
- Demo link tuỳ chọn: underline trắng/70 11px.
```

### O3. DailyProgressCard

```
Tạo `src/organisms/DailyProgressCard.tsx`.

Props: points: number; threshold?: number = 50; lang?: 'vi' | 'en'

Layout (card bg-surface border line rounded-lg p-3.5 mt-3):
- Row trên: label "Điểm hôm nay" 13 bold; right "<b>32</b> / 50" với 32 là 16 font-extrabold primary.
- ProgressBar value=points/threshold mt-2.5.
- Caption mt-2 11.5 muted: "Đạt 50 điểm/ngày → +1 ★ Streak bonus".
```

### O4. TaskList

```
Tạo `src/organisms/TaskList.tsx`.

Props:
- tasks: Task[]
- onToggle: (id: string) => void
- empty labels (vi/en) cho cả title & hint
- lang?: 'vi' | 'en'

Hành vi:
- Nếu tasks rỗng: render empty state card padding-9 items-center, emoji 🌱 42px, title 14 font-bold ink-2, hint 12 muted.
- Ngược lại: render Card với TaskRow cho mỗi task. EMOJI map theo category.
```

### O5. BottomTabBar

```
Tạo `src/organisms/BottomTabBar.tsx`.

Props:
- active: 'home' | 'stats' | 'rewards' | 'rank'
- onChange: (id) => void
- onAddPress: () => void
- lang?: 'vi' | 'en'

Layout:
- View row items-start bg-surface border-t line, px-1.5 pt-2 pb-safe-bottom, h-[86px].
- 2 tab đầu (home, stats), FAB ở giữa (58x58 rounded-full bg-primary -mt-4, shadow primary), 2 tab cuối (rewards, rank).
- TabBtn: flex-1 items-center gap-1, Icon size 24, text 10 font-bold; active → text/icon primary, inactive → ink-faint.
- FAB icon 'plus' trắng 28; active:scale-95.
```

### O6. AddTaskSheet

```
Tạo `src/organisms/AddTaskSheet.tsx` — Modal bottom sheet ghi nhận hoạt động.

Props:
- visible: boolean
- onClose: () => void
- onSubmit: (t: { kind, name, category, durationMin? }) => void
- lang?: 'vi' | 'en'

Logic:
- State local: kind ('good'|'bad'), name, category, dur (60), err.
- Hàm computePoints(dur): dur <= 30 ? 1 : Math.floor(dur/30).
- Submit: nếu name trống → set err, không submit. Ngược lại gọi onSubmit và reset.

Layout (Modal transparent animationType="slide"):
- Backdrop Pressable bg-black/50 onPress=close.
- Container bg-surface rounded-t-2xl px-5 pt-3 pb-7.
- Handle 40x1 line-2 rounded-full self-center mb-4.
- Title "Ghi nhận hoạt động" 19 font-extrabold.
- SegmentedControl Việc tốt+/Thói xấu− (tone='danger' khi kind=bad).
- TextField tên (placeholder VD: Đọc sách…), gắn error.
- CategoryFilter.
- Nếu kind='good': Stepper duration step 30.
- Preview card mt-3.5 p-3 rounded-md text-center font-bold:
    bad → bg-danger-soft text-danger "Trừ 50 ★ khỏi số dư (có thể âm)".
    good → bg-primary-soft text-primary-ink "= N điểm · +1 ★ (1 việc = 1 Sao)".
- Button primary/danger fullWidth "Lưu hoạt động".
```

### O7. AnalyticsChart

```
Tạo `src/organisms/AnalyticsChart.tsx`.

Props:
- period: 'day' | 'week' | 'month' | 'year'
- onPeriodChange: (p) => void
- data: { labels: string[]; values: number[]; sum: number }
- loading?: boolean
- lang?: 'vi' | 'en'

Layout:
- Trên: SegmentedControl Ngày/Tuần/Tháng/Năm.
- Card bg-surface border line rounded-lg p-3.5 mt-3:
  - Row title "Điểm theo thời gian" + sum "Σ NN" 11 muted.
  - Bars: row items-end gap-1.5 height 148 mt-2.
  - Mỗi cột flex-1 items-center gap-1.5; track flex-1 bg-primary-soft rounded-t-sm overflow-hidden justify-end; fill bg-primary (hoặc bg-surface-alt nếu loading) height = value/max*100%.
  - Label 9.5 font-semibold muted.
```

### O8. RewardLadder

```
Tạo `src/organisms/RewardLadder.tsx`.

Props: weeklyStars: number; lang?: 'vi' | 'en'

Logic:
- MILESTONES = [5,10,20,40,80,160].
- Mỗi mốc: crossed = weeklyStars >= s; nếu locked thì hint = "còn (s − weeklyStars) ★".
- Render Card với TierRow cho mỗi mốc, tierLabel "Mốc i+1" (lang vi) / "Tier i+1" (en), vnd = s*1000.
```

### O9. LedgerList

```
Tạo `src/organisms/LedgerList.tsx`.

Props: entries: LedgerEntry[]

Logic:
- Render Card với LedgerRow cho mỗi entry; icon map: milestone_in → '★', spend_out → '☕'; type 'in' nếu amount>=0, ngược lại 'out'.
```

### O10. RankLadder

```
Tạo `src/organisms/RankLadder.tsx`.

Props: currentTier: 'main'|'goated'|'fresh'|'roll'|'clown'|'rookie'|'npc'|'debt'; lang?: 'vi'|'en'

Hằng số (export):
RANK_TIERS = [
  { tier:'main',   vi:'U Là Trời',          en:'Main Character',  emoji:'👑', min:160 },
  { tier:'goated', vi:'Đỉnh Chóp',          en:'Goated',          emoji:'🔥', min:80  },
  { tier:'fresh',  vi:'Xịn Sò',             en:'Certified Fresh', emoji:'✨', min:40  },
  { tier:'roll',   vi:'Cuốn Phết',          en:'On a Roll',       emoji:'🌀', min:20  },
  { tier:'clown',  vi:'Tấu Hài',            en:'Clown Arc',       emoji:'🤡', min:10  },
  { tier:'rookie', vi:'Non Tơ',             en:'Rookie',          emoji:'🐣', min:5   },
  { tier:'npc',    vi:'NPC',                en:'NPC',             emoji:'🎮', min:0   },
  { tier:'debt',   vi:'Toang Rồi Ông Giáo', en:'Game Over',       emoji:'💀', min:-1  },
]
THRESHOLDS = ['160+ ★','80–159 ★','40–79 ★','20–39 ★','10–19 ★','5–9 ★','0–4 ★','< 0 ★']

Hành vi:
- Card chứa RankRow cho mỗi tier; current=true ở dòng currentTier; debt=true ở dòng 'debt'.
- Đây cũng là cơ sở cho rank retention: khi reset tuần, Sao tuần = tier.min của hạng đã đạt.
```

### O11. ProfilePanel

```
Tạo `src/organisms/ProfilePanel.tsx`.

Props:
- initial, name, joinedLabel
- totalStars, bestStreak, fundVnd: number
- lang?: 'vi' | 'en'
- theme?: 'light' | 'dark'
- onLangPress?, onThemePress?: () => void

Layout:
- Header center: avatar 80x80 bg primary-soft + initial 32 font-extrabold, shadow primary; tên 20 font-extrabold mt-2.5; joinedLabel 12.5 muted.
- Lifetime stats: row 3 ô (Tổng Sao, Streak, Quỹ), bg-surface border line rounded-md mt-3.5, mỗi ô flex-1 items-center py-3.5 border-r line (ô cuối bỏ border).
- Section "Cài đặt": Card với SettingRow cho: Ngôn ngữ (value="Tiếng Việt"/"English", onPress=onLangPress), Giao diện (value="Sáng"/"Tối"/light/dark, onPress=onThemePress), Danh mục, Nhắc nhở (08:00), Quy tắc tính điểm, Mục tiêu, Giới thiệu, Đặt lại dữ liệu (danger).
```

---

## SCREEN COMPOSITES (tuỳ chọn — sinh nguyên màn hình)

### S1. Home Screen

```
Tạo `src/screens/HomeScreen.tsx` ghép:
HomeHeader → StarBalanceHero → DailyProgressCard → CategoryFilter → TaskList → BottomTabBar (sticky).
FAB của BottomTabBar mở AddTaskSheet.
State: lang, theme (useColorScheme), tasks, selectedCategory, sheetVisible.
Mock data: balance 128, delta +5, rank 🔥 Đỉnh Chóp; 5 tasks ví dụ (Đọc sách 60′ done, Chạy bộ 30′ done, Học tiếng Anh 90′, Gọi điện gia đình 30′, Ngủ muộn bad −50).
```

### S2. Analytics Screen

```
Tạo `src/screens/AnalyticsScreen.tsx`:
Title "Phân tích" + AnalyticsChart + StatCard grid 2x2 (Sao tuần, TB điểm/ngày, Streak, Tỉ lệ hoàn thành) + Category breakdown (4 catrow với % và bar).
State: period, loading.
```

### S3. Rewards Screen

```
Tạo `src/screens/RewardsScreen.tsx`:
Title "Quỹ Tự Thưởng" + Fund hero card (gradient ink → primary-700, balance ₫175k) + RewardLadder(weeklyStars=92) + LedgerList(mock 4 entries) + nút "+ Ghi chi tiêu".
```

### S4. Rank Screen

```
Tạo `src/screens/RankScreen.tsx`:
Title "Bảng Rank" + RankHero (emoji 🔥, name "Đỉnh Chóp", "★ 92 · Tuần 21", ProgressBar 15%, caption "Còn 68 ★ → U Là Trời 👑") + reset-chip nhắc rank retention + RankLadder(currentTier='goated') + Philosophy card (gradient ink, quote "Không có bảng xếp hạng người khác. Bạn chỉ đua với chính mình của hôm qua.") + Weekly history (3 dòng).
```

### S5. Profile Screen

```
Tạo `src/screens/ProfileScreen.tsx`:
ProfilePanel với mock data (James, joined 18/03/2026, 128★, streak 12, fund 175k).
```

---

## QUICK-START COPY

Nếu muốn sinh nhanh **toàn bộ** package:

```
Sử dụng Master Prompt ở mục 0. Sinh đầy đủ các file dưới đây theo Atomic Design,
mỗi file 1 component, export named + default:

Atoms (9): Button, Chip, Checkbox, StarValue, ProgressBar, Icon, TextField, Stepper, Badge
Molecules (9): TaskRow, CategoryFilter, StatCard, TierRow, LedgerRow, RankRow, SettingRow, SegmentedControl, LangToggle
Organisms (11): HomeHeader, StarBalanceHero, DailyProgressCard, TaskList, BottomTabBar, AddTaskSheet, AnalyticsChart, RewardLadder, LedgerList, RankLadder, ProfilePanel

Kèm:
- tailwind.config.js với Sage scale 50–900 + semantic tokens (light + dark) + radius tokens.
- src/theme/tokens.ts (radius, spacing, shadow object cho Animated).
- src/types/index.ts (Task, RankInfo, LedgerEntry, Category, TaskKind, Lang).
- Barrel exports cho mỗi cấp.

Theo đúng các props/layout/states đã liệt kê trong Bộ Prompt.
```

---

## CHECKLIST KIỂM TRA SAU KHI SINH

- [ ] Dark mode hoạt động bằng `dark:` variant, không hardcode hex.
- [ ] Mọi nút Pressable có `active:` feedback (scale/opacity/bg).
- [ ] TextField hiện border đỏ + helper text khi `error`.
- [ ] Button.disabled không nhận onPress, opacity-40.
- [ ] AddTaskSheet validate tên trống, hiện error đỏ.
- [ ] AnalyticsChart `loading` → bars dùng surface-alt thay vì primary.
- [ ] RewardLadder cộng dồn đúng khi vượt nhiều mốc/tuần (rule 7.2.3).
- [ ] RankLadder dùng RANK_TIERS export làm nguồn rank retention (rule 7.2.2).
- [ ] AddTaskSheet.computePoints khớp rule 7.2.1: ≤ 30′ → 1, > 30′ → ⌊min/30⌋.
