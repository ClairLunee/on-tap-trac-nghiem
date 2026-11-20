# Ôn tập trắc nghiệm

Website tĩnh để ôn tập trắc nghiệm, chạy trên GitHub Pages. Không cần build: trang đọc trực tiếp các file đề và đáp án dạng markdown.

## Bật GitHub Pages

Settings → Pages → Build and deployment → Source: **Deploy from a branch** → Branch: `main`, thư mục `/ (root)` → Save. Sau khoảng một phút, trang chạy tại `https://<tên-tài-khoản>.github.io/on-tap-trac-nghiem/`.

## Cấu trúc

```
index.html                trang duy nhất (Preface, làm bài, kết quả)
assets/app.js             làm bài, lưu tiến trình, cột mốc
assets/parse.js           đọc file đề + đáp án markdown
assets/style.css          giao diện (nền kem, font Latin Modern)
data/quizzes.js           danh sách bộ đề
data/vldc1/*.md           đề và đáp án của Vật lý đại cương 1
```

KaTeX và font Latin Modern được tải từ cdn.jsdelivr.net.

## Thêm bộ đề mới

1. Viết đề và đáp án theo đúng định dạng của `TracNghiem_Ch9-10_DeBai.md` và `TracNghiem_Ch9-10_DapAn.md`.
2. Chép hai file vào `data/vldc1/` (hoặc `data/vldc2/`).
3. Thêm một mục vào `data/quizzes.js`. Tên ô trên trang Preface là tên file đề.

## Lưu trữ

Tiến trình đang làm và các cột mốc lưu trong `localStorage` của trình duyệt, theo từng máy và từng trình duyệt.

Mở `index.html` trực tiếp bằng file:// sẽ không tải được đề. Hãy dùng GitHub Pages hoặc một máy chủ cục bộ (`python3 -m http.server`).
