"use client";

import { FC, useState } from "react";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { useToast } from "@/hooks/useToast";
import { LogoUpload } from "@/components/market/LogoUpload";
import { Keypair } from "@solana/web3.js";

interface TokenMetadataUpdaterProps {
  mintAddress: string;
  tokenName: string;
  tokenSymbol: string;
  updateAuthorityKeypair?: Keypair;
  onSuccess?: (metadataUri: string) => void;
}

export const TokenMetadataUpdater: FC<TokenMetadataUpdaterProps> = ({
  mintAddress,
  tokenName,
  tokenSymbol,
  updateAuthorityKeypair,
  onSuccess,
}) => {
  const { updating, error, updateMetadata } = useTokenMetadata();
  const { toast } = useToast();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");

  const handleLogoUpload = async (url: string) => {
    setLogoUrl(url);
    toast("Logo uploaded! Now updating token metadata...", "success");

    // Automatically update metadata when logo is uploaded
    const result = await updateMetadata({
      mintAddress,
      name: tokenName,
      symbol: tokenSymbol,
      description: description || undefined,
      imageUrl: url,
      externalUrl: externalUrl || undefined,
      updateAuthorityKeypair,
    });

    if (result.success && result.metadataUri) {
      toast("Token metadata updated successfully!", "success");
      onSuccess?.(result.metadataUri);
    }
  };

  const handleUpdateWithoutLogo = async () => {
    const result = await updateMetadata({
      mintAddress,
      name: tokenName,
      symbol: tokenSymbol,
      description: description || undefined,
      imageUrl: logoUrl || undefined,
      externalUrl: externalUrl || undefined,
      updateAuthorityKeypair,
    });

    if (result.success && result.metadataUri) {
      toast("Token metadata updated successfully!", "success");
      onSuccess?.(result.metadataUri);
    } else if (error) {
      toast(error, "error");
    }
  };

  return (
    <div className="space-y-4">
      {/* Logo Upload */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
          Token Logo
        </h3>
        <LogoUpload
          slabAddress={mintAddress} // Using mint address as identifier
          currentLogoUrl={logoUrl}
          onSuccess={handleLogoUpload}
          size="lg"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your token..."
          className="w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[12px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]/40 focus:outline-none transition-colors resize-none"
          rows={3}
        />
      </div>

      {/* External URL */}
      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
          External URL (optional)
        </label>
        <input
          type="url"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          placeholder="https://..."
          className="w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[12px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]/40 focus:outline-none transition-colors font-mono"
        />
        <p className="mt-1 text-[10px] text-[var(--text-dim)]">
          Link to your project website or documentation
        </p>
      </div>

      {/* Update button (for updating description/url without logo change) */}
      {!updating && (description || externalUrl) && (
        <button
          onClick={handleUpdateWithoutLogo}
          disabled={updating}
          className="w-full border border-[var(--accent)]/50 bg-[var(--accent)]/[0.08] py-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] transition-all duration-200 hud-btn-corners hover:border-[var(--accent)] hover:bg-[var(--accent)]/[0.15] press disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-transparent disabled:text-[var(--text-dim)] disabled:opacity-50"
        >
          Update Metadata
        </button>
      )}

      {/* Status messages */}
      {updating && (
        <div className="p-3 border border-[var(--accent)]/30 bg-[var(--accent)]/[0.06]">
          <p className="text-xs text-[var(--accent)]">
            ⏳ Updating token metadata...
          </p>
        </div>
      )}

      {error && !updating && (
        <div className="p-3 border border-[var(--short)]/30 bg-[var(--short)]/[0.06]">
          <p className="text-xs text-[var(--short)]">❌ {error}</p>
        </div>
      )}

      {/* Info box */}
      <div className="p-3 border border-[var(--border)] bg-[var(--bg-elevated)]">
        <p className="text-[10px] text-[var(--text-secondary)]">
          <strong>Note:</strong> This will create a metadata JSON file and{" "}
          {updateAuthorityKeypair
            ? "update the on-chain metadata account. Your logo will be visible in wallets (Phantom) and explorers."
            : "upload it to storage. To update the on-chain metadata, you'll need to provide your update authority keypair."}
        </p>
      </div>
    </div>
  );
};
