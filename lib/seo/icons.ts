/**
 * Version stamp on every app-icon URL (F29). Phones snapshot a site's icon
 * when it is added to the Home Screen and keep it under that URL; a new value
 * here is a new URL, so the next add (or Android's WebAPK refresh) fetches the
 * current mark instead of a cached one. Bump it whenever public/icons change.
 */
export const ICON_VERSION = "2";
