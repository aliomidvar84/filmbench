import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";

import type { Membership } from "./rbac.js";

export interface AccessClaims {
  sub: string;
  email: string;
  memberships: Membership[];
}

function isMembershipArray(x: unknown): x is Membership[] {
  return (
    Array.isArray(x) &&
    x.every(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        "factory_id" in m &&
        "role" in m &&
        typeof (m as Membership).factory_id === "string" &&
        typeof (m as Membership).role === "string",
    )
  );
}

export function signAccessToken(
  claims: AccessClaims,
  secret: string,
  expiresInMinutes: number,
): string {
  return jwt.sign(
    {
      sub: claims.sub,
      email: claims.email,
      memberships: claims.memberships,
      scope: "access",
    },
    secret,
    { algorithm: "HS256", expiresIn: `${expiresInMinutes}m` },
  );
}

export function verifyAccessToken(token: string, secret: string): AccessClaims {
  const decoded = jwt.verify(token, secret) as JwtPayload & {
    scope?: string;
    memberships?: unknown;
  };
  if (decoded.scope !== "access") {
    throw new Error("invalid_token_type");
  }
  if (!decoded.sub || typeof decoded.sub !== "string") {
    throw new Error("invalid_subject");
  }
  if (!decoded.email || typeof decoded.email !== "string") {
    throw new Error("invalid_email_claim");
  }
  if (!isMembershipArray(decoded.memberships)) {
    throw new Error("invalid_memberships_claim");
  }
  return {
    sub: decoded.sub,
    email: decoded.email,
    memberships: decoded.memberships,
  };
}
