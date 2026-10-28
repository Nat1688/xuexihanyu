/* Called only by PR-01's fresh-cluster harness, before browser E2E. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');

module.exports = async function verifyContent({ app, prisma, password, pass }) {
  const http = request(app.getHttpServer());
  async function login(login) {
    const response = await http.post('/auth/login').send({ login, password });
    assert.equal(response.status, 200);
    const cookies = response.headers['set-cookie'].map((line) => line.split(';')[0]);
    return {
      cookie: cookies.join('; '),
      token: decodeURIComponent(cookies.find((c) => c.startsWith('clp_csrf=')).slice(9)),
    };
  }
  const owner = await login('teacher.one@example.invalid');
  const other = await login('teacher.two@example.invalid');
  const admin = await login('admin@example.invalid');
  const student = await login('student.one@example.invalid');
  const ownerRow = await prisma.user.findUniqueOrThrow({
    where: { loginNormalized: 'teacher.one@example.invalid' },
  });
  const otherRow = await prisma.user.findUniqueOrThrow({
    where: { loginNormalized: 'teacher.two@example.invalid' },
  });
  const models = ['course', 'unit', 'lesson', 'learningItem', 'lessonLearningItem'];
  async function snapshot() {
    // Full rows, not counts: catches insertion, deletion and in-place mutation.
    // Authentication may touch session timestamps; those are not content writes.
    return Promise.all(
      models.map(async (model) =>
        (await prisma[model].findMany()).map((r) => JSON.stringify(r)).sort(),
      ),
    );
  }
  const post = (actor, route, body, token = actor.token) => {
    const req = http.post(route).set('Cookie', actor.cookie);
    if (token !== null) req.set('X-CSRF-Token', token);
    return req.send(body);
  };
  async function rejected(actor, route, body, token, status, code) {
    const before = await snapshot();
    const response = await post(actor, route, body, token);
    assert.equal(response.status, status);
    assert.equal(response.body.error.code, code);
    assert.deepEqual(await snapshot(), before);
  }
  const forged = randomUUID();
  const spoof = {
    publicId: forged,
    authorId: otherRow.id,
    id: forged,
    courseId: forged,
    unitId: forged,
    parentPublicId: forged,
    course: { connect: { id: forged } },
    unit: { connect: { id: forged } },
    author: { connect: { id: otherRow.id } },
  };
  const node = (slug, position = 0) => ({
    ...spoof,
    slug,
    title: slug,
    description: 'PR-01 synthetic',
    position,
    visibility: 'DRAFT',
  });
  const itemBody = { ...spoof, kind: 'CHARACTER', simplified: '一', pinyin: 'yī', meaning: 'one' };
  async function created(actor, route, body, model, authorId) {
    const response = await post(actor, route, body);
    assert.equal(response.status, 201);
    assert.notEqual(response.body.publicId, forged);
    const row = await prisma[model].findUniqueOrThrow({
      where: { publicId: response.body.publicId },
    });
    if (authorId) assert.equal(row.authorId, authorId);
    for (const key of ['id', 'authorId', 'courseId', 'unitId', 'author', 'course', 'unit'])
      assert.equal(response.body[key], undefined);
    return row;
  }
  const course = await created(
    owner,
    '/content/courses',
    node('pr01-boundary'),
    'course',
    ownerRow.id,
  );
  const unitRoute = `/content/courses/${course.publicId}/units`;
  const unit = await created(owner, unitRoute, node('pr01-unit', 2), 'unit');
  const lessonRoute = `/content/units/${unit.publicId}/lessons`;
  const lesson = await created(owner, lessonRoute, node('pr01-lesson', 2), 'lesson');
  const item = await created(owner, '/content/items', itemBody, 'learningItem', ownerRow.id);
  assert.equal(unit.courseId, course.id);
  assert.equal(lesson.unitId, unit.id);
  assert.equal(course.title, 'pr01-boundary');
  assert.equal(course.description, 'PR-01 synthetic');
  assert.equal(unit.position, 2);
  assert.equal(lesson.position, 2);
  const attachRoute = `/content/lessons/${lesson.publicId}/items`;
  const attachBody = {
    learningItemPublicId: item.publicId,
    position: 0,
    ...spoof,
    lessonId: forged,
    learningItemId: forged,
  };
  const cases = [
    ['/content/courses', node('pr01-rejected')],
    [unitRoute, node('pr01-rejected', 9)],
    [lessonRoute, node('pr01-rejected', 9)],
    ['/content/items', itemBody],
    [attachRoute, attachBody],
  ];
  for (const [route, body] of cases) {
    for (const token of [null, 'invalid-proof', other.token])
      await rejected(owner, route, body, token, 403, 'AUTH_CSRF_INVALID');
    // A matching cookie/header from another session must not pass session binding.
    const foreignProof = {
      cookie: owner.cookie.replace(/clp_csrf=[^;]+/, `clp_csrf=${encodeURIComponent(other.token)}`),
      token: other.token,
    };
    await rejected(foreignProof, route, body, foreignProof.token, 403, 'AUTH_CSRF_INVALID');
    await rejected(student, route, body, student.token, 403, 'AUTH_FORBIDDEN');
    const before = await snapshot();
    assert.equal((await http.post(route).send(body)).status, 401);
    assert.deepEqual(await snapshot(), before);
  }
  for (const [route, body] of [
    [unitRoute, node('foreign', 9)],
    [lessonRoute, node('foreign', 9)],
    [attachRoute, attachBody],
  ]) {
    await rejected(other, route, body, other.token, 403, 'AUTH_FORBIDDEN');
  }
  for (const route of [
    `/content/courses/${randomUUID()}/units`,
    `/content/units/${randomUUID()}/lessons`,
  ]) {
    const before = await snapshot();
    const response = await post(owner, route, node('missing'));
    assert.equal(response.status, 404);
    assert.deepEqual(await snapshot(), before);
  }
  assert.equal((await post(owner, attachRoute, attachBody)).status, 204);
  const links = await prisma.lessonLearningItem.findMany({ where: { lessonId: lesson.id } });
  assert.equal(links.length, 1);
  assert.equal(links[0].learningItemId, item.id);
  const adminUnit = await created(admin, unitRoute, node('admin-unit', 1), 'unit');
  const adminLesson = await created(admin, lessonRoute, node('admin-lesson', 1), 'lesson');
  assert.equal(adminUnit.courseId, course.id);
  assert.equal(adminLesson.unitId, unit.id);
  const adminRow = await prisma.user.findUniqueOrThrow({
    where: { loginNormalized: 'admin@example.invalid' },
  });
  await created(admin, '/content/courses', node('admin-course'), 'course', adminRow.id);
  const adminItem = await created(admin, '/content/items', itemBody, 'learningItem', adminRow.id);
  assert.equal(
    (await post(admin, attachRoute, { learningItemPublicId: adminItem.publicId, position: 1 }))
      .status,
    204,
  );
  const {
    PrismaContentRepository,
  } = require('../../api/dist/src/modules/content/infrastructure/prisma-content.repository.js');
  const repository = new PrismaContentRepository(prisma);
  for (const value of [
    await repository.findUnitByPublicId(adminUnit.publicId),
    await repository.findUnitByCourseAndSlug(course.publicId, adminUnit.slug),
    await repository.findLessonByPublicId(adminLesson.publicId),
    await repository.findLessonByUnitAndSlug(unit.publicId, adminLesson.slug),
  ])
    assert.equal(value.authorId, ownerRow.id);
  for (const [route, expected] of [
    [unitRoute, [adminUnit.publicId, unit.publicId]],
    [lessonRoute, [adminLesson.publicId, lesson.publicId]],
  ]) {
    const response = await http.get(route).set('Cookie', owner.cookie.split(';')[0]);
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.map((r) => r.publicId),
      expected,
    );
    for (const row of response.body)
      assert.deepEqual(
        Object.keys(row).sort(),
        ['publicId', 'slug', 'title', 'description', 'visibility', 'position'].sort(),
      );
    const hidden = await http.get(route).set('Cookie', student.cookie);
    assert.equal(hidden.status, 200);
    assert.deepEqual(hidden.body, []);
  }
  for (const model of ['course', 'unit', 'lesson', 'learningItem'])
    assert.equal(await prisma[model].count({ where: { publicId: forged } }), 0);
  pass('combined Content PostgreSQL HTTP security regression', {
    mutations: 5,
    csrfRejectedUnchanged: 20,
    studentRejectedUnchanged: 5,
    anonymousRejectedUnchanged: 5,
    foreignOwnershipRejectedUnchanged: 3,
    missingParentUnchanged: 2,
    inheritedAuthorAndParent: true,
    dtoAndReadVisibility: true,
    snapshots: 'all full rows in five content tables; session lastUsedAt excluded',
  });
};
