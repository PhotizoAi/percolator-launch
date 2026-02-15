#!/bin/bash
# Test script for logo upload API endpoints
# Usage: ./test-logo-upload.sh <slab_address>

set -e

SLAB_ADDRESS="$1"
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-your-api-key-here}"

if [ -z "$SLAB_ADDRESS" ]; then
  echo "Usage: $0 <slab_address>"
  echo "Example: $0 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  exit 1
fi

echo "Testing Logo Upload API"
echo "======================="
echo "Slab Address: $SLAB_ADDRESS"
echo "API Base URL: $API_BASE_URL"
echo ""

# Test 1: GET logo (should return null or existing logo)
echo "Test 1: GET /api/markets/$SLAB_ADDRESS/logo"
echo "-------------------------------------------"
curl -s "$API_BASE_URL/api/markets/$SLAB_ADDRESS/logo" | jq .
echo ""
echo ""

# Test 2: PUT logo URL (update with external URL)
echo "Test 2: PUT /api/markets/$SLAB_ADDRESS/logo"
echo "-------------------------------------------"
echo "Setting logo URL to a test image..."
curl -s -X PUT "$API_BASE_URL/api/markets/$SLAB_ADDRESS/logo" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"logo_url":"https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"}' \
  | jq .
echo ""
echo ""

# Test 3: Upload logo file (requires a test image file)
if [ -f "test-logo.png" ]; then
  echo "Test 3: POST /api/markets/$SLAB_ADDRESS/logo/upload"
  echo "-------------------------------------------"
  echo "Uploading test-logo.png..."
  curl -s -X POST "$API_BASE_URL/api/markets/$SLAB_ADDRESS/logo/upload" \
    -H "x-api-key: $API_KEY" \
    -F "logo=@test-logo.png" \
    | jq .
  echo ""
  echo ""
else
  echo "Test 3: SKIPPED (no test-logo.png file found)"
  echo "Create a test-logo.png file in the current directory to test file upload"
  echo ""
fi

# Test 4: Verify logo is set
echo "Test 4: Verify logo is set"
echo "-------------------------------------------"
curl -s "$API_BASE_URL/api/markets/$SLAB_ADDRESS/logo" | jq .
echo ""

echo ""
echo "Tests complete!"
echo ""
echo "Next steps:"
echo "1. Set up Supabase Storage bucket 'logos' (see LOGO_UPLOAD_SETUP.md)"
echo "2. Test logo display on /markets and /trade/$SLAB_ADDRESS"
echo "3. Try the upload UI at /upload-logo?slab=$SLAB_ADDRESS"
