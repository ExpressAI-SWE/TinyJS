import { useState } from 'preact/hooks';
import { createLoader } from 'tinyjs/loading';

const loader = createLoader<string>();

export default function Page() {
  const [text, setText] = useState('Ready');
  const [busy, setBusy] = useState(false);

  async function loadGreeting() {
    setBusy(true);
    try {
      setText(await loader.load('greeting', async () => (await import('./greeting')).greeting));
    } catch {
      setText('Load failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main>
    <h1>Lazy module loading</h1>
    <button disabled={busy} onClick={loadGreeting}>Load greeting</button>
    <p role="status">{text}</p>
  </main>;
}
