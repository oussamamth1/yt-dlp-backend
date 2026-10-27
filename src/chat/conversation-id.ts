/** Deterministic conversation id so both participants land in the same room/history, regardless of who started it. */
export function conversationId(userA: string, userB: string): string {
  return [userA.toLowerCase(), userB.toLowerCase()].sort().join('::');
}
