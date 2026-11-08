/** Consume a same-origin plain-text chat stream; never send provider keys here. */
export async function* streamChat(response: Response): AsyncGenerator<string> {
  if (!response.ok) throw new Error(`Chat request failed (${response.status}).`);
  if (!response.body) throw new Error('Chat response has no body.');
  // Decode bytes as text so UI code can display each piece as it arrives.
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
