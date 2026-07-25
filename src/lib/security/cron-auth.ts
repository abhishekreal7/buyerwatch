export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  return Boolean(secret && authorization === `Bearer ${secret}`)
}
