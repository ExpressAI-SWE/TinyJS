// This component requests /api/hello and shows the response or an error.
import { useState } from 'preact/hooks';

export default function ApiInspector() {
  const [result, setResult] = useState('No request yet.');
  const [pending, setPending] = useState(false);
  async function request() {
    setPending(true);
    try {
      const response = await fetch('/api/hello', { signal: AbortSignal.timeout(5000) });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
      setResult(`HTTP ${response.status}\n${JSON.stringify(JSON.parse(body), null, 2)}`);
    } catch (error) { setResult(`Request failed: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setPending(false); }
  }
  return <section class="demo-box"><h2>A real server response</h2><p>Fetch the demo's GET handler. The result below comes from the server.</p><button disabled={pending} onClick={request}>{pending ? 'Requesting…' : 'Fetch /api/hello'}</button><pre aria-live="polite">{result}</pre></section>;
}
