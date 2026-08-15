import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que `next dev`/`next build` regeneren AGENTS.md/CLAUDE.md en
  // cada corrida — ya tenemos nuestro propio CLAUDE.md en la raíz del repo.
  agentRules: false,
};

export default nextConfig;
