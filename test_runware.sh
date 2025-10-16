#!/bin/bash

echo "Testing Runware Integration..."

# Test 1: Check if Runware models are available
echo "1. Testing /v1/models endpoint for Runware models..."
curl -X GET "http://localhost:8787/v1/models" \
  -H "Authorization: Bearer test-key" \
  -s | grep -o '"cyberdelia/CyberRealisticPony"' || echo "   ❌ CyberRealistic-Pony model not found"

curl -X GET "http://localhost:8787/v1/models" \
  -H "Authorization: Bearer test-key" \
  -s | grep -o '"briaai/RMBG-2.0"' && echo "   ✅ RMBG-2.0 model found" || echo "   ❌ RMBG-2.0 model not found"

echo ""

# Test 2: Test Runware image generation (Sync Mode - Development Only)
echo "2. Testing Runware Image Generation (Sync Mode)..."
curl -X POST "http://localhost:8787/v1/openai/images/generations?async=false" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "Lykon/DreamShaper",
    "prompt": "A beautiful sunset over mountains, photorealistic style",
    "n": 1,
    "size": "512x512",
    "quality": "medium"
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo ""

# Test 3: Test Runware background removal (RMBG-2.0)
echo "3. Testing Runware Background Removal..."
# Note: This would require an actual image to test properly
echo "   ⚠️  Background removal test requires actual image data"

echo ""

# Test 4: Test Runware Async Mode (Production)
echo "4. Testing Runware Async Mode..."
curl -X POST "http://localhost:8787/v1/openai/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "cyberdelia/CyberRealisticPony", 
    "prompt": "A cyberpunk cityscape at night",
    "n": 1
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo ""
echo "Runware Integration Test Complete!"