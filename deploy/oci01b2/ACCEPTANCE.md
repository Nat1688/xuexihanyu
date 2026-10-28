# Mac First — Owner acceptance record (blank, NOT executed)

Snapshot/source-manifest SHA: ___; Mac/Colima version: ___; date/timezone: ___;
operator: ___; resource/disk preflight: ___; image digests/actual versions: ___.
Record PASS / FAIL / BLOCKED only from execution. Current rows all NOT_RUN for
this packaging revision; Owner-provided earlier ARM baseline is separate evidence.

| ID  | Execution criterion / evidence                                                                                                                      | Actual result                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| M01 | Verify frozen Windows export/source hashes, no Mac source edits; correct context/profile/ARM                                                        | NOT_RUN                                                             |
| M02 | Sequential multi-stage API/migrate/web build; native Prisma engine/versions; no host node_modules                                                   | NOT_RUN                                                             |
| M03 | Filtered context scan, image metadata/history/payload canary checks; cert/secrets outside source/images                                             | NOT_RUN                                                             |
| M04 | Separate Local Trial project/PG17 volume; no old disposable/LP01 mounts or PG host port                                                             | NOT_RUN                                                             |
| M05 | Migration job all9 successful; live200, ready200/database up                                                                                        | NOT_RUN                                                             |
| M06 | Frontend HTML/JS/CSS, /api errors not SPA fallback; loopback only                                                                                   | NOT_RUN                                                             |
| M07 | Trusted HTTPS browser login/logout/session expiry; Secure/Lax/host-only cookies, session HttpOnly, CSRF missing/invalid403 then valid success       | BLOCKED: synthetic account guard/provisioning approval + cert trust |
| M08 | Teacher dashboard/owned classes/roster/published lesson assignment, ownership denial; no answer-key leak                                            | BLOCKED: approved synthetic accounts/content/enrollments            |
| M09 | Student global Today/exercise/answer/result/reload-recovery, Teacher progress per existing contract; verify no invented assignment inbox/completion | BLOCKED: same prerequisites                                         |
| M10 | Preview discovery false/direct denial; PREVIEW_ONLY unchanged                                                                                       | NOT_RUN                                                             |
| M11 | Ledger fingerprint/counts before/after Trial-only container restart, wait for recovery                                                              | NOT_RUN                                                             |
| M12 | Approved maintenance restart Docker/Colima then same volume/ledger, HTTP+HTTPS healthy; inventory all affected workloads                            | NOT_RUN                                                             |
| M13 | Approved Mac reboot/login/autostart selected clp-arm64 profile, no assumed before-login/FileVault availability                                      | NOT_RUN                                                             |
| M14 | Sleep/network-wake/disk/memory/temperature policies reviewed; no automatic settings change                                                          | NOT_RUN                                                             |
| M15 | Quiesced encrypted backup outside source, checksum/key custody, resume Trial                                                                        | NOT_RUN                                                             |
| M16 | Fresh restore-check DB empty, restore transaction,18 table counts/9 migrations match; source intact                                                 | NOT_RUN                                                             |
| M17 | Wrong key/corrupt COPY refused before restore; nonempty restore refused, unchanged counts                                                           | NOT_RUN                                                             |
| M18 | Windows/iPad private HTTPS through separately approved Tailscale/LAN path; allowed/denied devices tested, no public/PG reachability                 | NOT_AUTHORIZED                                                      |
| M19 | Optional approved AMD64 rebuild/native generation and new disposable migration tests; no VPS deploy                                                 | DEFERRED                                                            |

M07–M09 may NOT be marked PASS using bare health200, mock fixtures, old platform
proof or unapproved manual account inserts. DS01 guard incompatible with persistent
Trial remains an explicit Owner decision, not an invitation to spoof env/DB names.
Source business logic/schema/Preview Gate remains fixed unless amended separately.

Evidence records: source hash + exact command (no secret args), image digest,
statuses/table counts/ledger hash, sanitized browser screenshots and steps. Never
record password, cookie, CSRF value, backup key, raw user rows or plaintext dump.
Do not use real student data; any artifacts with synthetic records stay private.

Overall decision: ___; blockers: ___; Owner permitted next action: ___; date: ___.
No autonomous execution, pilot, public access, commit, merge or deployment approval
is conferred by completing this template.
