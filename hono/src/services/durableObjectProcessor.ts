/**
 * Cloudflare Durable Object for handling async task processing
 * Durable Objects persist beyond the initial request and can process tasks in the background
 */

export interface AsyncTaskRequest {
  taskId: string
  type: 'image' | 'video'
  userId: string
  request: any
  env: any // Cloudflare environment bindings
}

/**
 * Durable Object class that handles async task processing
 * Each task gets its own durable object instance
 */
export class AsyncTaskProcessor {
  private state: DurableObjectState
  private env: any

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
  }

  /**
   * Handle incoming requests to process tasks
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    if (url.pathname === '/process' && request.method === 'POST') {
      const taskData: AsyncTaskRequest = await request.json()
      
      // Start processing in the background (non-blocking)
      this.processTaskAsync(taskData).catch(console.error)
      
      return new Response(JSON.stringify({ status: 'processing_started' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response('Not found', { status: 404 })
  }

  /**
   * Process the actual task (runs in durable object context)
   */
  private async processTaskAsync(taskData: AsyncTaskRequest): Promise<void> {
    try {
      // Update task to processing status
      await this.updateTaskStatus(taskData.taskId, 'processing', 10)
      
      // Process based on type
      let result: any
      if (taskData.type === 'image') {
        result = await this.processImageGeneration(taskData)
      } else {
        result = await this.processVideoGeneration(taskData)
      }
      
      // Update task to completed
      await this.updateTaskStatus(taskData.taskId, 'completed', 100, result)
      
    } catch (error) {
      console.error(`Task ${taskData.taskId} failed:`, error)
      await this.updateTaskStatus(taskData.taskId, 'failed', 0, null, error)
    }
  }

  private async processImageGeneration(taskData: AsyncTaskRequest): Promise<any> {
    // Import the generation service dynamically
    const { generateImage } = await import('./imageService')
    
    // Create a mock context with the environment
    const mockContext = {
      env: taskData.env,
      get: () => null,
      set: () => {},
    } as any
    
    await this.updateTaskStatus(taskData.taskId, 'processing', 30)
    
    // Run the actual image generation
    const result = await generateImage(mockContext, taskData.request, taskData.userId)
    
    await this.updateTaskStatus(taskData.taskId, 'processing', 80)
    
    return result
  }

  private async processVideoGeneration(taskData: AsyncTaskRequest): Promise<any> {
    // Similar to image generation but for videos
    const { generateVideo } = await import('./videoService')
    
    const mockContext = {
      env: taskData.env,
      get: () => null,
      set: () => {},
    } as any
    
    await this.updateTaskStatus(taskData.taskId, 'processing', 30)
    const result = await generateVideo(mockContext, taskData.request, taskData.userId)
    await this.updateTaskStatus(taskData.taskId, 'processing', 80)
    
    return result
  }

  private async updateTaskStatus(
    taskId: string, 
    status: string, 
    progress: number,
    result?: any,
    error?: any
  ): Promise<void> {
    // Update in database via direct Turso connection
    // (We'll need to recreate the DB connection here)
    try {
      // This would need to be implemented to connect directly to Turso
      // For now, we'll log the update
      console.log(`Task ${taskId}: ${status} (${progress}%)`, { result, error })
      
      // In a real implementation, you'd:
      // 1. Create Turso client with env.TURSO_DATABASE_URL and env.TURSO_AUTH_TOKEN
      // 2. Update the api_usage record with the new status
      
    } catch (updateError) {
      console.error('Failed to update task status:', updateError)
    }
  }
}

/**
 * Export for wrangler.toml configuration
 */
export { AsyncTaskProcessor as default }