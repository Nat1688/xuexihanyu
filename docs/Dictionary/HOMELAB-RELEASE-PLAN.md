# Kế hoạch triển khai homelab — chưa được phép thực thi

Trạng thái hiện tại: **NO-GO cho persistent rollout**, chờ Independent Review và acceptance Linux/backup/adapter. Không có migration, import, image build/replacement hoặc cấu hình mạng nào trên homelab được thực hiện trong DICT02–04.

Target đã xác minh read-only: vaio-homelab Debian x86_64, Compose clp-homelab, database clp_homelab, Web127.0.0.1:8083, public origin https://xuexihanyu.online. Mac không còn thuộc hệ thống; không sử dụng Colima/M06/M07.5 làm kế hoạch hiện tại.

## Gaps cần giải quyết trước rollout

1. Source `deploy/oci01b2/runtime.cjs` chỉ nhận profiles disposable/local-trial của lịch sử Mac. Image API đang chạy có adapter homelab được nghiệm thu riêng. **Không chạy nguyên image mới với profile Mac, không bypass guard bằng entrypoint để migrate DB thật.** Phải đóng gói lại đúng adapter homelab đã kiểm chứng hoặc review amendment profile homelab trước runtime acceptance.
2. `deploy/oci01b2/database.cjs` là công cụ backup JSON schema10/11 và Mac context, không được coi là schema12 backup tool. Không nới wildcard/đổi tên DB để vượt guard. Homelab dùng quy trình pg_dump encrypted/restore đã được Owner duyệt; cần fresh backup và restore proof bao phủ schema12 trước release.
3. Native Linux AMD64 API/migrate/Web images, Prisma Linux31-model client và Nginx upload/read-only behavior chưa được chạy ở checkpoint này. Windows build/PG không thay thế các gate đó.
4. Quyền pg_trgm trên target và checksum ledger11 thực cần kiểm tra trước migration. Không giả health database up là schema compatibility.

## Chuẩn bị source/image sau khi Owner duyệt

Dùng frozen source ZIP/manifest; không lấy remote main cũ hoặc Git HEAD b191d162 đơn lẻ vì UI06/dictionary là uncommitted overlay. Không copy Windows node_modules/dist vào Linux build.

Lệnh build tham khảo, thực thi tuần tự trên build host được duyệt, không chạy services:

```sh
docker build --platform linux/amd64 --target runtime -f deploy/oci01b2/api.Dockerfile -t xuexihanyu-api:dict-review .
docker build --platform linux/amd64 --target migrate -f deploy/oci01b2/api.Dockerfile -t xuexihanyu-migrate:dict-review .
docker build --platform linux/amd64 -f deploy/oci01b2/web.Dockerfile -t xuexihanyu-web:dict-review .
```

Các lệnh trên là build, chưa phải startup/migration plan. Runtime profile gap ở trên phải được giải quyết; không publish images. Prisma generate chạy trong Linux build, entrypoint API giữ dist/src/main.js. Web giữ USER nginx/read-only/cap-drop/no-new-privileges. Ba config Nginx được COPY --chmod0644 theo correction R4 đã được Owner duyệt trước đây.

Body budget16m/150s chỉ trên hai exact admin import locations; auth/content còn64k. Cần smoke test config/read-only/proxy-health/ready và upload thực qua proxy. Cloudflare/proxy timeout có thể ngắn hơn transaction120s; request timeout không chứng minh rollback. Retry cùng checksum an toàn nhưng không hứa upload lớn luôn hoàn thành dưới timeout trên i3. Không tự thêm queue/background worker.

## Pre-upgrade và rehearsal

- Giữ API/Web hiện tại, image IDs, private env, volume names và backup artifacts. Không đọc/xuất secrets vào report.
- Resource preflight CPU/RAM/swap/disk; không chạy song song build/import/load test trên host4GB đang phục vụ người dùng.
- Xác minh đúng project/db/user/version17, 11successful migrations, source checksums và no unexpected schema. Fail thì dừng.
- Fresh encrypted logical backup qua quy trình OPS hiện hành; key ngoài repository, SHA256 receipt và restore vào target trống riêng được Owner duyệt. Không dùng backup Mac đã mất.
- Rehearse migration12 trên restored clone, so fingerprint19business tables trước/sau. Kiểm tra12dictionary tables/FKs/triggers/indexes và ledger12. Đã có synthetic rehearsal; chưa có rehearsal clone từ backup live hiện tại.
- Chứng minh old approved API/Web pair vẫn chạy trên clone schema12 trước cho phép rollback application. Đây là gate chưa chạy, không chỉ suy luận additive schema.

## Rollout sau separate approval

Đây là **paired API + Web + additive database migration**, không phải Web-only update như UI06. Chỉ apply migration12 đã review, không sửa migration1–11. Không reset/drop/truncate hoặc seed/provision accounts. Giữ origins/cookies/CSRF/Cloudflare/Tailscale/ports/database volume hiện tại.

Sau schema verification, thay đúng API/Web images đã được duyệt; migration one-shot trên target identity được kiểm tra, không tự restart DB. Health, auth, roles, admin import dry-run, visible dictionary predicate và existing class/exercise/recovery UAT cần chạy. Dữ liệu thật chỉ nhập INTERNAL sau approval riêng; không xuất bản corpus nếu thiếu rights/specialist approval.

## Rollback và recovery

Giữ migration12 và dictionary data khi rollback API/Web về paired release đã chứng minh compatible. Ẩn dictionary entry points bằng Web cũ; không downgrade về API thiếu admissions/CP05 security. Không DROP các bảng mới để rollback UI. Nếu migration/ledger không đúng, dừng rollout và bảo toàn DB/evidence; restore backup chỉ theo incident approval riêng.

Fingerprint/backup sau nâng cấp phải bao phủ32tables gồm ledger, có checksum/migration/row-count receipt và restore proof. Duy trì bản off-host, retention và kiểm thử restore định kỳ; không giả những quy trình này đã được cài trong DICT task.
