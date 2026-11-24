function serialize(body: object) {
  const json = JSON.stringify(body);
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(new TextEncoder().encode(json).byteLength),
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  if (params.slug === 'failure') throw new Error('Example API error');
  if (params.slug === 'slow') await new Promise(resolve => setTimeout(resolve, 180));
  return serialize({ slug: params.slug });
}
