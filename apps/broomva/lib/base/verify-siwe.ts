import { createPublicClient, type Hex, http } from "viem";
import { base } from "viem/chains";

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org"),
});

export async function verifyBaseSignature({
  address,
  message,
  signature,
}: {
  address: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  return await publicClient.verifyMessage({
    address: address as `0x${string}`,
    message,
    signature: signature as Hex,
  });
}

const NONCE_LINE = /^Nonce:\s*(\S+)\s*$/m;

export function extractSiweNonce(message: string): string | null {
  const match = message.match(NONCE_LINE);
  return match ? match[1] : null;
}
