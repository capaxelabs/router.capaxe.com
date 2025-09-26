#!/bin/bash

echo "=== Video Test Mode Testing ==="
echo "Testing video generation with test=true parameter"
echo ""

# Test 1: Test Mode - Should return immediate mock response
echo "1. Testing Video Generation with test=true"
RESPONSE=$(curl -X POST "http://localhost:8787/v1/openai/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "google/veo-2",
    "prompt": "A robot dancing in a futuristic city",
    "duration": 2,
    "test": true,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }' \
  -s)

echo "Response: $RESPONSE"
echo ""

# Extract taskId from response
TASK_ID=$(echo "$RESPONSE" | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TASK_ID" ]; then
  echo "2. Task created successfully: $TASK_ID"
  echo "   Waiting 10 seconds before checking status..."
  sleep 10
  
  echo ""
  echo "3. Checking task status after 10 seconds"
  curl -X GET "http://localhost:8787/v1/tasks/$TASK_ID" \
    -H "Authorization: Bearer test-key" \
    -s | jq '.' || echo "jq not available - showing raw response"
    
  echo ""
  echo ""
  
  echo "4. Waiting another 2 minutes (test duration) then checking again..."
  echo "   (In real usage, test tasks complete after their duration parameter)"
  sleep 120
  
  echo ""
  echo "5. Checking task status after full test duration"
  curl -X GET "http://localhost:8787/v1/tasks/$TASK_ID" \
    -H "Authorization: Bearer test-key" \
    -s | jq '.' || echo "jq not available - showing raw response"
    
else
  echo "❌ Failed to create test task or extract task ID"
fi

echo ""
echo ""

# Test 2: Compare with regular mode (should go to async queue)
echo "6. Testing Regular Video Generation (without test=true)"
curl -X POST "http://localhost:8787/v1/openai/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "google/veo-2",
    "prompt": "A robot dancing in a futuristic city",
    "duration": 2,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }' \
  -s | jq '.' || echo "jq not available - showing raw response"

echo ""
echo ""

# Test 3: Test with different duration
echo "7. Testing with different duration (5 minutes)"
RESPONSE2=$(curl -X POST "http://localhost:8787/v1/openai/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "bytedance/seedance-1-pro",
    "prompt": "Ocean waves at sunset",
    "duration": 5,
    "test": true
  }' \
  -s)

echo "Response: $RESPONSE2"
echo ""

echo "=== Test Mode Testing Complete ==="
echo ""
echo "Summary:"
echo "- test=true should create immediate task response"
echo "- Task should show 'processing' initially" 
echo "- After duration minutes, task should auto-complete with mock video"
echo "- Regular requests (test=false/undefined) should use normal async flow"