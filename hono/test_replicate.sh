#!/bin/bash

# Test Replicate Image Generation (Sync Mode - Development Only)
echo "Testing Replicate Image Generation (Sync)..."
curl -X POST http://localhost:8787/v1/openai/images/generations?async=false \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    "prompt": "A beautiful sunset over mountains",
    "n": 1,
    "size": "1024x1024"
  }'

echo -e "\n\n"

# Test Replicate Video Generation (Sync Mode - Development Only) 
echo "Testing Replicate Video Generation (Sync)..."
curl -X POST http://localhost:8787/v1/openai/videos/generations?async=false \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "minimax/video-01",
    "prompt": "A cat playing with a ball of yarn",
    "duration": 5,
    "aspect_ratio": "16:9"
  }'

echo -e "\n\n"

# Test Replicate Async Mode (Production - Returns Task ID)
echo "Testing Replicate Async Mode..."
curl -X POST http://localhost:8787/v1/openai/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    "prompt": "A robot in a futuristic city",
    "n": 1
  }'