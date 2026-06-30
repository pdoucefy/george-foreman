# George Foreman

> Good luck with George Foreman - go grill some agents.
>
> \- Claude 2026

![alt text](image.png)
![alt text](image-1.png)

## Development

### Resetting the store (re-trigger onboarding)

In `pnpm dev`, open DevTools (`Cmd+Option+I`) and run:

```js
window.api.dev.resetAndReload();
```

This clears the entire `electron-store` and reloads the renderer. On the next
`app.whenReady()` cycle the store is recreated with defaults — `workspaceFolder`
is empty, so onboarding reappears.

`window.api.dev` is only present in development builds (`is.dev === true`).
It is not exposed in production.
