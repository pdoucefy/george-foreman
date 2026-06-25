/**
 * Pure window lifecycle helpers — no Electron dependency, fully testable.
 */

/**
 * Determines what should happen when the window receives a 'close' event.
 *
 * @param isQuitting - true when the app is in the process of quitting
 *                     (e.g. user pressed Cmd+Q)
 * @returns 'hide'  → prevent the close and hide the window instead
 *          'quit'  → allow the close to proceed and quit the app
 */
export const shouldHideOnClose = (isQuitting: boolean): 'hide' | 'quit' =>
  isQuitting ? 'quit' : 'hide';

/**
 * Determines whether this instance should continue running or quit
 * immediately because another instance already holds the single-instance lock.
 *
 * @param hasLock - result of app.requestSingleInstanceLock()
 * @returns 'continue' → this instance owns the lock, proceed normally
 *          'quit'     → another instance is already running, exit immediately
 */
export const shouldAllowNewInstance = (hasLock: boolean): 'continue' | 'quit' =>
  hasLock ? 'continue' : 'quit';
