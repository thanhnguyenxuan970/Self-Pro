# Habi — bài Facebook group (2 post: hook + reply)

Cấu trúc: post 1 là tâm sự thật, không quảng cáo, kết bằng câu hỏi.
Post 2 là reply, mới giới thiệu app.

**Đã verify trong code:**

| Chi tiết | Nguồn | Giá trị |
|---|---|---|
| Độ dài thử thách | `src/config/challenges.config.ts` → `CHALLENGE_DURATIONS` | `[7, 30, 60, 100]` |
| Số phao cứu | `src/config/challenges.config.ts` → `PHAO_COUNT` | `1` |

---

## 1/2 — hook

Huhu mình mới mua khoá tiếng Anh xong mà học được mấy bữa là thấy lười quá =))))

Mà lạ là mình không bỏ vào ngày đầu. Mình bỏ vào đúng cái ngày mà nghỉ một hôm vẫn thấy chưa sao. Nghỉ một hôm chẳng mất gì, nên hôm sau nghỉ tiếp cũng chẳng mất gì. Xong rồi nghỉ luôn.

Có ai bỏ kiểu y hệt vậy không, hay mỗi mình?

---

## 2/2 — reply

Nên mình có tự làm một app cho đúng cái bệnh này của mình - Habi.

Habi có những thử thách 7 / 30 / 60 / 100 ngày, lỡ 1 ngày là reset về 0. Bạn có đúng 1 cái phao, dùng xong là hết.

Nghe hơi ác. Cố ý — ngày thứ 23 chỉ có giá trị khi ngày thứ 24 thật sự có thể mất.

Mình đang trong quá trình phát triển, nếu có sai sót hay vấn đề gì trong trải nghiệm thì cứ cmt dưới bài post này giúp mình nhennnn

Tải Habi trên CH Play: play.google.com/store/apps/details?id=com.habitring.app

---

## Đã sửa những gì so với bản đăng thử

| Bản cũ | Vấn đề | Bản mới |
|---|---|---|
| "cái ngày mà nghỉ xả hơi" | Gãy nghĩa — mất hẳn insight, mà đây là câu nối sang post 2 | "cái ngày mà nghỉ một hôm vẫn thấy chưa sao" |
| "y hét" | Lỗi chính tả ngay câu kéo comment | "y hệt" |
| "ngày mai chỉ có giá trị nếu bạn hoàn thành hôm nay" | Tautology, app nào cũng nói được | "ngày thứ 23 chỉ có giá trị khi ngày thứ 24 thật sự có thể mất" |
| "Nghe có vẻ thử thách nhỉ" | Nghe như app còn thiếu tính năng | "Nghe hơi ác. Cố ý" — khẳng định đây là lựa chọn thiết kế |
| thiếu | Mất chi tiết sắc nhất | "Bạn có đúng 1 cái phao, dùng xong là hết" |
| "Huhu" + `=))))` ×2 + "Xong rồi nghỉ luôn =))))" | Cười nhiều quá thì tự rút lại cảm xúc, mà đang cần người ta tin để vào cmt | giữ 1 cái `=))))` |
| gym | Bạn nói chuyện gym không có thật | khoá tiếng Anh |

## Ghi chú

- Ảnh "Mỗi sáng 20 phút / small habit, real streak" đang bán sự **dễ dàng**, ngược
  hướng với thông điệp của cả hai post. Cân nhắc thay bằng ảnh màn hình luật chơi
  (reset về 0 / 1 phao) hoặc ảnh Challenge Detail có day track.
- Nếu vẫn muốn giữ gym: đổi câu đầu thành "mình mới đăng ký gym xong mà tập được
  mấy bữa là thấy lười quá". Cấu trúc còn lại giữ nguyên. Nhưng trong group sẽ có
  người hỏi tập ở đâu / gói bao nhiêu.
