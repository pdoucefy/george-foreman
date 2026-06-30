# Testing Gotchas

## `store.ts` runs schema migration at module import time

`runStartupMigration()` is called as a side effect when the module is first imported. In tests,
you **must** mock `electron-store` using `vi.hoisted` **before** any import of `store.ts`.
Migration tests also need `vi.resetModules()` + dynamic import to re-run the import-time
migration in each test. See `src/main/__tests__/store.test.ts` for the canonical pattern.

## Renderer tests use a separate vitest config

The renderer components require a browser environment (`happy-dom`) and React JSX support.
These cannot share the main-process config (`vitest.config.ts`, which uses `environment: 'node'`).
Use `vitest.config.web.ts` for renderer tests:

```bash
pnpm vitest run --config vitest.config.web.ts   # renderer only
pnpm vitest run --config vitest.config.ts        # main/shared only
```

The web config uses `@vitejs/plugin-react` for JSX transforms and `globals: true` so
`describe`/`it`/`expect`/`vi` are available without explicit imports.

Each test must wrap the component in `<ThemeProvider theme={theme}>` — no global provider exists in the test environment.

## `vi.useFakeTimers()` breaks `userEvent.click()` — use `shouldAdvanceTime`

Calling `vi.useFakeTimers()` without options in a test that also uses `userEvent.click()` causes
the click to hang indefinitely (userEvent uses internal delays that are intercepted by fake timers).

**Fix:** pass `{ shouldAdvanceTime: true }` and use `userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })`.
Never call `vi.useFakeTimers()` in `beforeEach` for tests that also use the default `userEvent`
import — the leak pollutes all subsequent tests in the same file.
See `src/renderer/__tests__/Toast.test.tsx` for the established pattern.

## `focus-trap-react` requires a tabbable node — use `fallbackFocus`

When rendering a Modal in tests (happy-dom), `focus-trap-react` throws
`"Your focus-trap must have at least one container with at least one tabbable node"` if the
modal content contains no naturally focusable element.

**Fix:** always pass `fallbackFocus: () => document.body` in `focusTrapOptions`. This is safe
in production too — it only activates when no other focusable node exists. See
`src/renderer/src/components/ui/Modal/index.tsx` for the established pattern.
