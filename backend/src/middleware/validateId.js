const MAX_BIGINT = 9223372036854775807n;

export function isValidId(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return false;
  }

  const text = String(value);

  return /^[1-9]\d{0,18}$/.test(text) && BigInt(text) <= MAX_BIGINT;
}

export function validateIdParam(req, res, next, id) {
  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  next();
}
