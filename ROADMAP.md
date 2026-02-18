# OpenVox Roadmap

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.0.1 | TBD | Version reset, Docker versioning |

---

## Phase 1: Infrastructure (Complete ✓)

- [x] Version bump to 0.0.1
- [x] Docker image versioning (semver tags)
- [x] Dockerfile version label

---

## Phase 2: Multi-User Support

### 2.1 Database Schema Changes

Add user isolation to existing tables:

```sql
-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    password_hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Add user_id to existing tables
ALTER TABLE sources ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE episodes ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE folders ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE settings ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE playback_state ADD COLUMN user_id TEXT REFERENCES users(id);
```

### 2.2 Authentication (better-auth)

Implement using [better-auth](https://www.better-auth.com/):

- [ ] Email/password authentication
- [ ] Passkeys/WebAuthn support
- [ ] Session management
- [ ] User registration/login UI
- [ ] Password reset flow

### 2.3 API Changes

- [ ] All `/api/studio/*` endpoints require authentication
- [ ] Filter endpoints by `current_user.id`
- [ ] Add user context to all database queries

### 2.4 Frontend Changes

- [ ] Login page
- [ ] User menu (avatar, logout)
- [ ] Session persistence

---

## Phase 3: Additional Features

### 3.1 Share Episodes

- [ ] Generate unique public URLs for episodes
- [ ] Public episode viewer (no auth required)
- [ ] Optional password protection

### 3.2 Team Workspaces

- [ ] Create workspaces
- [ ] Share folders with workspace members
- [ ] Role-based access (owner, editor, viewer)

### 3.3 API Tokens

- [ ] Generate API tokens for programmatic access
- [ ] Token management UI
- [ ] Rate limiting per token

### 3.4 Webhooks

- [ ] Configure webhook URLs
- [ ] Events: episode completed, source imported, generation failed
- [ ] Webhook retry logic

### 3.5 Podcast RSS Export

- [ ] Generate RSS feed for episodes
- [ ] iTunes podcast tags support
- [ ] Public feed URL

---

## Future Considerations

- [ ] SQLite → PostgreSQL migration (optional)
- [ ] Multi-container deployment (separate TTS workers)
- [ ] Voice cloning UI
- [ ] Transcript editing
- [ ] Browser extension for "listen to this page"
