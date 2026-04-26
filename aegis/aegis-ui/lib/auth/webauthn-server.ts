// lib/auth/webauthn-server.ts — server-side WebAuthn helpers keep challenge generation and verification away from the browser.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON as SimpleWebAuthnAuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON as SimpleWebAuthnRegistrationResponseJSON,
} from "@simplewebauthn/server";
import { authenticator } from "otplib";

import type { AgentPasskeyCredential } from "@/lib/agent-client";

type PasskeyTransport = AuthenticatorTransportFuture;

export type RegistrationOptionsJSON = {
  challenge: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: "public-key"; alg: number }>;
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  authenticatorSelection?: {
    residentKey?: ResidentKeyRequirement;
    userVerification?: UserVerificationRequirement;
  };
};

export type AuthenticationOptionsJSON = {
  challenge: string;
  timeout?: number;
  rpId: string;
  allowCredentials?: Array<{ id: string; type: "public-key"; transports?: PasskeyTransport[] }>;
  userVerification?: UserVerificationRequirement;
};

export type RegistrationResponseJSON = SimpleWebAuthnRegistrationResponseJSON;

export type AuthenticationResponseJSON = SimpleWebAuthnAuthenticationResponseJSON;

export type RegistrationVerification = {
  credentialID: string;
  publicKeyBase64: string;
  signCount: number;
  attestationBase64?: string;
  transports: PasskeyTransport[];
};

export type AuthenticationVerification = {
  newCounter: number;
};

export async function createSetupCeremony(input: { username: string; displayName: string; rpID: string; rpName: string }) {
  const totpSecret = authenticator.generateSecret();
  const recoveryCodes = generateRecoveryCodes(8);
  const otpauthUri = authenticator.keyuri(input.username, input.rpName, totpSecret);
  const options = await generateRegistrationOptions({
    rpID: input.rpID,
    rpName: input.rpName,
    userName: input.username,
    userDisplayName: input.displayName,
    userID: crypto.getRandomValues(new Uint8Array(32)),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
    supportedAlgorithmIDs: [-7, -257],
  }) as RegistrationOptionsJSON;
  return { publicKey: options, totpSecret, recoveryCodes, otpauthUri };
}

export async function verifySetupCeremony(input: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
}) {
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: input.expectedOrigin,
    expectedRPID: input.expectedRPID,
    requireUserVerification: true,
  }) as {
    verified: boolean;
    registrationInfo?: {
      credential: { id: string; publicKey: Uint8Array; counter: number };
    };
  };
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("passkey registration verification failed");
  }
  return {
    credentialID: verification.registrationInfo.credential.id,
    publicKeyBase64: bytesToBase64(verification.registrationInfo.credential.publicKey),
    signCount: verification.registrationInfo.credential.counter,
    attestationBase64: base64urlToBase64(input.response.response.attestationObject),
    transports: normalizePasskeyTransports(input.response.response.transports),
  } satisfies RegistrationVerification;
}

export async function createLoginCeremony(input: { rpID: string; credentials: AgentPasskeyCredential[] }) {
  return await generateAuthenticationOptions({
    rpID: input.rpID,
    userVerification: "preferred",
    allowCredentials: input.credentials.map((credential) => ({
      id: credential.id,
      type: "public-key",
      transports: normalizePasskeyTransports(credential.transports),
    })),
  }) as AuthenticationOptionsJSON;
}

export async function verifyLoginCeremony(input: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: AgentPasskeyCredential;
}) {
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: input.expectedOrigin,
    expectedRPID: input.expectedRPID,
    credential: {
      id: input.credential.id,
      publicKey: base64ToBytes(input.credential.public_key),
      counter: input.credential.sign_count,
      transports: normalizePasskeyTransports(input.credential.transports),
    },
    requireUserVerification: true,
  }) as {
    verified: boolean;
    authenticationInfo?: { newCounter: number };
  };
  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error("passkey authentication verification failed");
  }
  return { newCounter: verification.authenticationInfo.newCounter } satisfies AuthenticationVerification;
}

export function resolveRelyingParty(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || url.host;
  const proto = forwardedProto || url.protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  return {
    rpID: new URL(origin).hostname,
    origin,
    rpName: process.env.AEGIS_PANEL_NAME || "Aegis",
  };
}

function generateRecoveryCodes(count: number) {
  return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  });
}

function isPasskeyTransport(value: string): value is PasskeyTransport {
  return ["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"].includes(value);
}

function normalizePasskeyTransports(transports?: readonly string[]) {
  return (transports ?? []).filter(isPasskeyTransport);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array) {
  let binary = "";
  for (const item of value) {
    binary += String.fromCharCode(item);
  }
  return btoa(binary);
}

function base64urlToBase64(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return padded + "=".repeat((4 - (padded.length % 4 || 4)) % 4);
}