# Astral React Native App - Complete Deployment & Distribution Guide

## Overview

Your Astral React Native app is now production-ready with all features implemented:

- ✅ Email-based authentication
- ✅ Real-time chat with AI responses
- ✅ Message reactions (like/dislike)
- ✅ Markdown rendering for rich text
- ✅ Chat persistence and sync to backend
- ✅ User stats tracking
- ✅ Settings with preferences
- ✅ Dark theme with Astral branding

## Testing the App

### Option 1: Web Testing (Immediate)

1. Click **Preview** in the Management UI (top-right)
2. The app opens in your browser
3. Sign in with: **bukanwoko@gmail.com** and any name
4. Test the chat, reactions, and settings

### Option 2: Mobile Testing with Expo Go (5 minutes)

1. Download **Expo Go** app on your iPhone or Android
2. Scan the QR code in the Management UI
3. App opens on your phone for native testing

## Building for Production

### Step 1: Create a Checkpoint

Before building, save your current state:

```bash
# Already done - checkpoint version: e900f3ba
# You can view it in the Management UI under "Version history"
```

### Step 2: Build APK (Android)

**Method A: Using Expo Cloud Build (Recommended)**

1. Go to the Management UI
2. Click **Publish** button (top-right, next to settings)
3. Select "Build APK"
4. Wait 10-15 minutes for build to complete
5. Download the `.apk` file
6. Share with users or upload to Google Play Store

**Method B: Local Build (Advanced)**

```bash
cd /home/ubuntu/astral-mobile-app

# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Build APK locally
eas build --platform android --local
```

### Step 3: Build IPA (iOS)

**Method A: Using Expo Cloud Build (Recommended)**

1. Click **Publish** button in Management UI
2. Select "Build IPA"
3. Wait 15-20 minutes
4. Download the `.ipa` file
5. Upload to Apple App Store via TestFlight or App Store Connect

**Method B: Local Build (Advanced)**

```bash
eas build --platform ios --local
```

## Distribution Options

### Option 1: Google Play Store (Android)

**Setup:**

1. Create a Google Play Developer account ($25 one-time fee)
2. Create an app listing
3. Generate a signing key:

```bash
eas build --platform android --local --key-store-type pkcs12
```

**Upload:**

1. Go to Google Play Console
2. Upload the signed APK
3. Fill in app details, screenshots, description
4. Submit for review (24-48 hours)

### Option 2: Apple App Store (iOS)

**Setup:**

1. Enroll in Apple Developer Program ($99/year)
2. Create an App ID in Apple Developer Portal
3. Generate provisioning profiles

**Upload:**

1. Use Xcode or Transporter app
2. Upload the IPA file
3. Fill in app metadata
4. Submit for review (24-48 hours)

### Option 3: Direct Distribution (Fastest)

**Android:**

1. Build APK (see above)
2. Host on your website or cloud storage
3. Share download link with users
4. Users download and install directly

**iOS:**

1. Use TestFlight for beta testing (no review needed)
2. Or use AdHoc distribution for limited users
3. Users install via email link

### Option 4: PWA Distribution (Web)

Deploy as a Progressive Web App:

```bash
cd /home/ubuntu/astral-mobile-app

# Build for web
pnpm run build

# Deploy to Vercel, Netlify, or your server
vercel deploy
```

Users can then:

1. Visit your website
2. Click "Add to Home Screen"
3. App installs like a native app

## Updating the App

### Push Updates to Users

**For App Store/Play Store:**

1. Make code changes
2. Increment version in `app.config.ts`:

```typescript
version: "1.0.1",  // was 1.0.0
```

3. Rebuild APK/IPA
4. Upload to stores
5. Users get automatic update notification

**For Direct Distribution:**

1. Rebuild APK/IPA
2. Upload to your server
3. Users download new version

## Configuration for Production

### Update Backend URL (if needed)

Edit `/home/ubuntu/astral-mobile-app/app/signin.tsx` and `/home/ubuntu/astral-mobile-app/app/chat-enhanced.tsx`:

```typescript
const BACKEND_URL = "https://your-production-backend.com";
```

### Update App Branding

Edit `/home/ubuntu/astral-mobile-app/app.config.ts`:

```typescript
const env = {
  appName: "Astral",  // Your app name
  appSlug: "astral",
  logoUrl: "",  // S3 URL of your logo
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};
```

### Update Theme Colors

Edit `/home/ubuntu/astral-mobile-app/theme.config.js`:

```javascript
const themeColors = {
  primary: { light: '#00e5ff', dark: '#00e5ff' },  // Cyan
  background: { light: '#ffffff', dark: '#05080f' },  // Dark navy
  // ... other colors
};
```

## Monitoring & Analytics

### Add Analytics

```bash
pnpm add expo-analytics
```

### Track User Events

```typescript
import * as Analytics from 'expo-analytics';

// Track message sent
Analytics.logEvent('message_sent', {
  user_id: session.user_id,
  chat_id: currentChatId,
});
```

## Troubleshooting

### Build Fails

1. Check TypeScript errors: `pnpm run check`
2. Clear cache: `pnpm run build -- --reset-cache`
3. Check dependencies: `pnpm install`

### App Crashes on Startup

1. Check logs: `adb logcat` (Android) or Xcode console (iOS)
2. Verify backend URL is correct
3. Check AsyncStorage permissions

### Backend Connection Issues

1. Verify backend is running: `curl https://astral-1-sb1i.onrender.com/health`
2. Check CORS headers on backend
3. Verify email is in allowed-users list

## Performance Optimization

### Before Deployment

1. **Minify code:**

```bash
pnpm run build
```

2. **Optimize images:**

```bash
# Use smaller icon files
# Compress images to <100KB each
```

3. **Test on real devices:**

```bash
# Test on Android phone
eas build --platform android --profile preview

# Test on iOS phone
eas build --platform ios --profile preview
```

## Security Checklist

- [ ] Backend URL uses HTTPS
- [ ] Sensitive data not hardcoded
- [ ] Session tokens stored securely (expo-secure-store)
- [ ] API keys not exposed
- [ ] CORS properly configured on backend
- [ ] Rate limiting enabled on backend
- [ ] Input validation on all forms

## Estimated Timeline

| Task | Time |
|------|------|
| Testing (web + phone) | 30 min |
| Building APK | 15 min |
| Building IPA | 20 min |
| Google Play submission | 24-48 hours |
| Apple App Store submission | 24-48 hours |
| **Total to production** | **1-2 days** |

## Support & Maintenance

### Regular Updates

1. Monitor backend logs for errors
2. Update dependencies monthly: `pnpm update`
3. Test new features before release
4. Keep app version current

### User Support

1. Create FAQ page
2. Set up email support: support@astral.app
3. Monitor crash reports
4. Respond to user feedback

## Next Steps

1. **Test thoroughly** on web and mobile
2. **Configure analytics** to track usage
3. **Set up monitoring** on backend
4. **Create app store listings** with screenshots
5. **Build and submit** to app stores
6. **Announce launch** to your users

---

**Questions?** Check the Expo documentation: https://docs.expo.dev
