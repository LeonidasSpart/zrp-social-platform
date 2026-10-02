import type { TokenScanErrorCode } from "./token-scanner";

/*
 * Shared HTTP mapping for TokenScanError, used by every route that calls
 * scanToken()/getTokenAnalytics() (both of which can throw it). Kept in
 * one place so the scanner route and the analytics route can never
 * silently diverge on what status/message a given failure code gets.
 */
export const SCAN_ERROR_STATUS: Record<TokenScanErrorCode, number> = {
  INVALID_MINT: 400,
  TOKEN_NOT_FOUND: 404,
  UNSUPPORTED_TOKEN_PROGRAM: 422,
  RPC_UNAVAILABLE: 503,
  RPC_TIMEOUT: 504,
  INTERNAL_SCAN_ERROR: 500,
};

export const SCAN_ERROR_MESSAGE: Record<TokenScanErrorCode, string> = {
  INVALID_MINT: "That doesn't look like a valid Solana address.",
  TOKEN_NOT_FOUND: "No token exists at this address on the network this scanner is connected to.",
  UNSUPPORTED_TOKEN_PROGRAM: "This address isn't owned by a known SPL token program (classic Token or Token-2022).",
  RPC_UNAVAILABLE: "The Solana network is temporarily unreachable or rate-limiting requests. Please try again shortly.",
  RPC_TIMEOUT: "The Solana network took too long to respond. Please try again.",
  INTERNAL_SCAN_ERROR: "Something went wrong while scanning this token.",
};
