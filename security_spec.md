# Security Specification: GameContent AI Publisher

## 1. Data Invariants
- A User must have a profile document at `/users/{userId}` created upon first login.
- `APIKey` and `Website` documents must always have a valid UID matching the `userId` in the path.
- `Article` and `KeywordBatch` documents are private to the user who created them.
- Timestamps (`createdAt`) must be server-generated.

## 2. The "Dirty Dozen" Payloads (Red Team Tests)
1. **Identity Spoofing**: Attempt to create an API key for another user's ID.
2. **Key Poisoning**: Attempt to inject a 1MB string into the `key` field of an APIKey.
3. **Admin Escalation**: Attempt to set a `role: 'admin'` field on a user profile. (Admin not implemented yet, but should be blocked).
4. **Keyword Injection**: Attempt to create a batch with 10,000 keywords to exhaust storage.
5. **PII Leak**: Attempt to read another user's email from `/users/{userId}`.
6. **Cross-User Delete**: Attempt to delete another user's `Website` credential.
7. **Bypass Verification**: Attempt to write data as a user with an unverified email.
8. **Shadow Field**: Adding a `verified: true` field to an Article to bypass moderation (if it existed).
9. **URL Mutation**: Changing a `siteUrl` in a `Website` doc that doesn't belong to the user.
10. **Batch Hijacking**: Adding articles to a `batchId` that belongs to someone else.
11. **Script Injection**: Using `<script>` tags in article content (handled by UI, but DB should constrain size).
12. **Status Skipping**: Manually setting an article status to `published` without a `wpPostId`.

## 3. Test Runner (Draft)
A `firestore.rules.test.ts` will verify these constraints.
