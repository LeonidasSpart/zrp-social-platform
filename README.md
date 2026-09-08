# ZRP Social

> A safer, more private and human-centered social platform built for the next generation of social networking.

[![Website](https://img.shields.io/badge/Website-zrp.one-red?style=flat-square)](https://zrp.one)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Android%20%7C%20iOS-black?style=flat-square)](https://zrp.one)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](LICENSE)

**ZRP Social** is an independent Swiss/European social platform designed around privacy, safety, freedom of expression, meaningful connections and a more human digital experience.

ZRP brings social networking, messaging, short-form video, music, creator tools, discovery, AI-powered features, community support and more into one connected platform.

## Why ZRP

Social media has become increasingly complex, invasive and fragmented.

ZRP is built around a different philosophy:

- Privacy should be treated as a core product principle.
- Communities should have meaningful safety tools.
- Users should have control over their content and interactions.
- Creators should have professional tools without sacrificing the user experience.
- Social networking should feel human, not algorithmically overwhelming.
- One platform should bring people, creators, communities and content together.

ZRP is designed to be a complete social ecosystem rather than another single-purpose social application.

---

## Platform

ZRP is being developed as a multi-platform ecosystem:

- Web application
- Native Android application
- Native iOS application
- Shared backend and API infrastructure
- Real-time communication services
- Production PostgreSQL database
- Cloud media storage and delivery

The web platform is built with a modern full-stack architecture, while the native applications provide platform-specific experiences for Android and iOS.

---

## Core Features

### Social Networking

- Personalized home feed
- Following and followers
- User profiles
- Private accounts
- Posts, replies and reposts
- Likes and interactions
- Bookmarks
- Post sharing
- Post view counts
- Polls
- Scheduled posts
- Hashtags
- Trending content
- People discovery
- User search
- Notifications

### Stories

Create and share temporary content with support for:

- Text stories
- Image stories
- Video stories
- Story viewing
- Media playback
- Real cloud uploads

### Shorts

A dedicated short-form video experience for discovering and watching vertical video content.

### Explore & Discovery

ZRP includes dedicated discovery experiences for:

- Trending hashtags
- Suggested people
- Trending content
- Search
- Explore feeds
- Hashtag feeds

Discovery is backed by real platform data rather than static or placeholder content.

---

## Messaging

ZRP includes real-time communication capabilities designed around privacy and user control.

Features include:

- Direct messaging
- Real-time conversations
- Online and unread states
- Message notifications
- Media attachments
- Voice-related communication infrastructure
- Audio/video calling infrastructure
- User blocking
- User muting
- Conversation controls

The messaging system is backed by real-time services and persistent server-side data.

---

## ZRP Music

**ZRP Music** is a native music experience integrated directly into ZRP Social.

It includes production-backed music infrastructure for:

- Artists
- Albums
- Tracks
- Playlists
- Likes
- Artist follows
- Listening history
- Track playback
- Queue management
- Shuffle and repeat
- Music discovery
- Music Studio
- Cloud audio and artwork storage

Music data is stored through the ZRP backend using Prisma/PostgreSQL, while audio and artwork are handled through the platform's UploadThing infrastructure.

There is no seeded mock catalogue in the production architecture.

---

## Creator Studio

ZRP provides creators with dedicated tools to manage and understand their presence on the platform.

Creator capabilities include:

- Creator profiles
- Creator analytics
- Content management
- Audience insights
- Creator Studio
- Creator-focused tools
- Music artist capabilities
- Creator content controls

The creator ecosystem is designed to grow alongside the platform.

---

## ZRP AI

ZRP integrates AI-powered functionality into the platform to provide users with intelligent assistance and content-related tools.

The architecture supports AI-powered experiences through the ZRP backend and OpenAI integration.

---

## ZRP Help

ZRP Help provides a community-oriented support and assistance layer inside the platform.

It is designed to allow users and communities to:

- Discover assistance opportunities
- Support campaigns
- Contribute to community initiatives
- Report inappropriate campaign content
- Access support-related functionality

---

## Opportunities

ZRP includes an opportunity ecosystem connecting users with professional and career-related opportunities.

The platform supports areas such as:

- Opportunity discovery
- Applications
- Saved opportunities
- Professional profiles
- Employer and opportunity workflows

---

## Marketplace

ZRP includes a marketplace experience for discovering listings and connecting users directly.

Marketplace functionality includes:

- Listings
- Listing discovery
- Listing details
- Favorites
- Seller listings
- Listing management
- Direct communication between users

ZRP does not represent every marketplace interaction as an on-platform payment transaction. Certain transactions can be completed directly between users.

---

## Trust & Safety

Safety is a core part of ZRP's architecture.

The platform includes tools and systems for:

- User blocking
- User muting
- Content reporting
- Moderation workflows
- Administrative reports
- Community safety
- Trust Passport
- Abuse prevention
- Bot and fake-account protection
- Content policy enforcement

ZRP is designed to provide a safer environment while maintaining a strong commitment to user expression.

---

## Privacy

Privacy is one of the foundational principles of ZRP.

The platform is designed with:

- User-controlled privacy settings
- Private accounts
- Blocking and muting
- Account deletion workflows
- Media cleanup
- Session and authentication controls
- Server-side authorization
- Secure authentication flows
- Protection against abusive content and accounts

Account deletion includes server-side cleanup workflows for user-generated platform data and associated uploaded media.

---

## Authentication

ZRP supports modern authentication flows including:

- Email and password authentication
- Email verification
- Google Sign-In
- Sign in with Apple
- Secure session management
- Account recovery

Authentication and authorization are handled server-side.

---

## Internationalization

ZRP is built as a multilingual platform.

The application includes localization infrastructure for multiple languages, allowing the interface to adapt to different regions and communities.

The native applications also include localization support.

---

## Mobile Applications

ZRP is being developed with dedicated native Android and iOS applications.

### Android

The Android application uses:

- Kotlin
- Android SDK
- Jetpack components
- Firebase services
- Media3
- WebRTC
- Google Credential Manager

The Android release pipeline produces signed release Android App Bundles for Google Play distribution.

### iOS

The iOS application uses:

- Swift
- SwiftUI
- Native Apple frameworks
- Sign in with Apple
- Firebase/APNs integration
- Native navigation and platform experiences
- Real-time communication infrastructure

The native applications communicate with the same ZRP backend ecosystem used by the web platform.

---

## Technology Stack

### Web

- Next.js
- React
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide
- Recharts

### Backend

- Node.js
- Next.js API routes
- Prisma
- PostgreSQL
- Redis
- Socket.IO
- Firebase Admin
- Resend
- Nodemailer

### Authentication & Security

- NextAuth
- Google authentication
- Sign in with Apple
- Email verification
- bcrypt
- Secure server-side authorization
- Content sanitization
- SSRF-aware link preview infrastructure

### Media

- UploadThing
- Sharp
- Image and video processing
- Audio storage and playback
- Cloud-based media delivery

### AI

- OpenAI API

### Blockchain

ZRP also contains blockchain infrastructure and Solana integrations, including support for Solana-based functionality and USDC transactions.

Blockchain-related functionality is maintained separately from the core social experience and can evolve independently.

### Native

- Kotlin
- Swift
- SwiftUI
- Android SDK
- WebRTC
- Media3
- Capacitor

---

## Architecture

At a high level, ZRP is structured around a shared backend serving multiple clients:

```text
                         ┌─────────────────────┐
                         │      ZRP Social     │
                         │      Platform       │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
       │     Web     │       │   Android   │       │     iOS     │
       │  Next.js    │       │   Native    │       │   Native    │
       └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    ZRP Backend      │
                         │  APIs & Services    │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
       │ PostgreSQL  │       │    Redis    │       │ UploadThing │
       │   Prisma    │       │   Realtime  │       │    Media    │
       └─────────────┘       └─────────────┘       └─────────────┘
