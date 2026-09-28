# API Documentation — Video-On-Demand Backend (Expo / React Native Client)

For the mobile frontend developer integrating with this backend. Covers base config, Clerk auth flow, every endpoint, request/response shapes, error format, and data models.

## 1. Base Info

| Item | Value |
|---|---|
| Base URL (dev, simulator/emulator) | `http://localhost:<PORT>` (iOS simulator) / `http://10.0.2.2:<PORT>` (Android emulator) |
| Base URL (dev, physical device) | `http://<your-machine-LAN-IP>:<PORT>` — `localhost` will not resolve from a physical device |
| `PORT` | From server `.env` (`PORT`), defaults to `3000` if unset |
| Content-Type | `application/json` for all POST/PATCH bodies (except the Clerk webhook, which is server-to-server only and irrelevant to the frontend) |
| Auth scheme | `Authorization: Bearer <Clerk session token>` |
| Health check | `GET /health` → `{ "message": "Hello World! from server side" }` (not under `/api`, no auth) |
| Rate limits | 300 req / 15 min per IP on all `/api` routes; 50 req / 15 min per IP on `/api/webhooks/*` |
| CORS | `app.use(cors())` with no options — wide open, native app requests are unaffected regardless |

All application routes are mounted under `/api` (see `src/app.ts`). Full paths below already include this prefix.

## 2. Authentication — Clerk (Expo)

This backend does **not** implement its own username/password auth — it delegates identity to **Clerk**, and only verifies the Clerk session token sent by the client (`src/middleware/auth.ts`, using `@clerk/backend`'s `verifyToken`).

**On the Expo side:**
1. Install `@clerk/clerk-expo` and wrap the app in `<ClerkProvider publishableKey={...}>` (get `CLERK_PUBLISHABLE_KEY` from whoever manages the Clerk dashboard — it is a public key, safe to ship in the app).
2. Use Clerk's hooks (`useAuth()`, `useSignIn()`, `useSignUp()`, `useUser()`) to handle sign-up/sign-in UI — this backend does not expose `/register` or `/login` endpoints.
3. Once signed in, get the session token with `const { getToken } = useAuth(); const token = await getToken();` and attach it to every API request:
   ```
   Authorization: Bearer <token>
   ```
4. Clerk tokens are short-lived and auto-refreshed by the Clerk SDK — always call `getToken()` fresh before each request rather than caching it yourself.
5. On first sign-in, Clerk fires a `user.created` webhook to this backend (`POST /api/webhooks/clerk`, server-to-server, not called by the app) which provisions the `User`/`Profile`/`UserSettings` rows. As a fallback, `GET /api/me` also lazily provisions the user row if it's missing, so the app doesn't need to worry about a race between webhook delivery and first API call.

**Recommended Expo packages:**
| Package | Purpose |
|---|---|
| `@clerk/clerk-expo` | Auth (sign-in/up, session, token) |
| `expo-secure-store` | Required by `@clerk/clerk-expo` for token cache (native) |
| `axios` | HTTP client |
| `@tanstack/react-query` | Server state / caching |
| `expo-av` or `expo-video` | Video playback (HLS) |
| `expo-image-picker` | Selecting a video/avatar file to upload |
| `react-hook-form` + `zod` | Forms matching backend zod schemas |

## 3. Response Envelope

Every endpoint below (except `/health` and the Clerk webhook) returns one of these two shapes:

**Success**
```json
{ "success": true, "data": { /* endpoint-specific payload */ } }
```

**Error**
```json
{
  "success": false,
  "error": {
    "message": "Human readable message",
    "details": { /* optional — zod field errors or raw error, shape varies */ }
  }
}
```

`details` on validation errors (400s) is the `.properties` object from `z.treeifyError(...)` — a per-field tree of `{ errors: string[] }`. On 500s, `details` may be the raw underlying error and should not be shown to end users.

Note: `BigInt` fields (`viewCount`, `likeCount`, `commentCount`, `sizeBytes`, `durationMs`) are serialized as **strings** in JSON (a global `BigInt.prototype.toJSON` patch), not numbers — parse them with `Number()`/`BigInt()` client-side before doing math.

## 4. Endpoints

### 4.1 Current User — `GET /api/me`
Auth required. Returns (and lazily creates if missing) the caller's user record.

**Response 200**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "clerkUserId": "user_xxx",
      "role": "VIEWER",
      "accountStatus": "ACTIVE",
      "createdAt": "2026-09-27T10:00:00.000Z",
      "updatedAt": "2026-09-27T10:00:00.000Z",
      "deletedAt": null,
      "profile": {
        "id": "uuid",
        "userId": "uuid",
        "displayName": "Jane Doe",
        "username": "jane_doe",
        "avatarAssetId": null,
        "biography": null,
        "createdAt": "...",
        "updatedAt": "..."
      },
      "creatorProfile": null,
      "settings": {
        "id": "uuid",
        "userId": "uuid",
        "emailNotifications": true,
        "pushNotifications": true,
        "privateAccount": false,
        "preferredLanguage": "en",
        "createdAt": "...",
        "updatedAt": "..."
      }
    }
  }
}
```
`creatorProfile` is `null` until the user calls `POST /api/creator-profile`.

**401** if no/invalid token. **500** `{ message: "Failed to fetch user data" }` on unexpected failure.

---

### 4.2 Public Profile — `GET /api/users/:username`
No auth required.

**Response 200**
```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "uuid",
      "userId": "uuid",
      "displayName": "Jane Doe",
      "username": "jane_doe",
      "avatarAssetId": "uuid-or-null",
      "biography": "Hello!",
      "createdAt": "...",
      "updatedAt": "...",
      "user": { "role": "CREATOR", "accountStatus": "ACTIVE", "createdAt": "..." },
      "avatarAsset": { "id": "...", "container": "thumbnails", "blobPath": "...", "...": "MediaAsset fields" }
    }
  }
}
```

**404** if the profile doesn't exist or the account isn't `ACTIVE`:
```json
{ "success": false, "error": { "message": "No Profile found for username jane_doe. Account is blocked." } }
```

---

### 4.3 Update Own Profile — `PATCH /api/profile`
Auth required.

**Request body** (both optional, send only what changes)
```json
{ "displayName": "Jane D.", "biology": "New bio text" }
```
> ⚠️ Note the field is spelled `biology` in the request schema (`src/routes/profile.ts`), but the Prisma model field is `biography`. Send `biology` in the request — it is very likely a typo in the backend that should map to `biography`; confirm with the backend dev before relying on it, since as currently wired a `biology` value **will not** persist to the `biography` column (the service passes `updates` straight into `prisma.profile.update`, and the schema key doesn't match the DB field).

**Response 200**
```json
{ "success": true, "data": { "profile": { "...": "updated Profile row" } } }
```

**400** invalid body, **404** user/profile not found.

---

### 4.4 Become a Creator — `POST /api/creator-profile`
Auth required. One-time action; promotes the caller's role to `CREATOR` and creates a `CreatorProfile`.

**Request body**
```json
{ "channelName": "JaneDoeVlogs" }
```
`channelName`: string, 3–50 chars, must be globally unique.

**Response 200**
```json
{
  "success": true,
  "data": {
    "creatorProfile": {
      "id": "uuid",
      "userId": "uuid",
      "channelName": "JaneDoeVlogs",
      "verificationStatus": "UNVERIFIED",
      "status": "ACTIVE",
      "bannerAssetId": null,
      "aboutText": null,
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

**409** — already a creator, or channel name taken. **404** user not found.

---

### 4.5 Avatar Upload (2-step) — `POST /api/profile/avatar` then `POST /api/profile/avatar/confirm`
Auth required. Uploads go **directly from the device to Azure Blob Storage** via a short-lived SAS URL — the file bytes never pass through this backend.

**Step 1 — request an upload URL**

`POST /api/profile/avatar`
```json
{ "fileExtension": ".jpg" }
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://<account>.blob.core.windows.net/thumbnails/avatars/<userId>/<uuid>.jpg?<SAS-token>",
    "blobName": "avatars/<userId>/<uuid>.jpg",
    "container": "thumbnails"
  }
}
```

**Step 2 — client uploads the file directly to `uploadUrl`** (e.g. `PUT` the raw bytes with `fetch(uploadUrl, { method: 'PUT', headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': <mimeType> }, body: fileBytes })`).

**Step 3 — confirm the upload**

`POST /api/profile/avatar/confirm`
```json
{ "blobName": "avatars/<userId>/<uuid>.jpg" }
```

**Response 200**
```json
{ "success": true, "data": { "profile": { "...": "Profile row with avatarAssetId now set" } } }
```

**400** if the blob doesn't actually exist in storage (upload failed/was skipped).

---

### 4.6 Video Upload (2-step) — `POST /api/videos/init` then `POST /api/videos/:videoId/complete`
Auth required, **creator-only** (must have called `POST /api/creator-profile` first). Same direct-to-Azure pattern as avatars.

**Step 1 — initialize**

`POST /api/videos/init`
```json
{
  "title": "My First Vlog",
  "description": "Optional description",
  "type": "LONG_FORM",
  "visibility": "PUBLIC",
  "categoryId": "optional-uuid",
  "fileExtension": "mp4",
  "mimeType": "video/mp4"
}
```
| Field | Rules |
|---|---|
| title | string, 1–200 chars |
| description | optional, ≤5000 chars |
| type | `LONG_FORM` \| `SHORT_FORM` |
| visibility | optional, `PUBLIC` \| `UNLISTED` \| `PRIVATE` (default `PUBLIC`) |
| categoryId | optional uuid |
| fileExtension | 1–10 chars |
| mimeType | required string (currently accepted but not stored — see gaps) |

**Response 200**
```json
{
  "success": true,
  "data": {
    "videoId": "uuid",
    "assetId": "uuid",
    "uploadUrl": "https://<account>.blob.core.windows.net/originals/<creatorId>/<uuid>.mp4?<SAS-token>",
    "blobPath": "<creatorId>/<uuid>.mp4",
    "container": "originals"
  }
}
```

**403** if the caller isn't a creator yet.

**Step 2 — client uploads the raw video file directly to `uploadUrl`**, same `PUT` pattern as the avatar flow.

**Step 3 — mark upload complete / trigger processing**

`POST /api/videos/:videoId/complete`

**Response 200** — the updated video row, status flips to `PROCESSING` and a background job (transcoding, thumbnailing) is enqueued. Poll `GET /api/videos/:videoId` or `GET /api/videos/mine` to watch `status` move to `READY`/`FAILED`.
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "creatorId": "uuid",
    "type": "LONG_FORM",
    "title": "My First Vlog",
    "status": "PROCESSING",
    "...": "rest of Video fields"
  }
}
```

**400** if the file was never actually uploaded to the SAS URL. **403** not your video. **404** video not found.

---

### 4.7 List My Videos — `GET /api/videos/mine`
Auth required, creator-only.

**Response 200**
```json
{ "success": true, "data": { "videos": [ { "...": "Video row" }, "..." ] } }
```
Ordered newest first, excludes soft-deleted (`deletedAt`) videos.

---

### 4.8 Get a Video — `GET /api/videos/:videoId`
Auth optional (send the Bearer token if the user is logged in so private/owner checks work). Public videos are visible to anyone; `PRIVATE` videos are visible only to their owning creator; the endpoint returns a `404` (not `403`) for private videos to avoid revealing existence to non-owners.

**Response 200**
```json
{
  "success": true,
  "data": {
    "video": {
      "id": "uuid",
      "creatorId": "uuid",
      "type": "LONG_FORM",
      "title": "My First Vlog",
      "description": "...",
      "visibility": "PUBLIC",
      "status": "READY",
      "durationMs": "123456",
      "viewCount": "42",
      "likeCount": "3",
      "commentCount": "0",
      "publishedAt": null,
      "createdAt": "...",
      "updatedAt": "...",
      "creator": { "id": "uuid", "channelName": "JaneDoeVlogs", "user": { "...": "User row" } },
      "originalAsset": { "...": "MediaAsset row" },
      "thumbnailAsset": null
    }
  }
}
```
Note: this response does **not** currently include `variants` (the transcoded HLS renditions) — see gaps below; the frontend cannot get a playable HLS URL from this endpoint alone yet.

---

### 4.9 Update Video Metadata — `PATCH /api/videos/:videoId`
Auth required, must be the owning creator.

**Request body** (all optional)
```json
{ "title": "New title", "description": "New description", "visibility": "UNLISTED", "categoryId": "uuid" }
```

**Response 200**
```json
{ "success": true, "data": { "video": { "...": "updated Video row" } } }
```

**404** if not found or not owned by caller.

## 5. Enums (Prisma)

| Enum | Values |
|---|---|
| `UserRole` | `VIEWER`, `CREATOR` |
| `AccountStatus` | `ACTIVE`, `SUSPENDED`, `DEACTIVATED` |
| `CreatorVerificationStatus` | `UNVERIFIED`, `VERIFIED` |
| `CreatorStatus` | `ACTIVE`, `SUSPENDED` |
| `VideoType` | `LONG_FORM`, `SHORT_FORM` |
| `Visibility` | `PUBLIC`, `UNLISTED`, `PRIVATE` |
| `VideoStatus` | `DRAFT`, `UPLOADING`, `UPLOADED`, `PROCESSING`, `READY`, `SCHEDULED`, `PUBLISHED`, `FAILED`, `DELETED` |
| `MediaAssetType` | `ORIGINAL_VIDEO`, `ORIGINAL_IMAGE`, `THUMBNAIL`, `PREVIEW_CLIP`, `HLS_MASTER_MANIFEST`, `AVATAR`, `OTHER` |
| `AssetStatus` | `PENDING`, `UPLOADING`, `UPLOADED`, `PROCESSING`, `READY`, `FAILED`, `DELETED` |
| `VideoVariantStatus` | `PENDING`, `PROCESSING`, `READY`, `FAILED` |

## 6. Data Models Reference (key fields only — see `prisma/schema.prisma` for the full source of truth)

- **User**: `id`, `clerkUserId`, `role`, `accountStatus`, timestamps → has one `profile`, one `settings`, optional `creatorProfile`.
- **Profile**: `displayName`, `username` (unique, used in `/api/users/:username`), `biography`, `avatarAssetId`.
- **CreatorProfile**: `channelName` (unique), `verificationStatus`, `status`, `bannerAssetId`.
- **Video**: `title`, `description`, `type`, `visibility`, `status`, counters (`viewCount`/`likeCount`/`commentCount` as BigInt strings), asset refs (`originalAssetId`/`thumbnailAssetId`/`previewAssetId`/`hlsManifestAssetId`).
- **VideoVariant**: transcoded renditions per video (`label`, `width`, `height`, `bitrateKbps`, `status`) — not yet exposed via any endpoint.
- **MediaAsset**: storage metadata only (`container`, `blobPath`, `mimeType`, `sizeBytes`) — never raw bytes.
- Social/engagement models exist in the schema (`Follow`, `VideoLike`, `Comment`, `CommentLike`, `SavedVideo`, `WatchLater`, `WatchHistory`, `WatchProgress`, `Notification`) but **have no routes yet** — see gaps below.

## 7. Known Gaps / Things to Confirm With Backend Dev

- **No sign-up/sign-in/logout endpoints** — all identity is handled client-side via the Clerk Expo SDK; this backend only verifies tokens.
- **`PATCH /api/profile` field name mismatch**: request schema uses `biology`, Prisma model uses `biography` — as written, updates to bio will silently no-op. Needs a backend fix (rename `biology` → `biography` in `updateProfileSchema`).
- **No HLS/playback URL exposed yet**: `GET /api/videos/:videoId` returns asset *metadata* (blob paths) but not a playable stream URL, and doesn't include `variants`. The frontend video player can't be wired up against this endpoint until that's added.
- **No feed/discovery/search endpoints** (no "list public videos", no category/tag browsing, no search) — only `mine` (creator's own) and single-video lookup by id.
- **No social features wired up**: like, comment, follow, save/watch-later, watch history/progress, notifications all exist in the DB schema but have zero routes currently.
- **`mimeType` on video init** is accepted by the request schema but not persisted anywhere in `VideoService.initUpload` (only `fileExtension` ends up in the blob path) — likely intended for the `MediaAsset.mimeType` column, currently dropped.
- **Video visibility `PRIVATE` returns 404 not 403** for non-owners — intentional (avoids leaking existence), but worth flagging so the frontend doesn't treat 404 as "never existed" when building error messages for the owner's own broken links.
- Rate limiting is IP-based and fairly generous (300/15min) but will affect shared dev environments / simulators behind NAT — expect occasional `429`s in heavy testing.
