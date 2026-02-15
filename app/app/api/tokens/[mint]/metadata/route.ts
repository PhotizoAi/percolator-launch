import { NextRequest, NextResponse } from "next/server";
import { requireAuth, UNAUTHORIZED } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase";
import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import {
  createUpdateMetadataAccountV2Instruction,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import { generateTokenMetadata, validateTokenMetadata } from "@/lib/metadata";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// GET /api/tokens/[mint]/metadata - Get metadata JSON for a token
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;

  // Validate mint address
  try {
    new PublicKey(mint);
  } catch {
    return NextResponse.json(
      { error: "Invalid mint address" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  try {
    // Try to fetch existing metadata JSON from storage
    const { data, error } = await supabase
      .storage
      .from("logos")
      .download(`token-metadata/${mint}.json`);

    if (error) {
      // If not found, try to generate from on-chain data
      return NextResponse.json(
        { error: "Metadata not found" },
        { status: 404 }
      );
    }

    const text = await data.text();
    const metadata = JSON.parse(text);

    return NextResponse.json({ metadata });
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch metadata" },
      { status: 500 }
    );
  }
}

// POST /api/tokens/[mint]/metadata - Create/update metadata JSON and update on-chain
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  if (!requireAuth(req)) return UNAUTHORIZED;

  const { mint } = await params;
  const body = await req.json();

  const {
    name,
    symbol,
    description,
    image_url,
    external_url,
    update_authority_keypair, // Base58 encoded private key
  } = body;

  if (!name || !symbol) {
    return NextResponse.json(
      { error: "Name and symbol are required" },
      { status: 400 }
    );
  }

  // Validate mint address
  let mintPubkey: PublicKey;
  try {
    mintPubkey = new PublicKey(mint);
  } catch {
    return NextResponse.json(
      { error: "Invalid mint address" },
      { status: 400 }
    );
  }

  // Generate metadata JSON
  const metadata = generateTokenMetadata({
    name,
    symbol,
    description,
    imageUrl: image_url,
    externalUrl: external_url,
  });

  // Validate metadata
  const validation = validateTokenMetadata(metadata);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Invalid metadata", details: validation.errors },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  try {
    // Upload metadata JSON to Supabase Storage
    const metadataJson = JSON.stringify(metadata, null, 2);
    const metadataBuffer = Buffer.from(metadataJson, 'utf-8');

    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from("logos")
      .upload(`token-metadata/${mint}.json`, metadataBuffer, {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      console.error("Metadata upload error:", uploadError);
      return NextResponse.json(
        { error: `Failed to upload metadata: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL for the metadata JSON
    const { data: urlData } = supabase
      .storage
      .from("logos")
      .getPublicUrl(`token-metadata/${mint}.json`);

    const metadataUri = urlData.publicUrl;

    // If update authority keypair is provided, update on-chain metadata
    let onChainUpdateResult = null;
    if (update_authority_keypair) {
      try {
        const cfg = getConfig();
        const connection = new Connection(cfg.rpcUrl, "confirmed");

        // Decode the update authority keypair
        const updateAuthority = Keypair.fromSecretKey(
          Buffer.from(JSON.parse(update_authority_keypair))
        );

        // Derive metadata PDA
        const [metadataPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mintPubkey.toBuffer(),
          ],
          TOKEN_METADATA_PROGRAM_ID
        );

        // Create update instruction
        const updateInstruction = createUpdateMetadataAccountV2Instruction(
          {
            metadata: metadataPDA,
            updateAuthority: updateAuthority.publicKey,
          },
          {
            updateMetadataAccountArgsV2: {
              data: {
                name,
                symbol,
                uri: metadataUri,
                sellerFeeBasisPoints: 0,
                creators: null,
                collection: null,
                uses: null,
              },
              updateAuthority: updateAuthority.publicKey,
              primarySaleHappened: false,
              isMutable: true,
            },
          }
        );

        // Create and send transaction
        const tx = new Transaction().add(updateInstruction);
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = updateAuthority.publicKey;
        tx.sign(updateAuthority);

        const signature = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
        });

        // Wait for confirmation
        await connection.confirmTransaction(signature, "confirmed");

        onChainUpdateResult = {
          signature,
          metadata_address: metadataPDA.toBase58(),
        };
      } catch (error) {
        console.error("On-chain update error:", error);
        // Don't fail the whole request if on-chain update fails
        onChainUpdateResult = {
          error: error instanceof Error ? error.message : "Failed to update on-chain metadata",
        };
      }
    }

    return NextResponse.json({
      message: "Metadata uploaded successfully",
      metadata_uri: metadataUri,
      metadata,
      on_chain_update: onChainUpdateResult,
    }, { status: 200 });

  } catch (error) {
    console.error("Metadata creation error:", error);
    return NextResponse.json(
      { error: "Failed to create metadata" },
      { status: 500 }
    );
  }
}
