# Environment & Toolchain / Repository Structure

## Environment & Toolchain

| Item              | Value                                               |
| ----------------- | --------------------------------------------------- |
| OS                | macOS (darwin) — target platform only               |
| Node.js           | v22.15.0                                            |
| npm               | 10.9.2                                              |
| Package manager   | pnpm 11.8.0                                         |
| App framework     | Electron 42                                         |
| Build tooling     | electron-vite 3                                     |
| Frontend          | React 18 + TypeScript 5                             |
| Styling           | styled-components 6                                 |
| State persistence | electron-store                                      |
| YAML parsing      | js-yaml                                             |
| Validation        | zod                                                 |
| Renderer state    | zustand                                             |
| Body font         | Barlow + Barlow Condensed (via @fontsource)         |
| Mono font         | JetBrains Mono (via @fontsource)                    |
| Display font      | Rubik Distressed — app title only (via @fontsource) |
| Icons             | lucide-react                                        |
| Testing           | Vitest (unit + integration) + React Testing Library |
| Linting           | ESLint v9 (flat config)                             |
| Formatting        | Prettier + @trivago/prettier-plugin-sort-imports    |
| Pre-commit hooks  | simple-git-hooks + lint-staged                      |
| Packaging         | electron-builder                                    |
