# Admin API Documentation

Complete guide for managing models via the Admin API.

---

## 🔐 Authentication

All admin endpoints require an admin API key for authentication.

### Setting Up Admin Key

#### For Development (Local)
Add to `.dev.vars` file:
```bash
ADMIN_API_KEY=your-secure-admin-key-here
```

#### For Production (Cloudflare Workers)
Use Wrangler secrets:
```bash
wrangler secret put ADMIN_API_KEY
# Enter your secure admin key when prompted
```

### Using the Admin Key

Include in Authorization header:
```bash
Authorization: Bearer your-admin-key
```

Or direct token (both work):
```bash
Authorization: your-admin-key
```

---

## 📚 Available Endpoints

### Model Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/models` | List all models with filters |
| GET | `/admin/models/:id` | Get single model details |
| GET | `/admin/models/stats` | Get model statistics |
| POST | `/admin/models` | Create new model |
| PATCH | `/admin/models/:id` | Update existing model |
| PUT | `/admin/models/:id/status` | Update model status only |
| DELETE | `/admin/models/:id` | Delete model (soft/hard) |
| POST | `/admin/models/bulk` | Bulk import models |

---

## 🚀 Quick Start Examples

### 1. List All Active Image Models

```bash
curl -X GET "https://api.example.com/admin/models?type=image&status=active" \
  -H "Authorization: Bearer your-admin-key"
```

### 2. Create a New Model

```bash
curl -X POST "https://api.example.com/admin/models" \
  -H "Authorization: Bearer your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "google/gemini-3.0",
    "name": "Gemini 3.0",
    "slug": "gemini-30",
    "type": "image",
    "status": "beta",
    "providers": [{
      "id": "gemini",
      "model_name": "gemini-3.0-preview",
      "pricing": {
        "type": "fixed",
        "value": 0.05
      }
    }],
    "releaseDate": "2025-03-01",
    "description": "Next generation Gemini model",
    "capabilities": {
      "supportsImage": true,
      "aspectRatios": ["1:1", "16:9"]
    },
    "tags": ["beta", "google"]
  }'
```

### 3. Update Model Description

```bash
curl -X PATCH "https://api.example.com/admin/models/google/gemini-3.0" \
  -H "Authorization: Bearer your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description here",
    "arenaScore": 1200
  }'
```

### 4. Enable/Disable a Model

```bash
# Disable model
curl -X PUT "https://api.example.com/admin/models/google/gemini-3.0/status" \
  -H "Authorization: Bearer your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}'

# Enable model
curl -X PUT "https://api.example.com/admin/models/google/gemini-3.0/status" \
  -H "Authorization: Bearer your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

### 5. Soft Delete a Model

```bash
curl -X DELETE "https://api.example.com/admin/models/google/gemini-3.0" \
  -H "Authorization: Bearer your-admin-key"
```

### 6. Get Model Statistics

```bash
curl -X GET "https://api.example.com/admin/models/stats" \
  -H "Authorization: Bearer your-admin-key"
```

---

## 📝 Model Schema Reference

### Required Fields

```typescript
{
  id: string              // Unique identifier (e.g., "google/gemini-3.0")
  name: string            // Human-readable name
  slug: string            // URL-friendly slug (must be unique)
  type: "image" | "video" // Model type
  providers: Array<{      // At least one provider required
    id: string            // Provider identifier
    model_name: string    // Provider's model name
    pricing: {
      type: string        // "fixed", "calculated", "post_generation"
      value: number       // Price in USD
    }
  }>
  releaseDate: string     // ISO 8601 date
}
```

### Optional Fields

```typescript
{
  status?: "active" | "inactive" | "deprecated" | "beta"
  isPublic?: boolean
  arenaScore?: number
  description?: string
  examples?: Array<{
    image?: string
    video?: string
    prompt?: string
    parameters?: object
  }>
  capabilities?: {
    supportsImage?: boolean
    supportsMask?: boolean
    supportsQuality?: boolean
    aspectRatios?: string[]
    resolutions?: string[]
    maxResolution?: string
    supportsNegativePrompt?: boolean
    supportsSteps?: boolean
    maxDurationSeconds?: number
  }
  applyImageFn?: string        // Function name from registry
  applyMaskFn?: string
  applyQualityFn?: string
  postCalcPriceFn?: string
  validateParamsFn?: string
  tags?: string[]
  category?: string
  maxRequestsPerDay?: number
  requiresWhitelist?: boolean
}
```

---

## 🎯 Common Use Cases

### Use Case 1: Add a New Model

**Scenario**: New model released by provider

**Steps**:
1. Create model entry with status "beta"
2. Test with limited users
3. Update status to "active" when ready

```bash
# Step 1: Create as beta
POST /admin/models
{
  "id": "google/imagen-5",
  "status": "beta",
  ...
}

# Step 2: Test...

# Step 3: Activate
PUT /admin/models/google/imagen-5/status
{ "status": "active" }
```

### Use Case 2: Update Pricing

**Scenario**: Provider changes pricing

```bash
PATCH /admin/models/google/gemini-3.0
{
  "providers": [{
    "id": "gemini",
    "model_name": "gemini-3.0-preview",
    "pricing": {
      "type": "fixed",
      "value": 0.04  // Updated price
    }
  }]
}
```

### Use Case 3: Deprecate Old Model

**Scenario**: Model is outdated but still functional

```bash
PUT /admin/models/google/imagen-3/status
{ "status": "deprecated" }
```

### Use Case 4: Emergency Disable

**Scenario**: Model has issues and needs immediate disable

```bash
# Quick disable
PUT /admin/models/problematic-model/status
{ "status": "inactive" }

# Or soft delete
DELETE /admin/models/problematic-model
```

### Use Case 5: Bulk Import from File

**Scenario**: Migrating models from another system

```bash
# Prepare models.json with array of models
curl -X POST "https://api.example.com/admin/models/bulk" \
  -H "Authorization: Bearer your-admin-key" \
  -H "Content-Type: application/json" \
  -d @models.json
```

---

## 🔒 Security Best Practices

### 1. Secure Admin Key
- Use a strong, random key (min 32 characters)
- Never commit to version control
- Rotate periodically
- Use different keys for dev/staging/prod

### 2. Access Control
- Limit admin key distribution
- Use separate keys for different admins (future enhancement)
- Monitor admin API usage
- Set up alerts for suspicious activity

### 3. Audit Trail
- All admin actions are logged
- Review logs regularly
- Track who made what changes

---

## ⚠️ Error Handling

### Common Error Responses

#### 401 Unauthorized
```json
{
  "success": false,
  "message": "Missing Authorization header"
}
```

**Solution**: Include Authorization header with valid admin key

#### 403 Forbidden
```json
{
  "success": false,
  "message": "Invalid admin API key"
}
```

**Solution**: Check admin key is correct

#### 404 Not Found
```json
{
  "success": false,
  "error": "Model not found"
}
```

**Solution**: Verify model ID is correct

#### 409 Conflict
```json
{
  "success": false,
  "error": "Model with this ID or slug already exists"
}
```

**Solution**: Use unique ID and slug

#### 400 Bad Request
```json
{
  "success": false,
  "error": "Missing required field: providers"
}
```

**Solution**: Include all required fields

---

## 📊 Response Formats

### Success Response (Create/Update)
```json
{
  "success": true,
  "message": "Model created successfully",
  "model": { /* model object */ }
}
```

### Success Response (List)
```json
{
  "success": true,
  "count": 22,
  "models": [ /* array of models */ ]
}
```

### Success Response (Delete)
```json
{
  "success": true,
  "message": "Model deactivated (soft delete)",
  "modelId": "google/gemini-3.0"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details"
}
```

---

## 🧪 Testing with Bruno

All admin endpoints are documented as `.bru` files in `docs/api/`:

- `Admin - Create Model.bru`
- `Admin - Update Model.bru`
- `Admin - Update Model Status.bru`
- `Admin - List Models.bru`
- `Admin - Get Model.bru`
- `Admin - Delete Model.bru`
- `Admin - Bulk Import Models.bru`
- `Admin - Model Stats.bru`

**Setup**:
1. Open Bruno
2. Import collection from `docs/api/`
3. Set environment variable `ADMIN_API_KEY`
4. Run requests

---

## 🔧 Troubleshooting

### Admin API Not Available
**Error**: "Admin API is not configured"

**Solution**: Set ADMIN_API_KEY environment variable
```bash
# Development
echo "ADMIN_API_KEY=your-key" >> .dev.vars

# Production
wrangler secret put ADMIN_API_KEY
```

### Cache Not Clearing
**Issue**: Changes not reflected immediately

**Solution**: Cache is automatically cleared, but TTL is 5 minutes. Wait or restart dev server.

### Invalid JSON in Fields
**Issue**: Providers/capabilities showing as strings

**Solution**: Ensure JSON fields are properly stringified in database but parsed in responses

---

## 📖 Related Documentation

- [Model Database Proposal](MODEL_DATABASE_PROPOSAL.md) - Design details
- [Quick Model Database Guide](QUICK_MODEL_DATABASE_GUIDE.md) - Implementation reference
- [Main README](../README.md) - Project setup
- [TODO](../TODO.md) - Phase 5 progress

---

## 💡 Tips & Tricks

### 1. Test Changes Safely
Create models with status "beta" first:
```json
{ "status": "beta", "requiresWhitelist": true }
```

### 2. Quick Status Toggle
Use the dedicated status endpoint for faster updates:
```bash
PUT /admin/models/:id/status
```

### 3. Bulk Operations
For multiple changes, use bulk import:
- Export current models
- Modify in editor
- Bulk import with changes

### 4. Monitoring
Check stats regularly:
```bash
GET /admin/models/stats
```

### 5. Cache Performance
- First query hits database
- Subsequent queries use cache (5 min)
- Updates automatically clear cache

---

**Need Help?** Check the Bruno collection for working examples of all endpoints!
