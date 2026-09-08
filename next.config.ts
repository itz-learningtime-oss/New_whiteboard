import type { NextConfig } from "next";

const rendererFiles = [
  "./main.py",
  "./requirements.txt",
  "./UPSTREAM-LICENSE.txt",
  "./src/*.py",
  "./assets/*.png",
  "./assets/*.md",
  "./assets/fonts/*",
  "./public/fonts/*",
  "./public/images/*",
  "./public/audio/*",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/render": rendererFiles,
    "/api/export": rendererFiles,
  },
  // Uploads and rendered videos belong on the persistent runtime volume, never
  // in a deployment archive. Python dependencies are installed on the host.
  outputFileTracingExcludes: {
    "/api/render": [".data/**", "tests/**", "scripts/**", "**/__pycache__/**", "*.tsbuildinfo", "next.config.ts", ".env*"],
    "/api/export": [".data/**", "tests/**", "scripts/**", "**/__pycache__/**", "*.tsbuildinfo", "next.config.ts", ".env*"],
    "/api/render/**": [".data/**", ".env*"],
    "/api/media/**": [".data/**", ".env*"],
    "/*": [".data/**", "tests/**", "scripts/**", "**/__pycache__/**", "*.tsbuildinfo", "next.config.ts", ".env*"],
  },
};

export default nextConfig;
