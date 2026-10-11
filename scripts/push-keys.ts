/**
 * Prints a fresh VAPID key pair for Web Push (F29). Run once per environment
 * and paste the output into Vercel's env settings and .env.local.
 *
 * The private key signs every push this deployment sends. Rotating it
 * invalidates every existing subscription — members re-enable notifications
 * once, from the profile or the Rounds tab — so rotate on compromise, not on
 * a calendar.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
