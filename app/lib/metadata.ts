/**
 * Utility functions for creating and uploading Metaplex token metadata JSON
 */

export interface TokenMetadata {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  properties?: {
    files?: Array<{
      uri: string;
      type: string;
    }>;
    category?: string;
  };
}

/**
 * Generate Metaplex-compatible metadata JSON
 */
export function generateTokenMetadata(params: {
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  externalUrl?: string;
}): TokenMetadata {
  const metadata: TokenMetadata = {
    name: params.name,
    symbol: params.symbol,
  };

  if (params.description) {
    metadata.description = params.description;
  }

  if (params.imageUrl) {
    metadata.image = params.imageUrl;
    metadata.properties = {
      files: [
        {
          uri: params.imageUrl,
          type: getImageMimeType(params.imageUrl),
        },
      ],
      category: "image",
    };
  }

  if (params.externalUrl) {
    metadata.external_url = params.externalUrl;
  }

  return metadata;
}

/**
 * Get MIME type from image URL
 */
function getImageMimeType(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
  };
  return mimeTypes[ext || ''] || 'image/png';
}

/**
 * Validate metadata JSON against Metaplex standard
 */
export function validateTokenMetadata(metadata: TokenMetadata): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!metadata.name || metadata.name.length === 0) {
    errors.push('Name is required');
  }

  if (!metadata.symbol || metadata.symbol.length === 0) {
    errors.push('Symbol is required');
  }

  if (metadata.symbol && metadata.symbol.length > 10) {
    errors.push('Symbol must be 10 characters or less');
  }

  if (metadata.name && metadata.name.length > 32) {
    errors.push('Name must be 32 characters or less');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
