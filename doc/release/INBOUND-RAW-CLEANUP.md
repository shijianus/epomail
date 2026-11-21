# Inbound raw MIME retention and manual review

Expired raw MIME cleanup retries four times after delays of 5, 10, 20 and 40 minutes. The fifth owned failure places that claim in manual review and stops scheduled attempts on it. The original storage locator and any deduplication checkpoint remain durable. The next maintenance tick processes other due claims as usual. Losing a lease does not consume an attempt.

Configure the staging or production log alert for the structured event `inbound_raw_cleanup_review_required`. Its `reviewAdded` field counts new manual-review entries in that sweep. Each subsequent sweep repeats the alert while a reviewed claim remains, even if no new failure occurs. Group repeated events into the same incident. The event contains aggregate counts only. The privileged `POST /api/setting/storage/scan` report exposes `data.inboundRawCleanup` with the retrying count, manual-review count and oldest review time in UTC. Alert when `manualReview > 0` persists or when its measurement status is `unknown`. A failed scheduled task also emits `maintenance_failed` with task `inbound_raw_cleanup`.

For an existing installation, bind the candidate maintenance instance to the target databases with business routes and Cron paused, run the privileged `POST /api/init` with `X-Init-Secret`, and confirm the columns and partial indexes are present in the mail database before switching traffic. The ordinary upgrade chain (`v3_24DB`) and cold initialization both invoke the idempotent reliability schema migration. An old deferred failure begins with one known attempt. Its already scheduled retry time is preserved.

## Repair one claim

1. In an approved maintenance window, pause inbound delivery and scheduled invocations for the target installation and wait for in-flight work to drain. Use privileged access to its authoritative **mail** database. Identify the affected claim internally, using this bounded query. Keep claim keys out of public alerts and tickets.

   ```sql
   SELECT claim_key, cleanup_attempts, cleanup_review_at
   FROM mail_receive_claim
   WHERE raw_object_key <> '' AND cleanup_attempts > 0 AND cleanup_review_at > 0
   ORDER BY cleanup_review_at, rowid LIMIT 25;
   ```

2. Repair the underlying storage access, checksum recovery or D1 finalization problem. For a legacy completed claim lacking its content digest, recover the authentic raw message from the approved backup. If recovery is impossible, leave the item in review and escalate the retention incident.
3. Execute the parameterized [single-claim reset](retry-reviewed-inbound-raw.sql), binding the selected claim key and the exact observed review timestamp. Expect one returned row with three zeroes. An empty result means the review changed, a lease is active, or the claim is no longer eligible. Recheck the row before proceeding. The reset releases only the cleanup hold and keeps the object's locator and the mail delivery timestamp.
4. Resume the scheduled worker and delivery. After the next sweep, confirm the selected claim has either been removed or has an empty raw locator, and check the aggregate manual-review count. A new storage failure starts a new retry cycle.
