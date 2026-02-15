"use client";

import { FC, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { LogoUpload } from "@/components/market/LogoUpload";
import { useToast } from "@/hooks/useToast";

const HELIUS_RPC = `https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY ?? ""}`;

const cardClass = "border border-[var(--border)] bg-[var(--panel-bg)] p-5 transition-all";
const btnPrimary = "border border-[var(--accent)]/50 bg-[var(--accent)]/[0.08] py-3 px-6 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] transition-all duration-200 hud-btn-corners hover:border-[var(--accent)] hover:bg-[var(--accent)]/[0.15] press disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-transparent disabled:text-[var(--text-dim)] disabled:opacity-50";
const inputClass = "w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[12px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]/40 focus:outline-none transition-colors";

function UpdateTokenMetadataPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey } = useWallet();
  const { updating, error, updateMetadata } = useTokenMetadata();
  const { toast } = useToast();

  const mintParam = searchParams.get("mint");
  const [mintAddress, setMintAddress] = useState(mintParam || "");
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [updateAuthorityKey, setUpdateAuthorityKey] = useState("");
  const [isUpdateAuthority, setIsUpdateAuthority] = useState(false);
  const [checkingAuthority, setCheckingAuthority] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [success, setSuccess] = useState(false);
  const [metadataUri, setMetadataUri] = useState<string | null>(null);

  // Check if wallet is the update authority
  useEffect(() => {
    if (!mintAddress || !publicKey) return;

    const checkAuthority = async () => {
      setCheckingAuthority(true);
      try {
        const connection = new Connection(HELIUS_RPC, "confirmed");
        const mintPubkey = new PublicKey(mintAddress);

        // Get token metadata account
        const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
        const [metadataPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
          TOKEN_METADATA_PROGRAM_ID
        );

        const accountInfo = await connection.getAccountInfo(metadataPDA);
        if (accountInfo) {
          // Parse metadata (simplified - in production use proper deserializer)
          // For now, just check if our wallet matches
          setTokenInfo({ exists: true });
          
          // In a real implementation, we'd parse the metadata account to check updateAuthority
          // For now, we'll assume the connected wallet might be the authority
          setIsUpdateAuthority(true);
        }
      } catch (err) {
        console.error("Error checking authority:", err);
        setIsUpdateAuthority(false);
      } finally {
        setCheckingAuthority(false);
      }
    };

    checkAuthority();
  }, [mintAddress, publicKey]);

  const handleLogoUpload = (url: string) => {
    setLogoUrl(url);
    toast("Logo uploaded successfully!", "success");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!mintAddress || !tokenName || !tokenSymbol) {
      toast("Please fill in all required fields", "error");
      return;
    }

    // Parse update authority keypair if provided
    let updateAuthorityKeypair: Keypair | undefined;
    if (updateAuthorityKey) {
      try {
        const secretKey = JSON.parse(updateAuthorityKey);
        updateAuthorityKeypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
      } catch (err) {
        toast("Invalid update authority keypair format", "error");
        return;
      }
    }

    const result = await updateMetadata({
      mintAddress,
      name: tokenName,
      symbol: tokenSymbol,
      description: description || undefined,
      imageUrl: logoUrl || undefined,
      externalUrl: externalUrl || undefined,
      updateAuthorityKeypair,
    });

    if (result.success) {
      setSuccess(true);
      setMetadataUri(result.metadataUri || null);
      toast("Token metadata updated successfully!", "success");
    }
  };

  return (
    <div className="min-h-[calc(100vh-48px)] relative">
      {/* Grid background */}
      <div className="absolute inset-x-0 top-0 h-48 bg-grid pointer-events-none" />

      <div className="relative mx-auto max-w-2xl px-4 py-10">
        <ScrollReveal>
          <div className="mb-8 text-center">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.25em] text-[var(--accent)]/60">
              // token metadata
            </div>
            <h1 className="text-xl font-medium tracking-[-0.01em] text-white sm:text-2xl" style={{ fontFamily: "var(--font-heading)" }}>
              <span className="font-normal text-white/50">Update Token </span>Metadata
            </h1>
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
              Add logo and metadata to make your token visible in wallets and explorers
            </p>
          </div>
        </ScrollReveal>

        <div className="max-w-xl mx-auto space-y-6">
          {/* Step 1: Token Info */}
          <ScrollReveal delay={0.1}>
            <div className={cardClass}>
              <h2 className="mb-3 text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--text-muted)]">
                Step 1 · Token Information
              </h2>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                    Mint Address *
                  </label>
                  <input
                    type="text"
                    value={mintAddress}
                    onChange={(e) => setMintAddress(e.target.value.trim())}
                    placeholder="Enter token mint address..."
                    className={`${inputClass} font-mono`}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                      Token Name *
                    </label>
                    <input
                      type="text"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                      placeholder="e.g., My Token"
                      className={inputClass}
                      maxLength={32}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                      Symbol *
                    </label>
                    <input
                      type="text"
                      value={tokenSymbol}
                      onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                      placeholder="e.g., MTK"
                      className={inputClass}
                      maxLength={10}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                    Description (optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your token..."
                    className={`${inputClass} resize-none`}
                    rows={3}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                    External URL (optional)
                  </label>
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://..."
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </form>
            </div>
          </ScrollReveal>

          {/* Step 2: Logo Upload */}
          {mintAddress && (
            <ScrollReveal delay={0.2}>
              <div className={cardClass}>
                <h2 className="mb-3 text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--text-muted)]">
                  Step 2 · Token Logo
                </h2>
                <LogoUpload
                  slabAddress={mintAddress}
                  currentLogoUrl={logoUrl}
                  onSuccess={handleLogoUpload}
                  size="lg"
                />
              </div>
            </ScrollReveal>
          )}

          {/* Step 3: Update Authority (optional) */}
          <ScrollReveal delay={0.3}>
            <div className={cardClass}>
              <h2 className="mb-3 text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--text-muted)]">
                Step 3 · Update Authority (optional)
              </h2>
              <p className="mb-3 text-[10px] text-[var(--text-secondary)]">
                To update the on-chain metadata, paste your update authority keypair (JSON array format).
                If you skip this, only the off-chain metadata JSON will be created.
              </p>
              <textarea
                value={updateAuthorityKey}
                onChange={(e) => setUpdateAuthorityKey(e.target.value)}
                placeholder='[123,45,67,...] (your secret key as JSON array)'
                className={`${inputClass} font-mono resize-none`}
                rows={4}
              />
              <p className="mt-1 text-[9px] text-[var(--text-dim)]">
                ⚠️ Never share your private keys. This stays in your browser.
              </p>
            </div>
          </ScrollReveal>

          {/* Submit Button */}
          {!success && (
            <ScrollReveal delay={0.4}>
              <button
                onClick={handleSubmit}
                disabled={updating || !mintAddress || !tokenName || !tokenSymbol}
                className={btnPrimary}
              >
                {updating ? "Updating..." : "Update Token Metadata"}
              </button>

              {error && (
                <div className="mt-3 p-3 border border-[var(--short)]/30 bg-[var(--short)]/[0.06]">
                  <p className="text-xs text-[var(--short)]">❌ {error}</p>
                </div>
              )}
            </ScrollReveal>
          )}

          {/* Success State */}
          {success && metadataUri && (
            <ScrollReveal delay={0.4}>
              <div className={`${cardClass} border-[var(--accent)]/30`}>
                <h2 className="mb-3 text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--accent)]">
                  ✅ Metadata Updated
                </h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-[var(--text-dim)] mb-1">Metadata URI:</p>
                    <code className="block overflow-x-auto bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-[10px] text-white">
                      {metadataUri}
                    </code>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`https://explorer.solana.com/address/${mintAddress}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={btnPrimary}
                    >
                      View on Solana Explorer →
                    </Link>
                    <p className="text-[10px] text-[var(--text-secondary)] text-center">
                      Your token logo should now appear in Phantom wallet and Solana Explorer!
                    </p>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* Info Box */}
          <ScrollReveal delay={0.5}>
            <div className="text-center space-y-2">
              <p className="text-[11px] text-[var(--text-dim)]">
                Need to create a token first?{" "}
                <Link href="/devnet-mint" className="text-[var(--accent)] hover:underline">
                  Go to Token Factory →
                </Link>
              </p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </div>
  );
}

export default function UpdateTokenMetadataPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    }>
      <UpdateTokenMetadataPageInner />
    </Suspense>
  );
}
