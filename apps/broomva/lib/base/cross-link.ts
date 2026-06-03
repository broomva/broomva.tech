type NonceValidation =
  | { ok: true }
  | { ok: false; reason: "missing" | "wrong_user" | "used" | "expired" };

export type CrossLinkValidationResult =
  | { ok: true }
  | { ok: false; error: "nonce_invalid" | "did_mismatch" | "address_mismatch" };

export function validateCrossLink({
  message,
  animaDid,
  baseAddress,
  nonceValidation,
}: {
  message: string;
  animaDid: string;
  baseAddress: string;
  nonceValidation: NonceValidation;
}): CrossLinkValidationResult {
  if (!nonceValidation.ok) {
    return { ok: false, error: "nonce_invalid" };
  }
  if (!message.includes(animaDid)) {
    return { ok: false, error: "did_mismatch" };
  }
  if (!message.includes(baseAddress)) {
    return { ok: false, error: "address_mismatch" };
  }
  return { ok: true };
}
