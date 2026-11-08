// TinyJS maps this GET handler to /api/hello, which the lab can request.
export function GET() {
  return Response.json({ message: 'Hello from TinyJS' });
}
