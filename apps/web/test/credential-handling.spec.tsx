jest.mock('../src/config/public-config', () => ({
  getPublicConfig: () => ({ apiBaseUrl: '/api' }),
}));
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginScreen } from '../src/screens/LoginScreen';
import { studentApi } from '../src/api/client';

describe('SEC-01 credential boundary', () => {
  it('renders an empty uncontrolled login password with native manager metadata', () => {
    const html = renderToStaticMarkup(<LoginScreen onAuthenticated={() => undefined} />);
    const input = html.match(/<input[^>]+id="login-password"[^>]*>/u)?.[0];
    expect(input).toBeDefined();
    expect(input).toContain('type="password"');
    expect(input).toContain('name="password"');
    expect(input).toContain('autoComplete="current-password"');
    expect(input).not.toMatch(/\svalue=|\sdefaultValue=/u);
    expect(html).toContain('autoComplete="username"');
    expect(html).not.toContain('autoComplete="off"');
    expect(html).toContain('htmlFor="login-password"'.replace('htmlFor', 'for'));
  });

  it('sends credentials only in the POST body, without trimming the password', async () => {
    const originalFetch = global.fetch;
    const originalDocument = Object.getOwnPropertyDescriptor(global, 'document');
    const secret = ['Synthetic', ' credential ', 'only!', '漢'].join('');
    const principal = {
      publicId: 'synthetic-id',
      login: 'test@example.invalid',
      roles: ['STUDENT'],
    };
    const calls: Array<{ url: string; options?: RequestInit }> = [];
    Object.defineProperty(global, 'document', { configurable: true, value: { cookie: '' } });
    global.fetch = jest.fn(async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ user: principal }), { status: 200 });
    });
    try {
      expect(await studentApi.login(principal.login, secret)).toEqual(principal);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('/api/auth/login');
      expect(calls[0].url).not.toContain(secret);
      expect(calls[0].options).toMatchObject({
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      expect(JSON.parse(String(calls[0].options?.body))).toEqual({
        login: principal.login,
        password: secret,
      });
    } finally {
      global.fetch = originalFetch;
      if (originalDocument) Object.defineProperty(global, 'document', originalDocument);
      else Reflect.deleteProperty(global, 'document');
    }
  });
});
