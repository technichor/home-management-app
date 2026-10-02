import { randomInt } from "node:crypto";

// No 0/O/1/I/L, so a code read aloud or copied by hand survives.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 8;

export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function normalizeJoinCode(input: string): string {
  return input.replace(/[\s-]+/g, "").toUpperCase();
}
