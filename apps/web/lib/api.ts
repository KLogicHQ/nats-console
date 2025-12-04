const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  // Get token from localStorage
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new ApiError(
      response.status,
      error.error?.code || 'UNKNOWN_ERROR',
      error.error?.message || 'An error occurred'
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Auth API
export const auth = {
  login: (email: string, password: string) =>
    request<{ user: any; tokens: any; orgId: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  register: (data: { email: string; password: string; firstName: string; lastName: string }) =>
    request<{ user: any; tokens: any }>('/auth/register', {
      method: 'POST',
      body: data,
    }),

  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  refresh: (refreshToken: string) =>
    request<{ tokens: any }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    }),

  me: () => request<{ user: any }>('/auth/me'),
};

// Clusters API
export const clusters = {
  list: () => request<{ clusters: any[] }>('/clusters'),

  get: (id: string) => request<{ cluster: any }>(`/clusters/${id}`),

  create: (data: any) =>
    request<{ cluster: any }>('/clusters', {
      method: 'POST',
      body: data,
    }),

  update: (id: string, data: any) =>
    request<{ cluster: any }>(`/clusters/${id}`, {
      method: 'PATCH',
      body: data,
    }),

  delete: (id: string) => request(`/clusters/${id}`, { method: 'DELETE' }),

  health: (id: string) => request<any>(`/clusters/${id}/health`),

  info: (id: string) => request<any>(`/clusters/${id}/info`),
};

// Streams API
export const streams = {
  list: (clusterId: string) => request<{ streams: any[] }>(`/clusters/${clusterId}/streams`),

  get: (clusterId: string, name: string) =>
    request<{ stream: any }>(`/clusters/${clusterId}/streams/${name}`),

  create: (clusterId: string, data: any) =>
    request<{ stream: any }>(`/clusters/${clusterId}/streams`, {
      method: 'POST',
      body: data,
    }),

  update: (clusterId: string, name: string, data: any) =>
    request<{ stream: any }>(`/clusters/${clusterId}/streams/${name}`, {
      method: 'PATCH',
      body: data,
    }),

  delete: (clusterId: string, name: string) =>
    request(`/clusters/${clusterId}/streams/${name}`, { method: 'DELETE' }),

  purge: (clusterId: string, name: string, options?: any) =>
    request<{ purged: number }>(`/clusters/${clusterId}/streams/${name}/purge`, {
      method: 'POST',
      body: options,
    }),

  messages: (clusterId: string, name: string, params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return request<{ messages: any[] }>(`/clusters/${clusterId}/streams/${name}/messages${query}`);
  },

  publish: (clusterId: string, name: string, data: { subject: string; data: string }) =>
    request<{ sequence: number; stream: string }>(`/clusters/${clusterId}/streams/${name}/messages`, {
      method: 'POST',
      body: data,
    }),
};

// Consumers API
export const consumers = {
  list: (clusterId: string, streamName: string) =>
    request<{ consumers: any[] }>(`/clusters/${clusterId}/streams/${streamName}/consumers`),

  get: (clusterId: string, streamName: string, name: string) =>
    request<{ consumer: any }>(`/clusters/${clusterId}/streams/${streamName}/consumers/${name}`),

  create: (clusterId: string, streamName: string, data: any) =>
    request<{ consumer: any }>(`/clusters/${clusterId}/streams/${streamName}/consumers`, {
      method: 'POST',
      body: data,
    }),

  update: (clusterId: string, streamName: string, name: string, data: any) =>
    request<{ consumer: any }>(`/clusters/${clusterId}/streams/${streamName}/consumers/${name}`, {
      method: 'PATCH',
      body: data,
    }),

  delete: (clusterId: string, streamName: string, name: string) =>
    request(`/clusters/${clusterId}/streams/${streamName}/consumers/${name}`, { method: 'DELETE' }),
};

// Analytics API
export const analytics = {
  metrics: (params: Record<string, string>) => {
    const query = `?${new URLSearchParams(params)}`;
    return request<{ metrics: any[]; type: string }>(`/analytics${query}`);
  },

  overview: (clusterId: string, timeRange: string) =>
    request<{
      totalMessages: number;
      totalBytes: number;
      avgThroughput: number;
      avgLatency: number;
      messagesTrend: number;
      bytesTrend: number;
      throughputTrend: number;
      latencyTrend: number;
    }>(`/analytics/overview?clusterId=${clusterId}&timeRange=${timeRange}`),

  streamThroughput: (name: string, params: Record<string, string>) => {
    const query = `?${new URLSearchParams(params)}`;
    return request<any>(`/analytics/streams/${name}/throughput${query}`);
  },

  consumerLag: (name: string, params: Record<string, string>) => {
    const query = `?${new URLSearchParams(params)}`;
    return request<any>(`/analytics/consumers/${name}/lag${query}`);
  },

  clusterOverview: (clusterId?: string) => {
    const query = clusterId ? `?clusterId=${clusterId}` : '';
    return request<any>(`/analytics/cluster/overview${query}`);
  },
};

// Alerts API
export const alerts = {
  list: (clusterId: string) =>
    request<{ alerts: any[] }>(`/clusters/${clusterId}/alerts`),

  listRules: () => request<{ rules: any[] }>('/alerts/rules'),

  createRule: (data: any) =>
    request<{ rule: any }>('/alerts/rules', {
      method: 'POST',
      body: data,
    }),

  updateRule: (id: string, data: any) =>
    request<{ rule: any }>(`/alerts/rules/${id}`, {
      method: 'PATCH',
      body: data,
    }),

  deleteRule: (id: string) => request(`/alerts/rules/${id}`, { method: 'DELETE' }),

  listEvents: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return request<{ events: any[] }>(`/alerts/events${query}`);
  },
};

// Dashboards API
export const dashboards = {
  list: () => request<{ dashboards: any[] }>('/dashboards'),

  get: (id: string) => request<{ dashboard: any }>(`/dashboards/${id}`),

  create: (data: any) =>
    request<{ dashboard: any }>('/dashboards', {
      method: 'POST',
      body: data,
    }),

  update: (id: string, data: any) =>
    request<{ dashboard: any }>(`/dashboards/${id}`, {
      method: 'PATCH',
      body: data,
    }),

  delete: (id: string) => request(`/dashboards/${id}`, { method: 'DELETE' }),

  clone: (id: string) =>
    request<{ dashboard: any }>(`/dashboards/${id}/clone`, {
      method: 'POST',
    }),
};

export const api = {
  auth,
  clusters,
  streams,
  consumers,
  analytics,
  alerts,
  dashboards,
};
