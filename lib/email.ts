/**
 * Email identity normalization.
 *
 * Registration, password login and OAuth account matching must agree on the
 * canonical form, otherwise `Alice@x.fr` and `alice@x.fr` become two accounts
 * and the OAuth-linking checks can be bypassed.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
