# Ant-swer Hub

A community and support platform for WorldFirst (Ant International) merchants — built as a 48-hour hackathon MVP.

## Overview

Ant-swer Hub is a desktop-first web dashboard designed to integrate with the WorldFirst platform. It provides merchants with announcements, community discussion, and AI-assisted FAQ support — all running locally in the browser with zero server dependencies.

## Features

### Authentication
- Login / Registration toggle panel
- Switch between **Merchant** and **Admin** roles
- Session persists in localStorage across refreshes

### 1. Announcements
- Admin-controlled newsfeed with card layout
- Seed data includes real-looking regional promos (e.g., "Fee-Free trades to Pakistan and Bangladesh")
- Admins can **Create** and **Delete** posts instantly
- Regular users can only read

### 2. Community Forum
- Reddit-style discussion threads with nested comment replies
- Create threads by topic: Product, Exchange Rate, Trading, General
- Interactive poll with live vote tracking
- Community milestone signup tracker with progress bar

### 3. FAQ / Help Center
- Chat-style AI assistant interface
- Keyword-search fallback engine matching against a local WorldFirst Help Center dictionary
- 1.5s pulsing loader animation ("Ant-swer AI is parsing official Help Center guidelines...")
- Graceful fallback with admin contact links for unmatched queries
- Clickable quick-topic chips for instant answers

## Color Theme (WorldFirst)

| Token | Color | Usage |
|-------|-------|-------|
| Primary Accent | `#f4004e` | Brand headers, action buttons, active states |
| Main Background | `#ffffff` | Cards and content canvases |
| Dashboard Canvas | `#f1f1f7` | Main screen layout background |
| Typography | `#000000` | All primary text and titles |
| Highlight Links | `#6d7be0` | Navigation states, hashtags, clickable items |

## Tech Stack

- Pure HTML5 / CSS3 / Vanilla JavaScript
- Zero server — all state in `localStorage`
- Google Fonts (Inter)

## Quick Start

Open `index.html` directly in any modern browser. No build step, no npm, no server.

### Pre-seeded Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@worldfirst.com` | `admin123` |
| Merchant | `rahul@trade.com` | `user123` |

## Project Structure

```
Ant-swer_Hub/
  index.html        — Main HTML (single-page app shell)
  css/styles.css    — WorldFirst-themed stylesheet
  js/app.js         — Application logic, state, chatbot engine
  README.md
```