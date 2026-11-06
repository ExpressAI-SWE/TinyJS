import Counter from './counter';

export default function Home() {
  return (
    <>
      <h1>TinyJS</h1>
      <p>A server-rendered page with a hydrated Preact counter.</p>
      <Counter />
    </>
  );
}
