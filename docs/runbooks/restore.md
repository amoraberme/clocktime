# Restoring the ClockTime database

ClockTime has two independent recovery paths:

| Path                                                              | Covers                                    | Recovery point                     | Kept for                                      |
| ----------------------------------------------------------------- | ----------------------------------------- | ---------------------------------- | --------------------------------------------- |
| **Neon point-in-time restore** (primary)                          | Bad deploy, accidental delete, corruption | Any second in the retention window | Per Neon plan (7 days on Launch, 30 on Scale) |
| **Nightly encrypted dump in R2** (`.github/workflows/backup.yml`) | Loss of the Neon project or account       | Last nightly run (02:17 Manila)    | 35 days (R2 lifecycle rule)                   |

Target: restore within **4 hours** (RTO). Data loss is **seconds** with Neon PITR, or **up to 24 hours** from the dump (RPO).

## 1. Point-in-time restore on Neon (most incidents)

1. Stop writes:
   - Disable the cron jobs in Vercel (**Settings → Cron Jobs**).
   - Tell customers to hold punches. Phones and kiosks queue offline and sync later without duplicates.
   - Terminals keep their logs and re-upload from their ATTLOG stamp.
2. In the Neon console, go to **Branches → Restore**. Pick the timestamp just before the incident and restore it to a **new branch**, not over `main`.
3. Check the new branch with `psql`. Look at the row counts for `"TimeEntry"`, `"Punch"` and `"PayRun"`, and at the latest `"AuditLog"`.
4. Point `DATABASE_URL` in Vercel at the restored branch. Use the pooled string for the app and the direct one for migrations. Redeploy.
5. Run `pnpm exec prisma migrate deploy` against the branch. It should report nothing to apply.
6. In the app, go to **Settings → Audit log → Verify integrity** for a sample of companies.
7. Write up the incident:
   - Under the Data Privacy Act, notify the NPC and affected customers within **72 hours** if personal data was compromised.
   - Use the audit trail and the Neon history to work out the scope.

## 2. Restoring from the nightly dump (Neon unavailable)

You need:

- R2 read credentials
- `BACKUP_PASSPHRASE`, kept in the password manager and never in the repo
- A Postgres 16 server: a new Neon project, or any managed Postgres

```bash
# Download and check the latest backup
aws s3 ls s3://$BUCKET/backups/ --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com | tail -4
aws s3 cp s3://$BUCKET/backups/<file>.dump.gpg . --endpoint-url ...
aws s3 cp s3://$BUCKET/backups/<file>.dump.gpg.sha256 . --endpoint-url ...
sha256sum -c <file>.dump.gpg.sha256

# Decrypt (asks for the passphrase) and restore into an empty database
gpg --decrypt <file>.dump.gpg > clocktime.dump
pg_restore --no-owner --no-privileges --jobs 4 -d "$NEW_DATABASE_URL" clocktime.dump

# Bring the schema up to date, then switch the app over
DATABASE_URL="$NEW_DATABASE_URL" pnpm exec prisma migrate deploy
```

Then do steps 4–7 above. Delete the local `clocktime.dump` securely when you're done (`shred -u clocktime.dump`).

## 3. Drills

- **The nightly job checks itself:** it decrypts each archive and lists its tables, and fails loudly if the dump is tiny.
- **Quarterly:** restore the latest dump into a scratch Neon branch. Open the app against it and verify the audit chain. Record the time taken.
- **Secret rotation:** after rotating `BACKUP_PASSPHRASE`, run the workflow manually and confirm the new archive decrypts.

## Uploaded files

Payslip PDFs and punch photos live in R2 object storage, not in the database.

- Enable R2 bucket versioning, or replicate the bucket, if you need those restorable too.
- Photos are deleted on purpose after each company's retention period.
