#!/bin/bash

# Runware Model Search API Test Script
# Tests various search filters and endpoints

BASE_URL="http://localhost:8787"

echo "======================================"
echo "Runware Model Search API Test Script"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to make request and display results
test_endpoint() {
  local name=$1
  local method=$2
  local url=$3
  local data=$4
  
  echo -e "${BLUE}Test: ${name}${NC}"
  echo "Method: $method"
  echo "URL: $url"
  
  if [ "$method" = "POST" ]; then
    echo "Body: $data"
    echo ""
    echo -e "${GREEN}Response:${NC}"
    curl -s -X POST "$url" \
      -H "Content-Type: application/json" \
      -d "$data" | jq '.'
  else
    echo ""
    echo -e "${GREEN}Response:${NC}"
    curl -s "$url" | jq '.'
  fi
  
  echo ""
  echo "--------------------------------------"
  echo ""
}

# Test 1: Search for realistic models
test_endpoint \
  "Search for realistic SDXL models" \
  "POST" \
  "$BASE_URL/v1/runware/models/search" \
  '{
    "search": "realistic",
    "category": "checkpoint",
    "architecture": "sdxl",
    "limit": 5
  }'

# Test 2: Search with tags filter
test_endpoint \
  "Search with tags filter (photorealistic)" \
  "POST" \
  "$BASE_URL/v1/runware/models/search" \
  '{
    "tags": ["photorealistic", "realistic"],
    "category": "checkpoint",
    "limit": 5
  }'

# Test 3: Search for FLUX models using GET
test_endpoint \
  "Search for FLUX models (GET method)" \
  "GET" \
  "$BASE_URL/v1/runware/models/search?architecture=flux1d&limit=5" \
  ""

# Test 4: Search for ControlNet models
test_endpoint \
  "Search for ControlNet models with Canny conditioning" \
  "GET" \
  "$BASE_URL/v1/runware/models/search?category=controlnet&conditioning=canny&limit=5" \
  ""

# Test 5: Search for inpainting models
test_endpoint \
  "Search for inpainting models" \
  "POST" \
  "$BASE_URL/v1/runware/models/search" \
  '{
    "category": "checkpoint",
    "type": "inpainting",
    "limit": 5
  }'

# Test 6: Search for LoRA models
test_endpoint \
  "Search for LoRA models" \
  "POST" \
  "$BASE_URL/v1/runware/models/search" \
  '{
    "category": "lora",
    "limit": 5
  }'

# Test 7: Get all models with pagination
test_endpoint \
  "List all models (page 1)" \
  "GET" \
  "$BASE_URL/v1/runware/models?offset=0&limit=10" \
  ""

# Test 8: Get all models (page 2)
test_endpoint \
  "List all models (page 2)" \
  "GET" \
  "$BASE_URL/v1/runware/models?offset=10&limit=10" \
  ""

# Test 9: Search for Stable Diffusion 3 models
test_endpoint \
  "Search for Stable Diffusion 3 models" \
  "GET" \
  "$BASE_URL/v1/runware/models/search?architecture=sd3&limit=5" \
  ""

# Test 10: Search with visibility filter
test_endpoint \
  "Search all public models" \
  "POST" \
  "$BASE_URL/v1/runware/models/search" \
  '{
    "visibility": "all",
    "limit": 10
  }'

echo ""
echo -e "${GREEN}======================================"
echo "All tests completed!"
echo "======================================${NC}"
