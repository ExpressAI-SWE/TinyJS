import { useState } from 'preact/hooks';

export const metadata = { title: 'DevTools example' };

export default function Home() {
  const [count, setCount] = useState(0);
  const [activity, setActivity] = useState('');

  async function request(url: string) {
    setActivity('Request in progress');
    try {
      const response = await fetch(url);
      await response.text();
      setActivity(`HTTP ${response.status}`);
    } catch (error) {
      setActivity(error instanceof Error ? error.message : 'Request failed');
    }
  }

  return <>
    <h1>DevTools example</h1>
    <p>Open the TinyJS indicator, then use these controls to generate real application activity.</p>
    <section aria-labelledby="interactions">
      <h2 id="interactions">Application activity</h2>
      <div class="actions">
        <button type="button" onClick={() => setCount(count + 1)}>Counter: {count}</button>
        <button type="button" onClick={() => { void request('/api/products/field-notes'); }}>Make API request</button>
        <button type="button" onClick={() => { void request('/api/products/slow'); }}>Make slow request</button>
        <button type="button" onClick={() => { void request('/api/products/failure'); }}>Trigger API error</button>
        <button type="button" onClick={() => { throw new Error('Example browser error'); }}>Trigger browser error</button>
        <button type="button" onClick={() => { void Promise.reject(new Error('Example promise rejection')); }}>Reject promise</button>
      </div>
      <p role="status">{activity}</p>
    </section>
  </>;
}
