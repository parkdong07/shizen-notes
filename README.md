# 🍵 Shizen Notes 自然

> บันทึกชีวิตในแบบของคุณ — Japanese Minimal Note & Todo App

[![Deploy](https://github.com/YOUR_GITHUB/shizen-notes/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR_GITHUB/shizen-notes/actions)

**Demo:** `https://YOUR_GITHUB.github.io/shizen-notes/`

---

## ✨ Features

| Feature | Detail |
|---------|--------|
| 📓 Journal Notes | เขียน note อิสระ พร้อม mood emoji + tags |
| ✅ Todo List | task + due date + priority + ค้นหา/กรอง |
| ⏰ Reminder | แจ้งเตือนผ่าน push notification (PWA) |
| 🔥 Firebase Sync | sync realtime ข้ามอุปกรณ์ |
| 📱 PWA | ติดตั้งบนมือถือได้เหมือน native app |
| 🌙 Offline | อ่าน/เขียนได้แม้ไม่มีเน็ต |

---

## 🚀 Setup & Deploy

### 1. สร้าง Firebase Project

1. ไปที่ [console.firebase.google.com](https://console.firebase.google.com)
2. สร้าง Project ใหม่
3. เปิด **Authentication** → Sign-in method → เปิด **Anonymous**
4. เปิด **Firestore Database** → สร้าง database (production mode)
5. ไปที่ **Project Settings** → เพิ่ม Web App → copy config
6. เปิด **Cloud Messaging** → copy **VAPID Key** (Web Push certificates)

### 2. ตั้ง Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    match /todos/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

### 3. สร้าง GitHub Repository

```bash
cd shizen-notes
git init
git add .
git commit -m "feat: initial Shizen Notes app"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB/shizen-notes.git
git push -u origin main
```

### 4. ตั้ง GitHub Secrets

ไปที่ **GitHub Repo → Settings → Secrets → Actions** แล้วเพิ่ม:

| Secret Name | Value |
|-------------|-------|
| `FIREBASE_API_KEY` | จาก Firebase config |
| `FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | `your-project-id` |
| `FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `FIREBASE_MESSAGING_SENDER_ID` | จาก Firebase config |
| `FIREBASE_APP_ID` | จาก Firebase config |
| `FIREBASE_VAPID_KEY` | จาก Cloud Messaging Web Push VAPID Key |

### 5. เปิด GitHub Pages

ไปที่ **GitHub Repo → Settings → Pages → Source: Deploy from branch → gh-pages**

Push ไป branch `main` แล้ว GitHub Actions จะ deploy อัตโนมัติ!

---

## 💻 Local Development

```bash
# 1. Copy env template
cp .env.example env.js
# แก้ env.js ใส่ค่าจริงจาก Firebase

# 2. รัน local server (ต้องใช้ server จริง ไม่ใช่ file://)
npx serve .
# หรือ
python -m http.server 3000

# เปิด http://localhost:3000
```

---

## 📱 Mobile Notification Support

| Platform | Support |
|----------|---------|
| Android Chrome | ✅ เต็มรูปแบบ |
| iOS Safari 16.4+ | ✅ ใช้ได้ (ต้อง Add to Home Screen ก่อน) |
| Desktop Chrome | ✅ เต็มรูปแบบ |
| Firefox | ✅ เต็มรูปแบบ |

---

## 🎨 Design

- **Color**: Matcha Japanese Minimal (`#7B9E6B`, `#F5F0E8`, `#8B7355`)
- **Font**: `Noto Serif JP` + `Inter`
- **Style**: ชิว, เรียบ, zen, rice paper texture

---

*สร้างด้วย ❤️ และ 🍵*
