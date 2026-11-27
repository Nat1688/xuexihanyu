# DICT07-P — Xuất bản theo nhóm chuyên ngành

Owner mở task bằng yêu cầu thêm nút xuất bản và chọn “Theo toàn bộ nhóm chuyên ngành”. Kế thừa DICT01 ADR/API CMS reserved; giới hạn ở xuất bản/gỡ xuất bản và xác nhận quyền nguồn cần thiết, không triển khai full CMS, notebook hoặc thay learning engine.

Worktree codex/dict07-publication: b191d162 + frozen517-file DICT02–04/UI06 source. Không sửa bản đã deploy hoặc worktree cũ. Không schema/migration/dependency mới. Không tự xuất bản corpus thật; runtime rollout cần bàn giao review riêng.

ADMIN chọn một category cụ thể (gồm descendants), xem preview counts/trạng thái/quyền nguồn. POST có fingerprint từ preview, explicit confirmation và ghi chú rà soát khi xuất bản. Publish kiểm tra mọi nguồn liên quan có rights CONFIRMED với evidence, nhóm active và mọi mục từ có meaning/provenance. ADMIN phải tự xác nhận đã rà soát toàn bộ nội dung; agent không ký thay. Hệ thống lưu actor/time/revision/audit. Không âm thầm xuất bản subset.

Mục từ có identity dùng chung: xuất bản/gỡ tác động toàn mục từ ở mọi category liên quan. UI phải cảnh báo và cho biết số mục nhiều nhóm. Max25000 mục/thao tác, vượt giới hạn phải chọn nhóm nhỏ hơn; không truncate. Gỡ giữ lịch sử, nghĩa/nguồn và editorial verification.

Scope preview/read-only; writer dùng chung import lock8312601 + taxonomy lock8312602, cùng Prisma transaction, fingerprint chống stale/membership/source changes, append-only revision/audit và rollback atomic. Auth/RBAC/CSRF/no-store giữ nguyên. Teacher/Student không được mutate, không internal IDs/rights evidence lộ qua learner API.

Acceptance: category/subtree/shared-membership; publish/unpublish learner search/detail/count; missing rights/review/category errors; stale/concurrent attempts; audit rollback; source revoke; denied HTTP requests không write; mobile/keyboard Vietnamese UI; targeted rồi full API/Web/lint/typecheck/build/secret/diff; PostgreSQL mới trong target disposable dictionary đã duyệt, không dùng homelab để test. Không commit/push/merge/deploy hoặc publication live tự động.
