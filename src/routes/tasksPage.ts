import { Hono } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { createDatabase } from '../db'
import { apiUsage } from '../db/schema'
import { eq, desc } from 'drizzle-orm'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

/**
 * GET /tasks
 * HTML page to view all tasks
 */
app.get('/', async (c) => {
  try {
    // Get database connection
    const db = createDatabase({
      TURSO_DATABASE_URL: c.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: c.env.TURSO_AUTH_TOKEN
    })

    // Get all async tasks from the last 7 days
    const tasks = await db
      .select()
      .from(apiUsage)
      .where(eq(apiUsage.isAsync, true))
      .orderBy(desc(apiUsage.createdAt))
      .limit(100)

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ImageRouter - Async Tasks</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0;
            font-size: 2em;
        }
        .header p {
            margin: 5px 0 0 0;
            opacity: 0.9;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .stat-label {
            color: #666;
            font-size: 0.9em;
        }
        .tasks-container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .tasks-header {
            background: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #e9ecef;
        }
        .tasks-header h2 {
            margin: 0;
            color: #333;
        }
        .task {
            padding: 15px 20px;
            border-bottom: 1px solid #e9ecef;
            display: grid;
            grid-template-columns: auto 1fr auto auto auto;
            gap: 15px;
            align-items: center;
        }
        .task:last-child {
            border-bottom: none;
        }
        .task:hover {
            background-color: #f8f9fa;
        }
        .status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status.pending {
            background: #fff3cd;
            color: #856404;
        }
        .status.processing {
            background: #d1ecf1;
            color: #0c5460;
        }
        .status.completed {
            background: #d4edda;
            color: #155724;
        }
        .status.failed {
            background: #f8d7da;
            color: #721c24;
        }
        .status.sync {
            background: #e2e3e5;
            color: #383d41;
        }
        .task-id {
            font-family: monospace;
            font-size: 0.8em;
            color: #666;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .task-details {
            flex: 1;
        }
        .task-title {
            font-weight: bold;
            margin-bottom: 2px;
        }
        .task-prompt {
            color: #666;
            font-size: 0.9em;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .task-type {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.7em;
            font-weight: bold;
        }
        .task-type.image {
            background: #e3f2fd;
            color: #1565c0;
        }
        .task-type.video {
            background: #fce4ec;
            color: #c2185b;
        }
        .progress {
            width: 60px;
            height: 6px;
            background: #e9ecef;
            border-radius: 3px;
            overflow: hidden;
        }
        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 3px;
            transition: width 0.3s ease;
        }
        .timestamp {
            font-size: 0.8em;
            color: #666;
        }
        .no-tasks {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        .refresh-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #667eea;
            color: white;
            border: none;
            padding: 15px;
            border-radius: 50px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            font-size: 1.2em;
        }
        .refresh-btn:hover {
            background: #5a6fd8;
        }
        @media (max-width: 768px) {
            .task {
                grid-template-columns: 1fr;
                gap: 10px;
                text-align: left;
            }
            .task-id {
                max-width: none;
            }
            .task-prompt {
                max-width: none;
                white-space: normal;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎨 ImageRouter - Async Tasks</h1>
        <p>Monitor all async image and video generation tasks</p>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-number">${tasks.filter(t => t.taskStatus === 'pending').length}</div>
            <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${tasks.filter(t => t.taskStatus === 'processing').length}</div>
            <div class="stat-label">Processing</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${tasks.filter(t => t.taskStatus === 'completed').length}</div>
            <div class="stat-label">Completed</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${tasks.filter(t => t.taskStatus === 'failed').length}</div>
            <div class="stat-label">Failed</div>
        </div>
    </div>

    <div class="tasks-container">
        <div class="tasks-header">
            <h2>Recent Tasks (${tasks.length} total)</h2>
        </div>
        
        ${tasks.length === 0 ? `
            <div class="no-tasks">
                <p>No tasks found. Generate an image or video to see tasks here.</p>
            </div>
        ` : tasks.map(task => {
            const taskType = task.taskId?.startsWith('img_') ? 'image' : task.taskId?.startsWith('vid_') ? 'video' : 'unknown'
            const progress = task.taskProgress || 0
            const createdAt = new Date(task.createdAt).toLocaleString()
            
            return `
            <div class="task">
                <div class="status ${task.taskStatus}">${task.taskStatus}</div>
                
                <div class="task-details">
                    <div class="task-title">
                        <span class="task-type ${taskType}">${taskType.toUpperCase()}</span>
                        ${task.model}
                    </div>
                    <div class="task-prompt">${task.prompt}</div>
                    <div class="task-id">ID: ${task.taskId || 'N/A'}</div>
                </div>
                
                <div class="progress">
                    <div class="progress-bar" style="width: ${progress}%"></div>
                </div>
                
                <div>
                    <div style="font-size: 0.9em; font-weight: bold;">$${(task.cost / 10000).toFixed(4)}</div>
                    <div style="font-size: 0.8em; color: #666;">${task.speedMs}ms</div>
                </div>
                
                <div class="timestamp">
                    <div>${createdAt}</div>
                    ${task.error ? `<div style="color: #dc3545; font-size: 0.8em;">Error: ${task.error.substring(0, 50)}...</div>` : ''}
                </div>
            </div>
            `
        }).join('')}
    </div>

    <button class="refresh-btn" onclick="window.location.reload()">🔄</button>

    <script>
        // Auto-refresh every 5 seconds if there are pending/processing tasks
        const hasPendingTasks = ${tasks.some(t => ['pending', 'processing'].includes(t.taskStatus as string))};
        if (hasPendingTasks) {
            setTimeout(() => {
                window.location.reload();
            }, 5000);
        }
        
        // Add click handler for task rows
        document.querySelectorAll('.task').forEach(task => {
            task.style.cursor = 'pointer';
            task.addEventListener('click', () => {
                const taskId = task.querySelector('.task-id').textContent.replace('ID: ', '');
                if (taskId !== 'N/A') {
                    // You could navigate to a detailed task view here
                    console.log('Task clicked:', taskId);
                }
            });
        });
    </script>
</body>
</html>`

    return c.html(html)

  } catch (error) {
    console.error('Tasks page error:', error)
    
    const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>ImageRouter - Tasks (Error)</title>
    <style>
        body { font-family: sans-serif; margin: 40px; }
        .error { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>ImageRouter - Tasks</h1>
    <div class="error">
        <h3>Error loading tasks</h3>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <p><a href="/tasks">Try again</a></p>
    </div>
</body>
</html>`

    return c.html(errorHtml, 500)
  }
})

export default app