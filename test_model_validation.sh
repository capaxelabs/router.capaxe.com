#!/bin/bash

# Test model validation before task creation
# This script tests that invalid models are rejected before creating a task


#!/bin/bash

# Test Models API Endpoints
echo "🧪 Testing Models API Endpoints"
echo "================================"
echo ""

BASE_URL="http://localhost:8787"

# Test 1: Get all models
echo "1️⃣  Testing GET /v1/models (all models)"
echo "----------------------------------------"
curl -s "${BASE_URL}/v1/models" | jq -r 'keys | length' | xargs echo "Total models:"
echo ""

# Test 2: Get image models only
echo "2️⃣  Testing GET /v1/models?type=image"
echo "----------------------------------------"
curl -s "${BASE_URL}/v1/models?type=image" | jq -r 'keys | length' | xargs echo "Image models:"
echo ""

# Test 3: Get video models only
echo "3️⃣  Testing GET /v1/models?type=video"
echo "----------------------------------------"
curl -s "${BASE_URL}/v1/models?type=video" | jq -r 'keys | length' | xargs echo "Video models:"
echo ""

# Test 4: Get models by provider
echo "4️⃣  Testing GET /v1/models?provider=gemini"
echo "----------------------------------------"
curl -s "${BASE_URL}/v1/models?provider=gemini" | jq -r 'keys | length' | xargs echo "Gemini models:"
echo ""

# Test 5: Sample model data
echo "5️⃣  Sample Model Data (google/gemini-2.5-flash)"
echo "----------------------------------------"
curl -s "${BASE_URL}/v1/models" | jq '.["google/gemini-2.5-flash"] | {id, name, type, arena_score, providers: [.providers[0].id]}'
echo ""

echo "✅ Tests complete! Visit http://localhost:8787/models/ui to see the UI"


echo "Testing model validation..."
echo ""

# Test 1: Invalid image model (video model for image generation)
echo "Test 1: Trying to generate image with video model (should fail with 400)"
curl -X POST http://localhost:8787/v1/openai/images/generations \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "runware/kling-2.1-standard",
    "prompt": "A cute cat",
    "n": 1,
    "size": "512x512"
  }' | jq .

echo ""
echo "---"
echo ""

# Test 2: Invalid video model (image model for video generation)
echo "Test 2: Trying to generate video with image model (should fail with 400)"
curl -X POST http://localhost:8787/v1/openai/videos/generations \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "runware/DreamShaper",
    "prompt": "A beautiful landscape",
    "duration": 5
  }' | jq .

echo ""
echo "---"
echo ""

# Test 3: Non-existent model
echo "Test 3: Trying to generate image with non-existent model (should fail with 400)"
curl -X POST http://localhost:8787/v1/openai/images/generations \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "runware/non-existent-model",
    "prompt": "A cute cat",
    "n": 1,
    "size": "512x512"
  }' | jq .

echo ""
echo "---"
echo ""

# Test 4: Valid image model (should succeed and create task)
echo "Test 4: Trying to generate image with valid image model (should succeed)"
curl -X POST http://localhost:8787/v1/openai/images/generations \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/imagen-4",
    "prompt": "A cute cat",
    "n": 1,
    "size": "512x512"
  }' | jq .

echo ""
echo "---"
echo ""

# Test 5: Valid video model (should succeed and create task)
echo "Test 5: Trying to generate video with valid video model (should succeed)"
curl -X POST http://localhost:8787/v1/openai/videos/generations \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "runware/kling-2.1-standard",
    "prompt": "A beautiful landscape",
    "duration": 5
  }' | jq .

echo ""
echo "All tests completed!"
