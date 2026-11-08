// The home page uses this component to demonstrate browser-side Preact state.
import { useState } from 'preact/hooks';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount((value) => value + 1)}>Count: {count}</button>;
}
