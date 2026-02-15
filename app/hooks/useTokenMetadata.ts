"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";

interface UpdateMetadataParams {
  mintAddress: string;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  externalUrl?: string;
  updateAuthorityKeypair?: Keypair;
}

interface UseTokenMetadataResult {
  updating: boolean;
  error: string | null;
  metadataUri: string | null;
  updateMetadata: (params: UpdateMetadataParams) => Promise<{
    success: boolean;
    metadataUri?: string;
    signature?: string;
  }>;
}

export function useTokenMetadata(): UseTokenMetadataResult {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadataUri, setMetadataUri] = useState<string | null>(null);

  const updateMetadata = useCallback(async (params: UpdateMetadataParams) => {
    setUpdating(true);
    setError(null);

    try {
      const requestBody: Record<string, unknown> = {
        name: params.name,
        symbol: params.symbol,
      };

      if (params.description) {
        requestBody.description = params.description;
      }

      if (params.imageUrl) {
        requestBody.image_url = params.imageUrl;
      }

      if (params.externalUrl) {
        requestBody.external_url = params.externalUrl;
      }

      if (params.updateAuthorityKeypair) {
        requestBody.update_authority_keypair = JSON.stringify(
          Array.from(params.updateAuthorityKeypair.secretKey)
        );
      }

      const response = await fetch(
        `/api/tokens/${params.mintAddress}/metadata`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update metadata");
      }

      const data = await response.json();
      setMetadataUri(data.metadata_uri);

      return {
        success: true,
        metadataUri: data.metadata_uri,
        signature: data.on_chain_update?.signature,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("Token metadata update error:", err);
      return { success: false };
    } finally {
      setUpdating(false);
    }
  }, []);

  return {
    updating,
    error,
    metadataUri,
    updateMetadata,
  };
}
