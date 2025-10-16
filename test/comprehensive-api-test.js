#!/usr/bin/env node

/**
 * Comprehensive API Test Suite for ImageRouter Hono API
 * Tests all endpoints: Images, Videos, Text-to-Image, Image-to-Image, Image-to-Video, Text-to-Video
 * Includes R2 storage integration testing
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:8787',
  apiKey: 'test-api-key-1234567890abcdef1234567890abcdef1234567890abcdef123',
  testImagePath: path.join(__dirname, 'fixtures', 'test-image.png'),
  outputDir: path.join(__dirname, 'output'),
  timeout: 30000 // 30 seconds timeout
}

// Test Results Tracking
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  results: []
}

// Ensure test directories exist
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true })
}

// Create test fixtures directory and sample image if not exists
const fixturesDir = path.join(__dirname, 'fixtures')
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true })
}

// Create a simple test image file if it doesn't exist
if (!fs.existsSync(CONFIG.testImagePath)) {
  // Create a minimal PNG file (1x1 red pixel)
  const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
    0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ])
  fs.writeFileSync(CONFIG.testImagePath, pngBuffer)
  console.log('✅ Created test image fixture')
}

// Utility functions
function logTest(name, status, message = '', duration = 0) {
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
  console.log(`${emoji} ${name} ${status} ${duration > 0 ? `(${duration}ms)` : ''} ${message}`)
  
  testResults.total++
  if (status === 'PASS') testResults.passed++
  if (status === 'FAIL') testResults.failed++
  
  testResults.results.push({ name, status, message, duration })
}

function saveResponse(filename, data) {
  const outputPath = path.join(CONFIG.outputDir, filename)
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2))
  console.log(`📁 Saved response to ${outputPath}`)
}

async function makeRequest(endpoint, options = {}) {
  const startTime = Date.now()
  
  const defaultOptions = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${CONFIG.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    timeout: CONFIG.timeout
  }
  
  const finalOptions = { ...defaultOptions, ...options }
  
  try {
    const response = await fetch(`${CONFIG.baseUrl}${endpoint}`, finalOptions)
    const duration = Date.now() - startTime
    
    let data
    const contentType = response.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      data = await response.json()
    } else if (contentType?.includes('video/') || contentType?.includes('image/')) {
      data = await response.arrayBuffer()
    } else {
      data = await response.text()
    }
    
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data,
      duration
    }
  } catch (error) {
    const duration = Date.now() - startTime
    return {
      status: 0,
      statusText: 'Network Error',
      error: error.message,
      duration
    }
  }
}

// Test Cases

async function testHealthCheck() {
  console.log('\n🏥 Testing Health Check...')
  
  const response = await makeRequest('/health')
  
  if (response.status === 200) {
    logTest('Health Check', 'PASS', 'Server is healthy', response.duration)
    saveResponse('health-check.json', response.data)
  } else {
    logTest('Health Check', 'FAIL', `Status: ${response.status}`, response.duration)
  }
}

async function testApiInfo() {
  console.log('\n📋 Testing API Info...')
  
  const response = await makeRequest('/')
  
  if (response.status === 200 && response.data?.name) {
    logTest('API Info', 'PASS', `Version: ${response.data.version}`, response.duration)
    saveResponse('api-info.json', response.data)
  } else {
    logTest('API Info', 'FAIL', `Status: ${response.status}`, response.duration)
  }
}

async function testModelsListing() {
  console.log('\n📝 Testing Models Listing...')
  
  const response = await makeRequest('/v1/models')
  
  if (response.status === 200 && response.data?.data) {
    const modelCount = response.data.data.length
    logTest('Models Listing', 'PASS', `Found ${modelCount} models`, response.duration)
    saveResponse('models-list.json', response.data)
  } else {
    logTest('Models Listing', 'FAIL', `Status: ${response.status}`, response.duration)
  }
}

async function testTextToImage() {
  console.log('\n🎨 Testing Text-to-Image Generation...')
  
  const payload = {
    model: 'google/gemini-2.5-flash',
    prompt: 'A beautiful landscape with mountains and a lake at sunset',
    n: 1,
    size: '1024x1024',
    response_format: 'url'
  }
  
  const response = await makeRequest('/v1/openai/images/generations', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  
  if (response.status === 200 && response.data?.data?.[0]?.url) {
    const url = response.data.data[0].url
    const cost = response.data.cost
    logTest('Text-to-Image', 'PASS', `Generated image: ${url}, Cost: $${cost}`, response.duration)
    saveResponse('text-to-image.json', response.data)
  } else {
    logTest('Text-to-Image', 'FAIL', `Status: ${response.status}, Error: ${response.data?.error?.message}`, response.duration)
  }
}

async function testTextToImageBase64() {
  console.log('\n🎨 Testing Text-to-Image (Base64)...')
  
  const payload = {
    model: 'google/gemini-2.5-flash',
    prompt: 'A cute cartoon robot in a garden',
    n: 1,
    size: '512x512',
    response_format: 'b64_json'
  }
  
  const response = await makeRequest('/v1/openai/images/generations', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  
  if (response.status === 200 && response.data?.data?.[0]?.b64_json) {
    const b64Length = response.data.data[0].b64_json.length
    const cost = response.data.cost
    logTest('Text-to-Image (Base64)', 'PASS', `Generated base64 (${b64Length} chars), Cost: $${cost}`, response.duration)
    saveResponse('text-to-image-base64.json', response.data)
  } else {
    logTest('Text-to-Image (Base64)', 'FAIL', `Status: ${response.status}, Error: ${response.data?.error?.message}`, response.duration)
  }
}

async function testImageToImage() {
  console.log('\n🖼️ Testing Image-to-Image Generation...')
  
  const fields = {
    model: 'google/gemini-2.5-flash',
    prompt: 'Transform this image into a painting in Van Gogh style',
    n: 1,
    size: '1024x1024',
    response_format: 'url'
  }
  
  const files = {
    image: CONFIG.testImagePath
  }
  
  if (response.status === 200 && response.data?.data?.[0]?.url) {
    const url = response.data.data[0].url
    const cost = response.data.cost
    logTest('Image-to-Image', 'PASS', `Generated image: ${url}, Cost: $${cost}`, response.duration)
    saveResponse('image-to-image.json', response.data)
  } else {
    logTest('Image-to-Image', 'FAIL', `Status: ${response.status}, Error: ${response.data?.error?.message}`, response.duration)
  }
}

async function testTextToVideo() {
  console.log('\n🎬 Testing Text-to-Video Generation...')
  
  const payload = {
    model: 'google/veo-2-mock',
    prompt: 'A serene mountain lake with gentle ripples, birds flying overhead',
    size: '1280x720'
  }
  
  const response = await makeRequest('/v1/openai/videos/generations', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  
  if (response.status === 200 && response.data?.data?.[0]) {
    const result = response.data.data[0]
    const cost = response.data.cost
    logTest('Text-to-Video', 'PASS', `Generated video, Cost: $${cost}`, response.duration)
    saveResponse('text-to-video.json', response.data)
  } else {
    logTest('Text-to-Video', 'FAIL', `Status: ${response.status}, Error: ${response.data?.error?.message}`, response.duration)
  }
}

async function testImageToVideo() {
  console.log('\n🎥 Testing Image-to-Video Generation...')
  
  const fields = {
    model: 'google/veo-2-mock',
    prompt: 'Animate this image with gentle movement and natural effects',
    size: '1280x720'
  }
  
  const files = {
    image: CONFIG.testImagePath
  }
  

  if (response.status === 200 && response.data?.data?.[0]) {
    const result = response.data.data[0]
    const cost = response.data.cost
    logTest('Image-to-Video', 'PASS', `Generated video, Cost: $${cost}`, response.duration)
    saveResponse('image-to-video.json', response.data)
  } else {
    logTest('Image-to-Video', 'FAIL', `Status: ${response.status}, Error: ${response.data?.error?.message}`, response.duration)
  }
}

async function testVideoProxy() {
  console.log('\n🔗 Testing Video Proxy...')
  
  // This test requires a valid video URL from a previous generation
  // For now, we'll test the endpoint validation
  const response = await makeRequest('/v1/openai/videos/proxy?url=invalid&model=google/veo-2')
  
  if (response.status === 400 && response.data?.error?.message?.includes('Invalid URL')) {
    logTest('Video Proxy Validation', 'PASS', 'Properly validates URLs', response.duration)
    saveResponse('video-proxy-validation.json', response.data)
  } else {
    logTest('Video Proxy Validation', 'FAIL', `Unexpected response: ${response.status}`, response.duration)
  }
}

async function testR2Storage() {
  console.log('\n☁️ Testing R2 Storage Integration...')
  
  // Generate image with URL response format to test R2 storage
  const payload = {
    model: 'google/gemini-2.5-flash',
    prompt: 'A test image for R2 storage validation',
    n: 1,
    size: '512x512',
    response_format: 'url'
  }
  
  const response = await makeRequest('/v1/openai/images/generations', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  
  if (response.status === 200 && response.data?.data?.[0]?.url) {
    const url = response.data.data[0].url
    
    // Check if URL is from R2 CDN
    if (url.includes('cdn.imagerouter.io')) {
      logTest('R2 Storage Integration', 'PASS', `R2 URL: ${url}`, response.duration)
      
      // Test if the URL is accessible
      try {
        const imageResponse = await fetch(url)
        if (imageResponse.ok) {
          logTest('R2 Image Accessibility', 'PASS', `Image accessible at R2 URL`, imageResponse.status)
        } else {
          logTest('R2 Image Accessibility', 'FAIL', `Image not accessible: ${imageResponse.status}`)
        }
      } catch (error) {
        logTest('R2 Image Accessibility', 'FAIL', `Error accessing image: ${error.message}`)
      }
      
    } else {
      logTest('R2 Storage Integration', 'FAIL', `URL not from R2: ${url}`, response.duration)
    }
    
    saveResponse('r2-storage-test.json', response.data)
  } else {
    logTest('R2 Storage Integration', 'FAIL', `Failed to generate image: ${response.status}`, response.duration)
  }
}

async function testRateLimiting() {
  console.log('\n⏱️ Testing Rate Limiting...')
  
  // Make multiple rapid requests to test rate limiting
  const requests = []
  for (let i = 0; i < 5; i++) {
    requests.push(makeRequest('/health'))
  }
  
  const responses = await Promise.all(requests)
  const rateLimitedCount = responses.filter(r => r.status === 429).length
  const successCount = responses.filter(r => r.status === 200).length
  
  if (successCount > 0) {
    logTest('Rate Limiting', 'PASS', `${successCount} successful, ${rateLimitedCount} rate limited`)
  } else {
    logTest('Rate Limiting', 'FAIL', 'All requests failed')
  }
}

async function testAuthentication() {
  console.log('\n🔐 Testing Authentication...')
  
  // Test without API key
  const response1 = await makeRequest('/v1/openai/images/generations', {
    method: 'POST',
    headers: {}, // No auth header
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      prompt: 'test',
      n: 1
    })
  })
  
  if (response1.status === 401) {
    logTest('Authentication - No Key', 'PASS', 'Properly rejected request without API key')
  } else {
    logTest('Authentication - No Key', 'FAIL', `Expected 401, got ${response1.status}`)
  }
  
  // Test with invalid API key
  const response2 = await makeRequest('/v1/openai/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer invalid-key'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      prompt: 'test',
      n: 1
    })
  })
  
  if (response2.status === 401) {
    logTest('Authentication - Invalid Key', 'PASS', 'Properly rejected invalid API key')
  } else {
    logTest('Authentication - Invalid Key', 'FAIL', `Expected 401, got ${response2.status}`)
  }
}

async function testErrorHandling() {
  console.log('\n⚠️ Testing Error Handling...')
  
  // Test invalid model
  const payload = {
    model: 'invalid/model',
    prompt: 'test prompt',
    n: 1
  }
  
  const response = await makeRequest('/v1/openai/images/generations', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  
  if (response.status >= 400 && response.data?.error?.message) {
    logTest('Error Handling', 'PASS', `Proper error response: ${response.data.error.message}`)
    saveResponse('error-handling.json', response.data)
  } else {
    logTest('Error Handling', 'FAIL', `Expected error response, got ${response.status}`)
  }
}

async function testAsyncImageGeneration() {
  console.log('\n⚡ Testing Async Image Generation...')
  
  // Step 1: Start async generation
  const payload = {
    model: 'google/gemini-2.5-flash',
    prompt: 'Async test: A beautiful mountain landscape with a lake',
    n: 1,
    size: '1024x1024',
    response_format: 'url'
  }
  
  const response = await makeRequest('/v1/openai/images/generations?async=true', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  
  if (response.status === 200 && response.data?.taskId) {
    const taskId = response.data.taskId
    logTest('Async Image Generation - Create Task', 'PASS', `TaskId: ${taskId}`, response.duration)
    
    // Step 2: Poll for completion
    let attempts = 0
    const maxAttempts = 30 // Max 30 seconds
    
    while (attempts < maxAttempts) {
      const statusResponse = await makeRequest(`/v1/tasks/${taskId}`)
      
      if (statusResponse.status === 200) {
        const status = statusResponse.data.status
        
        if (status === 'completed') {
          const resultUrl = statusResponse.data.result?.data?.[0]?.url
          logTest('Async Image Generation - Complete', 'PASS', `Completed: ${resultUrl}`)
          saveResponse('async-image-generation.json', statusResponse.data)
          return
        } else if (status === 'failed') {
          logTest('Async Image Generation - Complete', 'FAIL', `Failed: ${statusResponse.data.error}`)
          return
        } else {
          // Still processing
          const progress = statusResponse.data.progress || 0
          console.log(`   ⏳ ${status} - ${progress}%`)
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
      attempts++
    }
    
    logTest('Async Image Generation - Complete', 'FAIL', 'Timeout after 30 seconds')
  } else {
    logTest('Async Image Generation - Create Task', 'FAIL', `Status: ${response.status}, Error: ${response.data?.error?.message}`)
  }
}

async function testAsyncVideoGeneration() {
  console.log('\n🎬 Testing Async Video Generation...')
  
  const payload = {
    model: 'google/veo-2-mock',
    prompt: 'Async test: A peaceful forest with gentle wind moving through the trees',
    size: '1280x720'
  }
  
  const response = await makeRequest('/v1/openai/videos/generations?async=true', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  
  if (response.status === 200 && response.data?.taskId) {
    const taskId = response.data.taskId
    logTest('Async Video Generation - Create Task', 'PASS', `TaskId: ${taskId}`, response.duration)
    
    // Poll for a shorter time for mock video
    let attempts = 0
    const maxAttempts = 15 // Max 15 seconds for mock
    
    while (attempts < maxAttempts) {
      const statusResponse = await makeRequest(`/v1/tasks/${taskId}`)
      
      if (statusResponse.status === 200) {
        const status = statusResponse.data.status
        
        if (status === 'completed') {
          logTest('Async Video Generation - Complete', 'PASS', 'Video generation completed')
          saveResponse('async-video-generation.json', statusResponse.data)
          return
        } else if (status === 'failed') {
          logTest('Async Video Generation - Complete', 'FAIL', `Failed: ${statusResponse.data.error}`)
          return
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }
    
    logTest('Async Video Generation - Complete', 'FAIL', 'Timeout after 15 seconds')
  } else {
    logTest('Async Video Generation - Create Task', 'FAIL', `Status: ${response.status}`)
  }
}

async function testTaskStatusChecking() {
  console.log('\n📊 Testing Task Status Checking...')
  
  // Test invalid task ID
  const invalidResponse = await makeRequest('/v1/tasks/invalid-task-id')
  
  if (invalidResponse.status === 400) {
    logTest('Task Status - Invalid ID', 'PASS', 'Properly rejected invalid task ID')
  } else {
    logTest('Task Status - Invalid ID', 'FAIL', `Expected 400, got ${invalidResponse.status}`)
  }
  
  // Test non-existent task ID
  const notFoundResponse = await makeRequest('/v1/tasks/img_1234567890_abcd1234_xyz789')
  
  if (notFoundResponse.status === 404) {
    logTest('Task Status - Not Found', 'PASS', 'Properly returned 404 for non-existent task')
  } else {
    logTest('Task Status - Not Found', 'FAIL', `Expected 404, got ${notFoundResponse.status}`)
  }
}

async function testTaskManagement() {
  console.log('\n📋 Testing Task Management...')
  
  // Test user task list
  const listResponse = await makeRequest('/v1/tasks/user/list?limit=5&offset=0')
  
  if (listResponse.status === 200 && listResponse.data?.data) {
    const taskCount = listResponse.data.data.length
    logTest('Task Management - List Tasks', 'PASS', `Found ${taskCount} user tasks`)
    saveResponse('user-task-list.json', listResponse.data)
  } else {
    logTest('Task Management - List Tasks', 'FAIL', `Status: ${listResponse.status}`)
  }
  
  // Test task statistics
  const statsResponse = await makeRequest('/v1/tasks/stats')
  
  if (statsResponse.status === 200 && typeof statsResponse.data?.total === 'number') {
    const stats = statsResponse.data
    logTest('Task Management - Stats', 'PASS', `Total: ${stats.total}, Completed: ${stats.completed}`)
    saveResponse('task-stats.json', statsResponse.data)
  } else {
    logTest('Task Management - Stats', 'FAIL', `Status: ${statsResponse.status}`)
  }
  
  // Test filtering by status
  const filterResponse = await makeRequest('/v1/tasks/user/list?status=completed&limit=3')
  
  if (filterResponse.status === 200) {
    const completedTasks = filterResponse.data?.data || []
    logTest('Task Management - Filter by Status', 'PASS', `Found ${completedTasks.length} completed tasks`)
  } else {
    logTest('Task Management - Filter by Status', 'FAIL', `Status: ${filterResponse.status}`)
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Comprehensive API Test Suite for ImageRouter Hono API')
  console.log(`📍 Testing server at: ${CONFIG.baseUrl}`)
  console.log(`🔑 Using API key: ${CONFIG.apiKey.substring(0, 20)}...`)
  console.log(`📂 Output directory: ${CONFIG.outputDir}`)
  
  const startTime = Date.now()
  
  try {
    // Core functionality tests
    await testHealthCheck()
    await testApiInfo()
    await testModelsListing()
    await testAuthentication()
    await testErrorHandling()
    await testRateLimiting()
    
    // Image generation tests
    await testTextToImage()
    await testTextToImageBase64()
    await testImageToImage()
    
    // Video generation tests
    await testTextToVideo()
    await testImageToVideo()
    await testVideoProxy()
    
    // Storage tests
    await testR2Storage()
    
    // Async processing tests
    await testAsyncImageGeneration()
    await testAsyncVideoGeneration()
    await testTaskStatusChecking()
    await testTaskManagement()
    
  } catch (error) {
    console.error('❌ Test suite failed with error:', error)
  }
  
  const totalTime = Date.now() - startTime
  
  // Print summary
  console.log('\n📊 Test Summary')
  console.log('='.repeat(50))
  console.log(`✅ Passed: ${testResults.passed}`)
  console.log(`❌ Failed: ${testResults.failed}`)
  console.log(`📝 Total: ${testResults.total}`)
  console.log(`⏱️ Total Time: ${totalTime}ms`)
  console.log(`📈 Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`)
  
  // Save detailed results
  const summaryReport = {
    summary: {
      passed: testResults.passed,
      failed: testResults.failed,
      total: testResults.total,
      successRate: ((testResults.passed / testResults.total) * 100).toFixed(1) + '%',
      totalTime: totalTime,
      timestamp: new Date().toISOString()
    },
    tests: testResults.results,
    config: CONFIG
  }
  
  saveResponse('test-summary.json', summaryReport)
  
  console.log(`\n📋 Detailed test results saved to: ${path.join(CONFIG.outputDir, 'test-summary.json')}`)
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0)
}

// Run the tests
runTests().catch(console.error)