# API contracts đề xuất — chưa triển khai

API server không tự có prefix /api; reverse proxy ngoài ánh xạ /api. Dùng existing request client/VITE_API_BASE_URL, không hardcode hostname.

## Security và lỗi

AuthGuard → RoleGuard; mutation verifyCsrfProof bằng cookie/header/sessionHash hiện tại. Không cơ chế CSRF thứ hai. GET không write. Cache-Control no-store cho session/private/admin responses. 401/403 theo auth contract; restricted/nonexistent IDs trả404 đồng nhất. 400 validation,409 revision/import conflict,413 size,429 limit,500 generic. Envelope {error:{code,message,requestId?}}, module message/UI tiếng Việt; không Prisma/SQL/stack/path nội bộ.

## DICT02–04

| Method/path                            | Quyền                              | Contract                                                                                               |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET /dictionary/entries                | authenticated, published predicate | q?,categoryId?,includeDescendants?,type?,sort?,limit?,cursor? → items,total,nextCursor,catalogRevision |
| GET /dictionary/entries/:entryId       | same visibility                    | entry/senses/categories/sources/display notes/revision, không raw import hoặc teacher keys             |
| GET /dictionary/categories             | same visibility                    | active hierarchy, DISTINCT counts/type counts; không internal metadata leaks                           |
| GET /dictionary/categories/:id         | same visibility                    | breadcrumb/children/visible count                                                                      |
| POST /dictionary/entries/:id/reports   | authenticated+CSRF, visible entry  | revision/comment≤2000 → report publicID; actor server-owned                                            |
| GET /dictionary/admin/overview         | ADMIN                              | editorial/publication/rights/import counts                                                             |
| GET /dictionary/admin/entries          | ADMIN                              | bounded internal search/flags, không learner cache                                                     |
| GET /dictionary/admin/entries/:id      | ADMIN                              | revision/provenance/internal editorial detail                                                          |
| POST /dictionary/admin/imports/dry-run | ADMIN+CSRF                         | bounded upload/format → reconciliation, ZERO writes                                                    |
| POST /dictionary/admin/imports         | ADMIN+CSRF+explicit intent         | checksum/format/bounded file → batch receipt/status                                                    |
| GET /dictionary/admin/imports/:id      | ADMIN                              | reconciliation và issues pagination, không filesystem paths                                            |

Không invent background queue. Import bounded ở file/row budget; đo request timeout. Nếu cần operator command, cùng service/guard và private path, không public local-path API. Upload parsing bounded cho route này, không tăng toàn cục auth/content payload limit. Không trả33000raw rows qua HTTP.

## CMS DICT07 — reserved design

POST /dictionary/admin/entries; POST /:id/save, /publish, /archive; GET /:id/revisions; POST /:id/restore. save/publish/restore cần expectedRevision; restore tạo revision mới, không sửa history. Server quyết định publicId/actor/publication. ADMIN+CSRF trên mọi POST.

POST /dictionary/admin/categories; POST /:id/save, /:id/move; POST /dictionary/admin/sources/:id/save (revision/evidence). Taxonomy move lock transaction, no cycles/depth overflow kể cả concurrent. Publish recheck source rights trong transaction; import/edit không overwrite verified revision. Rights revoke làm predicate fail ngay trên direct search/detail/count/export.

## DTO minh họa synthetic

```json
{
  "items": [
    {
      "publicId": "d1c70000-0000-4000-8000-000000000001",
      "chinese": "示例",
      "pinyin": "shìlì",
      "type": "UNCLASSIFIED",
      "senses": [
        {
          "publicId": "d1c70000-0000-4000-8000-000000000002",
          "vietnamese": "ví dụ",
          "english": null
        }
      ],
      "categories": [],
      "revision": 1
    }
  ],
  "total": 1,
  "nextCursor": null,
  "catalogRevision": "opaque-server-version"
}
```

UI render UNCLASSIFIED là Chưa phân loại. Ví dụ không phải production content hoặc quyền xuất bản corpus.

## DICT05–06 proposals

GET/POST /dictionary/notebook; POST /:id/remove,/note,/familiarity; GET/POST /dictionary/collections; POST /:id/items,/remove; GET/POST /teacher/vocabulary-sets; POST /:id/attach-to-lesson với expected set/lesson revisions.

GET/POST hợp client hiện tại, không cần mở PATCH/DELETE chỉ để CRUD. Body userId/authorId không quyết định quyền. Assignment lesson tiếp tục existing Teacher API; không tạo second assignment system. Entry current permissions vẫn recheck khi notebook/export. DICT06 cần chốt snapshot/provenance trước implementation; browse hoặc tự đánh giá không ghi learning events.
