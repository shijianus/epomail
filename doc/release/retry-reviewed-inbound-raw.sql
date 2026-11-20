-- Run on the authoritative mail database under a confirmed maintenance window.
-- Bind ?1 to the single claim key and ?2 to its observed cleanup_review_at (Unix seconds).
UPDATE mail_receive_claim
SET cleanup_attempts = 0, cleanup_retry_at = 0, cleanup_review_at = 0,
    last_error = CASE WHEN last_error = 'raw_cleanup_failed' THEN NULL ELSE last_error END
WHERE claim_key = ?1 AND cleanup_review_at = ?2 AND cleanup_review_at > 0
  AND raw_object_key <> '' AND raw_expires_at <= unixepoch() AND lease_until <= unixepoch()
RETURNING cleanup_attempts, cleanup_retry_at, cleanup_review_at;
