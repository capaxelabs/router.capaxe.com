interface PredictionResponse {
  status: string
  error?: string
  output?: any
  urls?: {
    get: string
  }
  [key: string]: any
}

interface PredictionError {
  status: number
  errorResponse: {
    status: string | number
    statusText: string
    error: {
      message: string
      type: string
    }
    original_response_from_provider: any
  }
}

interface PollingOptions {
  pollingInterval?: number // milliseconds between polls
  maxAttempts?: number // maximum polling attempts
}

export async function pollReplicatePrediction(
  getUrl: string, 
  providerKey: string, 
  options: PollingOptions = {}
): Promise<PredictionResponse> {
  const { 
    pollingInterval = 5000, // milliseconds between polls
    maxAttempts = 240 // ~20 minutes total
  } = options
  
  let attempts = 0
  let lastData: PredictionResponse | null = null
  
  while (attempts < maxAttempts) {
    // Wait before first poll only if this is not the first loop iteration
    if (attempts > 0) {
      await new Promise(resolve => setTimeout(resolve, pollingInterval))
    }

    const res = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${providerKey}`,
        'Content-Type': 'application/json'
      }
    })

    const data = await res.json() as PredictionResponse
    lastData = data

    if (!res.ok) {
      const formattedError = {
        status: data?.status || res.status,
        statusText: data?.error || res.statusText || 'Unknown error',
        error: {
          message: data?.error || 'Unknown error while polling prediction',
          type: data?.status || 'polling_error'
        },
        original_response_from_provider: data
      }
      
      const error: PredictionError = {
        status: res.status,
        errorResponse: formattedError
      }
      throw error
    }

    // Terminal states
    if (data.status === 'succeeded') {
      return data
    }
    
    if (data.status === 'failed' || data.status === 'canceled') {
      const formattedError = {
        status: data.status,
        statusText: data.error || 'Prediction did not succeed',
        error: {
          message: data.error || 'Prediction failed',
          type: data.status
        },
        original_response_from_provider: data
      }
      
      const error: PredictionError = {
        status: 500,
        errorResponse: formattedError
      }
      throw error
    }

    attempts += 1
  }

  // If we reach here, the prediction is still not finished after maxAttempts (timeout)
  // Do NOT throw, instead return the last known prediction state with a timeout status so that
  // upstream code can decide how to handle billing without triggering a full refund.
  const timeoutResponse: PredictionResponse = {
    ...(lastData || {}),
    status: 'timeout',
    error: 'Prediction polling timed out'
  }
  
  return timeoutResponse
}