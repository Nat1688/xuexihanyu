import { getPublicConfig } from './config/public-config';

/**
 * CLP SPA skeleton root.
 *
 * Placeholder surface only: no authentication, no API call, no privileged
 * secret. The only configuration read uses the public allowlist
 * (`getPublicConfig`) — no server secret can reach this component.
 * Real student/teacher flows arrive in later checkpoints after the respective
 * ADRs and task contracts are approved.
 */
export function App() {
  const { apiBaseUrl } = getPublicConfig();

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      <h1>CLP — Chinese Learning Platform</h1>
      <p>Foundation skeleton (CP-00 / CLP-00-03).</p>
      <p style={{ color: '#555' }}>
        No learning-domain feature is implemented yet. This SPA is a build/start harness only.
      </p>
      <p style={{ color: '#555' }}>
        Public config: API base URL {apiBaseUrl ? <code>{apiBaseUrl}</code> : <em>(not set)</em>}.
      </p>
    </main>
  );
}
