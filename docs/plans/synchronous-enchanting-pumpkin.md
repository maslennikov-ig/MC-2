# Plan: Fix KVU-2757 stuck on Stage 5 — Jina API key mismatch on Staging

## Context

Course "Основы систематизации бизнеса" (`4137fa0f`) is stuck at `generation_status = stage_5_generating`
on staging (ai.megacampus.ru). Stage 5 generated all 5 sections successfully, but failed on
`validate_quality` phase with:

> Insufficient account balance. Top up your account at https://jina.ai/api-dashboard/key-manager.

**Root cause**: Staging server uses an old Jina API key (`jina_f088...ZUiM`) from `.env.production`,
while the correct (funded) key is `jina_6666...bnvA`.

| Location                  | Key                | Status           |
| ------------------------- | ------------------ | ---------------- |
| Local `.env`              | `jina_6666...bnvA` | Correct (funded) |
| Staging `.env.production` | `jina_f088...ZUiM` | Old (no balance) |

## Plan

### Step 1: Update Jina API key on staging server

```bash
ssh megacampus-prod
cd /opt/megacampus
# Edit .env.production: replace JINA_API_KEY value
sed -i 's/JINA_API_KEY=jina_f088849b6be445a797f289a02b620b26fT5Wb8au4otbhd1TWS8-l9ibZUiM/JINA_API_KEY=jina_6666b6c2cf7449b7805b25e37a55d3b9esybOrt9R1rTPiUvpFpNEoI4bnvA/' .env.production
```

### Step 2: Also update local deploy cache

**File**: `.tmp/deploy/.env.production` (line 37)

### Step 3: Restart API + Worker to pick up new key

```bash
ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.production.yml restart api worker"
```

### Step 4: Restart Stage 5 for the stuck course

User restarts Stage 5 from the UI, or via direct API call.

### Step 5: Verify completion

```sql
SELECT generation_status FROM courses WHERE id = '4137fa0f-8143-4da0-9755-fa1dc987a35f';
-- Should progress past stage_5_generating
```

## Verification

- [ ] New Jina key deployed to staging `.env.production`
- [ ] API + Worker restarted
- [ ] Stage 5 completes for course 4137fa0f
- [ ] Stage 6 starts automatically
