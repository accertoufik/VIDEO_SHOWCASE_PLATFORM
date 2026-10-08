# Tamasha: device QA checklist

Tick each item on a real phone against the real backend. Log anything that fails in the table at the bottom, fix it, then
re-run the whole flow (not just the failed step).

**Already verified by script (no need to repeat):** `tsc --noEmit` clean (frontend + backend), Android export builds,
`expo-doctor` 21/21, `bun scripts/check-contrast.ts` 0 failing pairs, 34 login-required endpoints answer 401 without a
token, no raw colours or stray `console.log` outside `src/css`.

## Before you start
- [ ] Backend running (`bun run dev`) and the worker running (local or the Azure container, never both).
- [ ] `EXPO_PUBLIC_API_BASE_URL` is an address the phone can reach (LAN IP or the deployed HTTPS URL, not `localhost`).
- [ ] Dev or release build installed (rebuild after native changes: app name, splash, navigation bar).
- [ ] Test files: a 20 s 720p clip, a 1-2 min 1080p clip, a vertical 9:16 clip under 60 s, a square clip under 60 s
      (must land in Shorts), a JPG for a thumbnail.
- [ ] Two accounts: `creator` and `viewer` (second phone or emulator for the viewer).

## A. Signed out
- [ ] Home opens with no sign-in wall; scrolling to the end loads more once, no duplicates.
- [ ] Search finds a word that exists; a nonsense word shows an empty state, not an error.
- [ ] Category, Trending, a creator's channel (Videos / Shorts swipe), a video and Shorts all open and play.
- [ ] Like / comment / save / follow / download-needing-account each open sign-in; nothing is applied.
- [ ] Dismissing sign-in returns to the same screen.
- [ ] Library, History, Notifications are gated, not crashing.
- [ ] A removed or private video link shows the "This video isn't available" page with Go to Home / Go back.

## B. Viewer
- [ ] Sign up with email: code boxes, auto-submit at 6 digits, Resend counts down 45 s, lands signed in, profile popup appears.
- [ ] Username check shows available / taken live; after saving it cannot be changed (Edit profile shows it locked).
- [ ] Remember me ticked: email is pre-filled after Sign out. It never signs you out on its own.
- [ ] Like, unlike, comment, reply, delete your comment (one tap), counts update at once and persist.
- [ ] Follow / unfollow from a channel: instant, Following count on Profile updates, no double-tap needed.
- [ ] Save a video; it appears in Saved. Watch 20 s; History and Continue watching show it and resume near where you left.
- [ ] Download a video; plays in airplane mode; delete it. Downloads are per account (switch account: other list).
- [ ] Notifications list, mark all read, Clear all (red trash icon, top right) asks first.
- [ ] Settings: autoplay, default quality, haptics persist after killing the app. Switch account and Delete account work;
      after deleting, the same username can be registered again.
- [ ] Sign out then sign in as someone else: nothing from the first account is visible.
- [ ] Airplane mode on an already-loaded list: offline pill shows, cached content stays, refreshes when back online.
- [ ] Library and Studio tabs: swipe between sections, swipe on a Overview tile row scrolls the row (not the page).

## C. Creator
- [ ] "+" as a viewer opens Become a creator (banner + about optional); creates the channel named after your username.
- [ ] Banner upload works; the channel page shows it.
- [ ] "+" as a creator opens Create: Upload video, Create Short, Creator Studio.
- [ ] Upload with title, category and a custom thumbnail (crop screen opens, upload succeeds). Cancelling mid-way leaves no
      stuck entry.
- [ ] Content tab: processing, then "Ready to publish" without a manual refresh; a toast when it's ready.
- [ ] **Open the unpublished (Private) video from Content: it plays, "Up next" shows no error.**
- [ ] Publish as Public. A follower on the second phone sees the notification and the video.
- [ ] A 1:1 or 9:16 clip up to 60 s appears under Shorts, not Videos. A 16:9 clip does not.
- [ ] Studio Overview: top performing lists only published, public videos. Analytics range chips change the chart.
- [ ] A comment from the viewer shows in Studio Comments; removing it removes it for the viewer.
- [ ] Edit title/description; delete a video (confirms, disappears everywhere).
- [ ] An oversized or wrong-type file is rejected with a clear message and nothing half-created.

## D. HD upgrade (use the 1080p clip)
- [ ] Publish as soon as it's READY (480p/720p done, 1080p still encoding): plays; quality menu lists only ready rungs
      and says HD isn't available yet.
- [ ] When 1080p finishes, a toast says HD is ready; the menu now lists 1080p; playback did not restart.
- [ ] Auto keeps its current quality (known: it does not switch mid-session); choosing 1080p explicitly loads it and resumes.
- [ ] Reopening the video later lists 1080p immediately. The Content row's "HD processing" label disappears.

## E. Player and Shorts
- [ ] Seek, +/-5 s, speed, quality, captions (for a file with subtitles), fullscreen rotates to landscape and hides the
      phone's navigation buttons, Back returns to portrait.
- [ ] Only one video plays at a time; opening another pauses the first. Controls hide after 3 s (not with a screen reader on).
- [ ] Shorts: swipe up/down, loops, next short is preloaded, comments open without pausing, typing a comment does not
      jump to the next short, tap pauses/resumes.
- [ ] Two phones watching the same video at once stream smoothly.

## F. Accessibility (TalkBack on Android, VoiceOver on iPhone)
- [ ] Each video card reads title, channel, views and length as one item.
- [ ] Every icon-only button has a name; Bell says how many are unread; Like and Save say selected / not selected.
- [ ] Screen titles are headings; sheets (Publish, Edit, Comments, Settings menu) trap focus.
- [ ] Seek bar: swipe up/down jumps 10 s and speaks the position. Shorts: "Previous short" / "Next short" buttons appear.
- [ ] Form errors show an icon and text, not red alone; toasts and "HD ready" are announced.
- [ ] Largest system font: no clipped text or overlapping controls on Home, Video, Upload, Studio, sign-in.
- [ ] Reduce Motion: no press scale, no image fade. Reduce Transparency (iOS): glass becomes solid.
- [ ] Small controls (chips, icon buttons) can be hit with a thumb.

## Cross-cutting
- [ ] Kill the app mid-upload and reopen: no crash.
- [ ] Rotate on the video screen: no crash; stop the API: error screens say Try again and recover.
- [ ] Large counts show as 1.2M style. Low-end Android: Home and Shorts stay smooth.
- [ ] Session expiry: the app asks you to sign in again instead of looping.

## Defect log
| ID | Flow / step | Severity (blocker / major / minor) | What happened | Expected | Owner file | Status |
|----|-------------|-----------------------------------|---------------|----------|------------|--------|
|    |             |                                   |               |          |            |        |

Blocker = a flow can't finish or data is lost. Major = wrong result with a workaround. Minor = cosmetic.
