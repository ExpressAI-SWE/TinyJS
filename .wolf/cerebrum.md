# Verified project lessons

- 2026-11-11: Challenge optimization means concurrent benchmark users; preserve TinyJS and target maximum verified capacity. Bun 1.4.4 honors node:http server.keepAliveTimeout = 120_000 before listen; both Node and Bun retained sockets across three 11-second gaps. This alone does not confirm the official EOF race is eliminated.

- 2026-11-08: Node --import needs a file URL for resolved Windows paths; use pathToFileURL (covered by CLI TypeScript regressions).
- Stage 2 tests use bun:test and must run with Bun; portable project tests can use node:test on Node or Bun.
- 2026-11-08: Keep the playground modular, demonstrate real TinyJS capabilities, verify dev and production, and test Three.js GPU resource disposal.
- 2026-11-08: Normalize MDX input to LF before compilation so Windows checkouts reproduce committed components; keep shared-client size fixtures independent of playground navigation.
