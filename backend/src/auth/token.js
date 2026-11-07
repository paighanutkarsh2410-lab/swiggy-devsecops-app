import jwt from "jsonwebtoken";

const ALGORITHM = "HS256";
const TOKEN_LIFETIME = "8h";

function getSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters");
  }

  return secret;
}

export function assertAuthConfigured() {
  getSecret();
}

export function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, getSecret(), {
    algorithm: ALGORITHM,
    expiresIn: TOKEN_LIFETIME
  });
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: [ALGORITHM] });
}
