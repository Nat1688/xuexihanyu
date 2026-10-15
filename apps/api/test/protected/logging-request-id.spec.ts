import {
  CORRELATION_ID_HEADER,
  isSaneRequestId,
  readInboundRequestId,
  REQUEST_ID_MAX_LENGTH,
  REQUEST_ID_HEADER,
  requestIdMiddleware,
  resolveRequestId,
  type HttpRequest,
  type HttpResponse,
} from '../../src/modules/foundation/logging';

/**
 * Request/correlation id tests (CLP-00-10).
 *
 * Proves: a SANE inbound id is reused, an unsafe/missing one is replaced by a
 * fresh id, the resolved id is echoed on the response, and nothing untrusted
 * (spaces/quotes/newlines) can be accepted into a log line.
 */
function makeReq(headers: Record<string, string | string[]> = {}): HttpRequest {
  return { headers };
}

function makeRes(): HttpResponse & { headers: Record<string, string | string[]> } {
  const headers: Record<string, string | string[]> = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
  };
}

describe('isSaneRequestId', () => {
  it.each(['abc123', 'a1b2c3-d4e5', 'req_0001', 'trace:span:42', 'x'.repeat(128)])(
    'accepts %s',
    (id) => {
      expect(isSaneRequestId(id)).toBe(true);
    },
  );

  it.each([
    '', // empty
    'has space',
    'quote"inject',
    'newline\ninject',
    'semi;colon',
    'x'.repeat(REQUEST_ID_MAX_LENGTH + 1), // too long
    'unicode-\u0000-null',
  ])('rejects %s', (id) => {
    expect(isSaneRequestId(id)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isSaneRequestId(undefined)).toBe(false);
    expect(isSaneRequestId(42)).toBe(false);
  });
});

describe('readInboundRequestId', () => {
  it('reads a sane x-request-id', () => {
    expect(readInboundRequestId(makeReq({ [REQUEST_ID_HEADER]: 'abc-123' }))).toBe('abc-123');
  });

  it('falls back to x-correlation-id', () => {
    expect(readInboundRequestId(makeReq({ [CORRELATION_ID_HEADER]: 'corr-9' }))).toBe('corr-9');
  });

  it('takes the first element of an array header', () => {
    expect(readInboundRequestId(makeReq({ [REQUEST_ID_HEADER]: ['first', 'second'] }))).toBe(
      'first',
    );
  });

  it('ignores an unsafe inbound value', () => {
    expect(readInboundRequestId(makeReq({ [REQUEST_ID_HEADER]: 'bad value!' }))).toBeUndefined();
  });
});

describe('resolveRequestId', () => {
  it('reuses a sane inbound id', () => {
    expect(resolveRequestId(makeReq({ [REQUEST_ID_HEADER]: 'given-id-1' }))).toBe('given-id-1');
  });

  it('mints a fresh id when absent', () => {
    const id = resolveRequestId(makeReq());
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(isSaneRequestId(id)).toBe(true);
  });

  it('mints a fresh id when the inbound value is unsafe', () => {
    const id = resolveRequestId(makeReq({ [REQUEST_ID_HEADER]: 'bad value' }));
    expect(id).not.toBe('bad value');
    expect(isSaneRequestId(id)).toBe(true);
  });
});

describe('requestIdMiddleware', () => {
  it('attaches the id to the request, echoes it on the response, and calls next', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: 'given-id-1' });
    const res = makeRes();
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('given-id-1');
    expect(res.headers[REQUEST_ID_HEADER]).toBe('given-id-1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('still calls next even if setting the response header throws', () => {
    const req = makeReq();
    const res: HttpResponse = {
      setHeader() {
        throw new Error('headers already sent');
      },
    };
    const next = jest.fn();

    expect(() => requestIdMiddleware(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
