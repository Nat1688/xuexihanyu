/**
 * Nest application test lifecycle helper (CLP-00-08A).
 *
 * Wraps `Test.createTestingModule(...).compile()` + `createNestApplication()`
 * + `init()` so API/integration specs do not repeat bootstrap/teardown code,
 * and so teardown ALWAYS closes the Nest application (the task contract
 * requires helpers to always release Nest resources).
 *
 * Scope: NON-DATABASE. This helper boots the Nest application with NO external
 * dependencies — no PostgreSQL, no Prisma, no migrations. It compiles the real
 * `AppModule` (whose current surface is the health scaffold + config boundary)
 * or any module a test passes in. It starts NO server socket unless the caller
 * asks for one via `useHttpServer`.
 */

import { INestApplication, Logger, type ModuleMetadata } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';

/** Supertest agent type, inferred from the default export. */
export type SupertestAgent = ReturnType<typeof request>;

/** Options for {@link createTestApp}. */
export interface TestAppOptions {
  /**
   * Nest module metadata to compile. Defaults to the real `AppModule`. Pass a
   * synthetic test module to boot an isolated slice without the full app.
   */
  metadata?: ModuleMetadata;
  /**
   * When true, call `app.listen(0)` on an ephemeral port so `getHttpServer()`
   * is a real bound server. Defaults to false (supertest drives the server
   * object directly, which is faster and avoids port contention).
   */
  useHttpServer?: boolean;
}

/** A booted Nest application plus a convenience supertest agent. */
export interface TestAppContext {
  readonly app: INestApplication;
  /** Supertest agent bound to the app's HTTP server. */
  readonly http: SupertestAgent;
  /** Close the application. Idempotent and always awaited by {@link withTestApp}. */
  close(): Promise<void>;
}

/**
 * Boot a Nest application for testing. If compilation or init throws, no
 * application is returned; a failed bootstrap never leaks resources.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestAppContext> {
  const { metadata = { imports: [AppModule] }, useHttpServer = false } = options;

  const moduleRef: TestingModule = await Test.createTestingModule(metadata).compile();

  const app = moduleRef.createNestApplication();
  try {
    await app.init();
    if (useHttpServer) {
      await app.listen(0);
    }
  } catch (error) {
    // Never leak a half-initialised Nest application.
    await app.close();
    throw error;
  }

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await app.close();
  };

  // supertest accepts the underlying Node http server directly.
  const http = request(app.getHttpServer());

  return { app, http, close };
}

/**
 * Run `fn` against a freshly booted app, guaranteeing teardown even when the
 * body throws. This is the preferred form: it removes the repetitive
 * `beforeAll`/`afterAll` pairing from specs.
 */
export async function withTestApp<T>(
  options: TestAppOptions,
  fn: (ctx: TestAppContext) => Promise<T>,
): Promise<T> {
  const ctx = await createTestApp(options);
  try {
    return await fn(ctx);
  } finally {
    try {
      await ctx.close();
    } catch (error) {
      // Surface teardown failures rather than swallowing them.
      new Logger('TestApp').error(`failed to close test application: ${String(error)}`);
      throw error;
    }
  }
}
