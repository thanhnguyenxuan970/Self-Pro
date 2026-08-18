# Habi — bài social về tính năng Thử thách

Góc: origin story — vấn đề cá nhân (học ngoại ngữ) → nên mình làm app.
Giọng: founder, `mình/bạn`. Không dùng số liệu bịa.

**Đã verify trong code trước khi viết:**

| Chi tiết | Nguồn | Giá trị |
|---|---|---|
| Độ dài thử thách | `src/config/challenges.config.ts` → `CHALLENGE_DURATIONS` | `[7, 30, 60, 100]` |
| Số phao cứu | `src/config/challenges.config.ts` → `PHAO_COUNT` | **`1`** |

> Bản draft trước của mình ghi "vài cái phao cứu" — **sai**. Chỉ có đúng 1.
> Nếu sau này đổi `PHAO_COUNT` thì phải sửa lại copy này.

---

## Bản chính — Facebook group (không giới hạn ký tự)

Mình học ngoại ngữ kiểu này: hào hứng được mấy hôm đầu, rồi có một hôm bận nên nghỉ. Hôm sau nghĩ "thôi mai học bù". Rồi chẳng có cái mai nào cả.

Cái làm mình bỏ không phải ngày đầu tiên. Là cái ngày mà nghỉ một hôm vẫn thấy chưa sao.

App mình dùng lúc đó cũng chiều mình lắm. Đứt chuỗi thì nó cho phao, cho bù, cho "không sao, mai làm lại nhé". Nên chuỗi trên app thì vẫn đẹp, còn ngoại ngữ của mình thì đứng yên.

Mình đâu cần một app an ủi mình. Mình cần một thứ để mất.

Nên mình tự làm Habi. Thử thách 7 / 30 / 60 / 100 ngày, nhưng luật thì không chiều bạn: lỡ 1 ngày là reset về 0. Bạn có đúng 1 cái phao. Dùng xong là hết.

Nghe hơi ác. Cố ý. Vì ngày thứ 23 chỉ có giá trị khi ngày thứ 24 thật sự có thể mất.

Nếu bạn đang thấy mình vô kỷ luật thì đúng rồi đó, app này làm cho bạn, không phải cho người vốn đã giỏi sẵn.

Tải Habi trên CH Play: [link]

---

## Bản Threads — 3 post (giới hạn 500 ký tự/post)

**1/** (230 ký tự)

Mình học ngoại ngữ kiểu này: hào hứng mấy hôm đầu, rồi có một hôm bận nên nghỉ. Hôm sau nghĩ "thôi mai học bù". Rồi chẳng có cái mai nào cả.

Cái làm mình bỏ không phải ngày đầu tiên. Là cái ngày mà nghỉ một hôm vẫn thấy chưa sao.

**2/** (236 ký tự)

App mình dùng lúc đó cũng chiều mình lắm. Đứt chuỗi thì cho phao, cho bù, cho "không sao, mai làm lại nhé".

Nên chuỗi trên app thì vẫn đẹp. Còn ngoại ngữ của mình thì đứng yên.

Mình đâu cần một app an ủi mình. Mình cần một thứ để mất.

**3/** (371 ký tự)

Nên mình tự làm Habi.

Thử thách 7 / 30 / 60 / 100 ngày, nhưng luật thì không chiều bạn: lỡ 1 ngày là reset về 0. Bạn có đúng 1 cái phao. Dùng xong là hết.

Nghe hơi ác. Cố ý. Vì ngày thứ 23 chỉ có giá trị khi ngày thứ 24 thật sự có thể mất.

Nếu bạn đang thấy mình vô kỷ luật thì đúng rồi đó — app này làm cho bạn, không phải cho người vốn đã giỏi sẵn.

Tải Habi: [link]

---

## Có thể cân nhắc: nêu đích danh app cũ

Đoạn 2 đang viết "App mình dùng lúc đó". Nếu thay bằng tên thật (Duolingo chẳng hạn)
thì độ nhận diện tăng vọt — gần như ai học ngoại ngữ cũng từng giữ streak ở đó và
từng dùng streak freeze. Ý "streak thì còn mà trình độ thì đứng yên" sẽ chạm rất mạnh.

Đánh đổi: nêu tên đối thủ trong bài có link tải app dễ bị đọc là công kích cạnh
tranh, và nhiều group Facebook cấm. Mình để mặc định là ẩn danh; muốn nêu tên thì
nói, nhưng chỉ nên nêu nếu bạn **thật sự** từng dùng app đó.

---

## Ghi chú

- `[link]` — thay bằng URL Play Store (`play.google.com/store/apps/details?id=com.habitring.app`).
- Không hashtag, không nhét link ở comment đầu. Cả hai đều lộ mùi quảng cáo và
  phá luôn giọng ngôi thứ nhất.
- Câu cuối cố ý lật ngược so với bản bạn đã đăng ("Nếu bạn vốn là 1 người kỷ luật...").
  Bản cũ nhắm vào người *đã* có kỷ luật — tệp nhỏ nhất và cần app ít nhất.

### Vì sao viết như vậy

- Câu chốt đoạn 1 ("cái ngày mà nghỉ một hôm vẫn thấy chưa sao") chính là luận điểm
  thiết kế của app, nhưng nói bằng giọng kể. Nhờ vậy đoạn luật chơi ở dưới là kết
  luận của câu đó, không phải quảng cáo dán vào cuối bài.
- "Chuỗi trên app thì vẫn đẹp, còn ngoại ngữ của mình thì đứng yên" là câu gánh cả
  bài: cụ thể, không cần số, và nói đúng lý do vì sao streak dễ dãi là vô nghĩa.
- Không đụng tới "30 ngày tạo thói quen" — đó là myth đã bị bác bỏ
  (Lally et al., UCL 2009: trung vị 66 ngày, dao động 18–254).
- Không bán "phân tích thông số chi tiết" — tính năng nào cũng có. Bán cái luật
  reset, thứ gần như không app nào dám làm.
