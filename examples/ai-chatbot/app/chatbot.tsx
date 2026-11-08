import { useEffect, useRef, useState } from 'preact/hooks';
import { streamChat } from 'tinyjs/ai/client';

interface Message { role: 'user' | 'assistant'; content: string }
export default function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController>();
  useEffect(() => () => active.current?.abort(), []);
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (active.current || !input.trim()) return;
    const controller = new AbortController(); active.current = controller;
    const history: Message[] = [...messages, { role: 'user', content: input.trim() }];
    setInput(''); setError(''); setBusy(true); setMessages(history);
    let answer = '';
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }), signal: controller.signal });
      for await (const delta of streamChat(response)) {
        answer += delta; setMessages([...history, { role: 'assistant', content: answer }]);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Chat failed.');
    } finally { active.current = undefined; setBusy(false); }
  }
  return <section aria-label="Chat">
    <ol aria-live="polite">{messages.map((message, index) => <li key={index}><strong>{message.role}: </strong>{message.content}</li>)}</ol>
    {error && <p role="alert">{error}</p>}
    <form onSubmit={submit}>
      <label>Message <input value={input} maxLength={4000} disabled={busy} onInput={event => setInput(event.currentTarget.value)} /></label>
      <button disabled={busy || !input.trim()}>Send</button>
      {busy && <button type="button" onClick={() => active.current?.abort()}>Stop</button>}
    </form>
  </section>;
}
