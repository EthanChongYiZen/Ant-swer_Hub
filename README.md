# Ant-swer Hub

A community and support platform for WorldFirst (Ant International) merchants — built as a 48-hour hackathon MVP.

## Overview

Ant-swer Hub is a full-stack web dashboard that connects WorldFirst merchants across regions. It provides real-time announcements, community discussion, direct messaging, group chat, and an AI-powered assistant — all backed by Firebase and deployable to Vercel in one command.

## Live Demo

[https://ant-swer-nu.vercel.app](https://ant-swer-nu.vercel.app)

---

## Features

### Authentication
- Email/password registration and login
- Google Sign-In (OAuth)
- Role-based access: **Merchant** and **Admin**
- Region selection on first login (MY, CN, SG, HK, and more)
- Protected routes — unauthenticated users redirected to login

### Announcements
- Admin-published announcements with multi-region targeting
- Region flag indicators per announcement
- Full-width feed filtered by the logged-in user's region
- Supports both single-region (legacy) and multi-region posts

### Community Forum
- Create posts as **Discussion**, **Poll**, or **Event**
- Multi-select region targeting per post
- Image attachments on posts (uploaded to Firebase Storage)
- Nested comment replies with author avatars
- Filter posts by region with multi-select dropdown
- Like / vote interactions

### Direct Messages (DM)
- 1-to-1 real-time chat with any contact
- Add contacts and remove them (with message history cleanup)
- Deterministic channel IDs — no duplicate channels
- Ideal for coordinating cross-border L2L transfers (e.g. MY ↔ CN)

### Group Chat
- Real-time group messaging channel
- Message timestamps and user avatars

### AI Assistant
- Conversational chat interface powered by **Google Gemini API** (`gemini-2.5-flash`)
- Falls back to keyword-based mock responses when no API key is set
- Quick-topic chips for common merchant queries

### Admin Panel
- **Announcements tab** — create, target by region, delete
- **Forum tab** — create posts with image upload and progress indicator
- **Support tab** — view and respond to merchant support tickets

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS v3 |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| File storage | Firebase Storage |
| AI | Google Gemini API (`gemini-2.5-flash`) |
| Hosting | Vercel |

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install dependencies

```bash
cd ant-swer
npm install
```

### Configure environment variables

Create a `.env` file in the `ant-swer/` directory:

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_GEMINI_API_KEY=your_gemini_api_key
```

### Run locally

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

---

## Deployment (Vercel)

```bash
npm install -g vercel
vercel --prod
```

Add all `VITE_` environment variables in your Vercel project settings under **Settings → Environment Variables**.

> **Note:** For Google Sign-In to work on the live domain, add your Vercel URL to Firebase Console → Authentication → Authorized Domains.

---

## Project Structure

```
ant-swer/
├── src/
│   ├── assets/
│   │   └── ant-icon.jpg          # Brand icon
│   ├── components/
│   │   ├── Avatar.tsx
│   │   ├── Guards.tsx            # Route protection
│   │   └── ui/
│   │       └── toast.tsx         # Toast notification system
│   ├── contexts/
│   │   └── AuthContext.tsx       # Firebase auth state
│   ├── lib/
│   │   ├── firebase.ts           # Firebase SDK init
│   │   └── utils.ts
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardLayout.tsx
│   │   ├── AnnouncementsPage.tsx
│   │   ├── ForumPage.tsx
│   │   ├── ChatPage.tsx          # Direct Messages
│   │   ├── GroupChatPage.tsx
│   │   ├── AIAssistantPage.tsx
│   │   ├── AdminPage.tsx
│   │   ├── BlogPage.tsx
│   │   ├── SupportPage.tsx
│   │   └── SelectRegionPage.tsx
│   ├── App.tsx                   # Routes
│   └── main.tsx
├── index.html
├── tailwind.config.js
├── vite.config.ts
├── tsconfig.json
└── vercel.json
```

---

## Future Improvements

- **Streaming AI responses** — use server-sent events with Gemini for real-time token output
- **Multi-turn AI conversations** — pass full message history for context-aware chat
- **Backend API proxy** — move Gemini calls server-side to protect the API key
- **Push notifications** — Firebase Cloud Messaging for new DMs and announcements
- **Rate limiting** — per-user API usage tracking in Firestore
- **Mobile app** — React Native port using the same Firebase backend

---

## License

See [LEGAL.md](../LEGAL.md) for licensing information.
