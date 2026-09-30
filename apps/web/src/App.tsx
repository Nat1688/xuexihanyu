/**
 * CLP SPA skeleton root.
 *
 * Placeholder surface only: no authentication, no API call, no privileged
 * secret. Real student/teacher flows arrive in later checkpoints after the
 * respective ADRs and task contracts are approved.
 */
export function App() {
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
      <p>Foundation skeleton (CP-00 / CLP-00-02).</p>
      <p style={{ color: '#555' }}>
        No learning-domain feature is implemented yet. This SPA is a build/start harness only.
      </p>
    </main>
  );
}
