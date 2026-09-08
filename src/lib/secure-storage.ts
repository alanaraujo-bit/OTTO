/**
 * Where the OTTO keeps the three things it must remember between launches: the session token, the
 * lock preference, and the notification settings.
 *
 * On a phone that is the platform keystore, and this file is a pass-through — `expo-secure-store`
 * already is the answer. The file exists for the sake of its `.web` sibling: `expo-secure-store`
 * ships `export default {}` as its web implementation, so every call through it on web is a
 * `TypeError` on an empty object rather than a refusal anyone can catch and reason about. Importing
 * the store through one name lets Metro hand the browser a real implementation instead, and keeps
 * the native path exactly as unremarkable as it should be.
 */
export { getItemAsync, setItemAsync, deleteItemAsync } from 'expo-secure-store';
