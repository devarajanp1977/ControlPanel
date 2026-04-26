// lib/auth/webauthn-browser.ts — browser WebAuthn utilities translate JSON-friendly options into native credential API calls.
type PasskeyTransport = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

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

export type RegistrationResponseJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: PasskeyTransport[];
  };
  clientExtensionResults?: AuthenticationExtensionsClientOutputs;
};

export type AuthenticationResponseJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string | null;
  };
  clientExtensionResults?: AuthenticationExtensionsClientOutputs;
};

export async function startRegistration(options: RegistrationOptionsJSON) {
  if (!navigator.credentials?.create) {
    throw new Error("This browser does not support passkey registration.");
  }
  const credential = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: base64urlToBytes(options.challenge),
      user: {
        ...options.user,
        id: base64urlToBytes(options.user.id),
      },
    },
  });
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Passkey registration was cancelled.");
  }
  const response = credential.response;
  if (!(response instanceof AuthenticatorAttestationResponse)) {
    throw new Error("Unexpected attestation response.");
  }
  return {
    id: credential.id,
    rawId: bytesToBase64url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: bytesToBase64url(response.clientDataJSON),
      attestationObject: bytesToBase64url(response.attestationObject),
      transports: normalizePasskeyTransports(typeof response.getTransports === "function" ? response.getTransports() : []),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  } satisfies RegistrationResponseJSON;
}

export async function startAuthentication(options: AuthenticationOptionsJSON) {
  if (!navigator.credentials?.get) {
    throw new Error("This browser does not support passkey sign-in.");
  }
  const credential = await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: base64urlToBytes(options.challenge),
      allowCredentials: options.allowCredentials?.map((item) => ({
        ...item,
        id: base64urlToBytes(item.id),
        transports: item.transports?.filter(isBrowserAuthenticatorTransport),
      })),
    },
  });
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Passkey sign-in was cancelled.");
  }
  const response = credential.response;
  if (!(response instanceof AuthenticatorAssertionResponse)) {
    throw new Error("Unexpected assertion response.");
  }
  return {
    id: credential.id,
    rawId: bytesToBase64url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: bytesToBase64url(response.clientDataJSON),
      authenticatorData: bytesToBase64url(response.authenticatorData),
      signature: bytesToBase64url(response.signature),
      userHandle: response.userHandle ? bytesToBase64url(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  } satisfies AuthenticationResponseJSON;
}

function isBrowserAuthenticatorTransport(value: PasskeyTransport): value is AuthenticatorTransport {
  return value !== "cable";
}

function isPasskeyTransport(value: string): value is PasskeyTransport {
  return ["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"].includes(value);
}

function normalizePasskeyTransports(transports: readonly string[]) {
  return transports.filter(isPasskeyTransport);
}

function base64urlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function bytesToBase64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const item of bytes) {
    binary += String.fromCharCode(item);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}