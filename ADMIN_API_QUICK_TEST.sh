#!/bin/bash

# Quick test script for Admin API
# Usage: ./ADMIN_API_QUICK_TEST.sh

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:54445"
ADMIN_KEY="test-admin-key-12345"

echo -e "${BLUE}🧪 Testing ImageRouter Admin API${NC}"
echo "=================================="
echo ""

# Test 1: Health Check
echo -e "${BLUE}1️⃣  Health Check${NC}"
HEALTH=$(curl -s "${BASE_URL}/health")
if [[ $HEALTH == *"ok"* ]]; then
    echo -e "${GREEN}✅ Server is running${NC}"
else
    echo -e "${RED}❌ Server not responding${NC}"
    exit 1
fi
echo ""

# Test 2: Public Models API
echo -e "${BLUE}2️⃣  Public Models API (GET /v1/models)${NC}"
MODEL_COUNT=$(curl -s "${BASE_URL}/v1/models" | jq -r 'keys | length')
echo "Total models: ${MODEL_COUNT}"
if [ "$MODEL_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Models API working${NC}"
else
    echo -e "${RED}❌ Models API failed${NC}"
fi
echo ""

# Test 3: Models UI
echo -e "${BLUE}3️⃣  Models UI (GET /models/ui)${NC}"
UI_CHECK=$(curl -s "${BASE_URL}/models/ui" | grep -o "<title>ImageRouter Models")
if [[ ! -z "$UI_CHECK" ]]; then
    echo -e "${GREEN}✅ Models UI loading${NC}"
else
    echo -e "${RED}❌ Models UI failed${NC}"
fi
echo ""

# Test 4: Admin Authentication
echo -e "${BLUE}4️⃣  Admin API - Authentication${NC}"
AUTH_TEST=$(curl -s "${BASE_URL}/admin/models/stats" | jq -r '.message // .error')
if [[ $AUTH_TEST == *"Authorization"* ]]; then
    echo -e "${GREEN}✅ Authentication required (as expected)${NC}"
else
    echo -e "${RED}⚠️  Authentication not enforced${NC}"
fi
echo ""

# Test 5: Admin Stats
echo -e "${BLUE}5️⃣  Admin API - Get Stats${NC}"
STATS=$(curl -s -H "Authorization: Bearer ${ADMIN_KEY}" "${BASE_URL}/admin/models/stats")
TOTAL=$(echo $STATS | jq -r '.stats.total // 0')
ACTIVE=$(echo $STATS | jq -r '.stats.active // 0')
if [ "$TOTAL" -gt 0 ]; then
    echo "Total models: ${TOTAL}"
    echo "Active models: ${ACTIVE}"
    echo -e "${GREEN}✅ Admin stats working${NC}"
else
    echo -e "${RED}❌ Admin stats failed${NC}"
    echo "Response: $STATS"
fi
echo ""

# Test 6: Admin List Models
echo -e "${BLUE}6️⃣  Admin API - List Models${NC}"
LIST_COUNT=$(curl -s -H "Authorization: Bearer ${ADMIN_KEY}" "${BASE_URL}/admin/models?type=image" | jq -r '.count // 0')
if [ "$LIST_COUNT" -gt 0 ]; then
    echo "Image models: ${LIST_COUNT}"
    echo -e "${GREEN}✅ Admin list working${NC}"
else
    echo -e "${RED}❌ Admin list failed${NC}"
fi
echo ""

# Test 7: Admin Get Single Model
echo -e "${BLUE}7️⃣  Admin API - Get Single Model${NC}"
MODEL_ID="google%2Fgemini-2.5-flash"
SINGLE=$(curl -s -H "Authorization: Bearer ${ADMIN_KEY}" "${BASE_URL}/admin/models/${MODEL_ID}")
MODEL_NAME=$(echo $SINGLE | jq -r '.model.name // "null"')
if [[ $MODEL_NAME != "null" ]]; then
    echo "Model: ${MODEL_NAME}"
    echo -e "${GREEN}✅ Get single model working${NC}"
else
    echo -e "${RED}❌ Get single model failed${NC}"
fi
echo ""

# Test 8: Filter by Provider
echo -e "${BLUE}8️⃣  Admin API - Filter by Provider${NC}"
RUNWARE_COUNT=$(curl -s -H "Authorization: Bearer ${ADMIN_KEY}" "${BASE_URL}/admin/models?provider=runware" | jq -r '.count // 0')
echo "Runware models: ${RUNWARE_COUNT}"
if [ "$RUNWARE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Provider filtering working${NC}"
else
    echo -e "${RED}❌ Provider filtering failed${NC}"
fi
echo ""

echo "=================================="
echo -e "${GREEN}✨ Admin API Tests Complete!${NC}"
echo ""
echo "📝 Notes:"
echo "  - Server URL: ${BASE_URL}"
echo "  - Admin Key: ${ADMIN_KEY}"
echo "  - Model IDs with '/' must be URL-encoded (%2F)"
echo ""
echo "🔗 URLs:"
echo "  - Models UI: ${BASE_URL}/models/ui"
echo "  - Public API: ${BASE_URL}/v1/models"
echo "  - Admin API: ${BASE_URL}/admin/models"
echo ""
echo "📚 Documentation:"
echo "  - docs/ADMIN_API.md"
echo "  - docs/api/*.bru (Bruno collection)"
