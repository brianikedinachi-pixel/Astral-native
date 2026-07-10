# Astral Mobile App - Interface Design

## Overview

Astral is an AI companion app for support and guidance. The mobile app focuses on one-handed usage in portrait orientation (9:16), following iOS Human Interface Guidelines for a native feel.

---

## Screen List

1. **Sign In Screen** - Email/name entry for access verification
2. **Chat Screen** - Main conversation interface with message history
3. **Settings Screen** - User preferences, stats, and account management
4. **New Chat Modal** - Quick start for new conversations

---

## Primary Content & Functionality

### Sign In Screen
- **Content**: Email input, name input, sign-in button
- **Functionality**: 
  - Email validation against approved list
  - Session persistence with localStorage
  - Loading state feedback
  - Error messaging for denied access
  - Link to landing page intro

### Chat Screen (Main)
- **Content**: 
  - Header with logo, app title, user avatar dropdown
  - Sidebar with chat history (collapsible on mobile)
  - Main chat area with scrollable message bubbles
  - Floating input pill with:
    - Image attachment button
    - Text input textarea
    - Send button
    - Voice toggle (desktop)
    - Speech input toggle (desktop)
    - Mobile menu for voice options
- **Functionality**:
  - Send text messages
  - Attach and send images
  - Display AI responses with markdown rendering
  - Voice responses (text-to-speech)
  - Speech input (speech-to-text)
  - Like/dislike reactions on messages
  - Chat history persistence
  - New chat creation

### Settings Screen
- **Content**:
  - User profile (avatar, name, email)
  - Stats cards (messages sent, images shared, conversations, member since)
  - Preference toggles:
    - Voice responses (on/off)
    - Speech input (on/off)
    - Compact bubbles (on/off)
  - Action buttons:
    - Clear all chats
    - Log out
- **Functionality**:
  - Display user stats from backend
  - Toggle preferences with persistence
  - Clear chat history
  - Logout and redirect to sign-in

---

## Key User Flows

### Flow 1: Sign In → Chat
1. User enters email and name on Sign In screen
2. Taps "Sign In" button
3. App validates email with backend
4. On success: redirect to Chat screen with empty state
5. On failure: show error message (access denied or network error)

### Flow 2: Send Message
1. User taps chat input field
2. Types message
3. Taps send button (or voice input)
4. Message appears in chat with loading state
5. AI response streams in
6. User can like/dislike response

### Flow 3: Attach Image
1. User taps attachment button
2. Camera choice popup appears (Take Photo / Choose from Gallery)
3. Image selected/captured
4. Thumbnail preview appears above input
5. User types optional caption
6. Taps send to submit message with image
7. AI processes image and responds

### Flow 4: Voice Interaction
1. User toggles voice responses on in settings
2. When AI responds, audio plays automatically
3. User can tap speech input button to dictate message
4. Mic records and transcribes to text
5. User reviews and sends

### Flow 5: New Chat
1. User taps "New Chat" button in sidebar
2. Chat area clears to empty state
3. Input field is ready for first message
4. Chat is saved to history once first message is sent

---

## Color Choices

**Astral Brand Palette** (Dark mode optimized):

| Element | Color | Usage |
|---------|-------|-------|
| Primary Accent | `#00e5ff` (Cyan) | Buttons, links, highlights |
| Secondary Accent | `#7c3aed` (Purple) | Gradients, hover states |
| Background | `#05080f` (Dark Navy) | Screen background |
| Surface | `#0d1117` (Slightly Lighter) | Cards, input fields |
| Card | `#0f1923` (Card Layer) | Message bubbles, modals |
| Text Primary | `#e8f4ff` (Light Blue-White) | Main text |
| Text Muted | `#5a7a9a` (Muted Blue) | Secondary text, labels |
| Border | `rgba(0,229,255,.14)` (Cyan with opacity) | Dividers, borders |
| Error | `#ff4d6d` (Red) | Error messages, alerts |
| Info | `#00e5ff` (Cyan) | Info messages |

**Gradient**: Linear from Cyan → Purple for buttons and hero elements

---

## Mobile-First Considerations

- **One-handed usage**: Input controls positioned at bottom, critical buttons within thumb reach
- **Notch handling**: Content respects safe area insets (status bar, home indicator)
- **Touch targets**: Minimum 44pt (iOS standard) for interactive elements
- **Scrolling**: Chat history is scrollable, settings is scrollable
- **Keyboard**: Input field grows with text (textarea), keyboard dismisses on send
- **Orientation**: Portrait only (9:16 aspect ratio)
- **Responsive**: Sidebar collapses on small screens, full-width chat on mobile

---

## Interaction Patterns

- **Press feedback**: Buttons scale slightly (0.97) on press with haptic feedback
- **Loading states**: Spinner appears during API calls
- **Errors**: Toast or inline error messages with retry option
- **Confirmation**: Destructive actions (logout, clear chats) show confirmation dialog
- **Animations**: Subtle fade-in for messages, smooth scroll for chat history
