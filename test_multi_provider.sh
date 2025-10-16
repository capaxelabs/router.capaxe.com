#!/bin/bash

echo "=== Multi-Provider Selection Test ==="
echo "Testing how Seedance chooses between Runware, Replicate, WaveSpeed"
echo ""

# Test 1: Default Provider Selection (Text-to-Video)
echo "1. Default Provider Selection (Text-to-Video)"
echo "Expected: Replicate (balanced cost/quality for T2V)"
curl -X POST "http://localhost:8787/v1/openai/videos/generations?async=false" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "bytedance/seedance-1-pro",
    "prompt": "A robot dancing in a neon-lit city",
    "duration": 5
  }' \
  -s -o /dev/null -w "HTTP Status: %{http_code}\n"

echo ""

# Test 2: Image-to-Video Selection
echo "2. Image-to-Video Provider Selection"  
echo "Expected: Runware (best I2V performance)"
curl -X POST "http://localhost:8787/v1/openai/videos/generations?async=false" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "bytedance/seedance-1-pro",
    "prompt": "Make this image dance",
    "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "duration": 5
  }' \
  -s -o /dev/null -w "HTTP Status: %{http_code}\n"

echo ""

# Test 3: Explicit Provider Selection - WaveSpeed
echo "3. Explicit Provider Selection - WaveSpeed"
curl -X POST "http://localhost:8787/v1/openai/videos/generations?async=false" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "bytedance/seedance-1-pro",
    "prompt": "A cat playing with yarn",
    "provider": "wavespeed",
    "duration": 5
  }' \
  -s -o /dev/null -w "HTTP Status: %{http_code}\n"

echo ""

# Test 4: Explicit Provider Selection - Replicate  
echo "4. Explicit Provider Selection - Replicate"
curl -X POST "http://localhost:8787/v1/openai/videos/generations?async=false" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "bytedance/seedance-1-pro", 
    "prompt": "Ocean waves crashing on rocks",
    "provider": "replicate",
    "duration": 5
  }' \
  -s -o /dev/null -w "HTTP Status: %{http_code}\n"

echo ""

# Test 5: Invalid Provider Fallback
echo "5. Invalid Provider Fallback"
echo "Expected: Falls back to first provider (Runware)"
curl -X POST "http://localhost:8787/v1/openai/videos/generations?async=false" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "bytedance/seedance-1-pro",
    "prompt": "A space station orbiting Earth",
    "provider": "nonexistent",
    "duration": 5
  }' \
  -s -o /dev/null -w "HTTP Status: %{http_code}\n"

echo ""

# Test 6: Test Runware Image Generation 
echo "6. Test Runware Image Generation"
curl -X POST "http://localhost:8787/v1/openai/images/generations?async=false" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "Lykon/DreamShaper",
    "prompt": "A beautiful landscape",
    "quality": "high"
  }' \
  -s -o /dev/null -w "HTTP Status: %{http_code}\n"

echo ""

# Test 7: Check Model Endpoint Shows All Providers
echo "7. Check Model Endpoint Shows All Providers"
echo "Expected: Should list 3 providers for Seedance (runware, replicate, wavespeed)"
curl -X GET "http://localhost:8787/v1/models" \
  -H "Authorization: Bearer test-key" \
  -s | jq '."bytedance/seedance-1-pro".providers[].id' 2>/dev/null || echo "jq not available - check manually"

echo ""
echo "=== Multi-Provider Test Complete ==="