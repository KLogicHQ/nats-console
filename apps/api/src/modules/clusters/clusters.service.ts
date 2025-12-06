import { prisma } from '../../lib/prisma';
import {
  connectCluster,
  disconnectCluster,
  checkClusterHealth,
  isClusterConnected,
  listStreams,
  getJetStreamAccountInfo,
} from '../../lib/nats';
import { setClusterStatus, getClusterStatus } from '../../lib/redis';
import { NotFoundError, ConflictError } from '@nats-console/shared';
import type { NatsCluster, ClusterConnection, ClusterStatus } from '@nats-console/shared';
import type { CreateClusterInput, UpdateClusterInput } from '@nats-console/shared';

// ==================== Cluster CRUD ====================

export async function listClusters(orgId: string): Promise<NatsCluster[]> {
  const clusters = await prisma.natsCluster.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
  });

  return clusters.map(mapCluster);
}

export async function getCluster(orgId: string, clusterId: string): Promise<NatsCluster> {
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  return mapCluster(cluster);
}

export async function getClusterWithConnections(
  orgId: string,
  clusterId: string
): Promise<NatsCluster & { connections: ClusterConnection[] }> {
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
    include: { connections: true },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  return {
    ...mapCluster(cluster),
    connections: cluster.connections.map(mapConnection),
  };
}

export async function createCluster(
  orgId: string,
  userId: string,
  input: CreateClusterInput
): Promise<NatsCluster> {
  // Create cluster and connection in transaction
  const result = await prisma.$transaction(async (tx) => {
    const cluster = await tx.natsCluster.create({
      data: {
        orgId,
        name: input.name,
        description: input.description,
        environment: input.environment,
        status: 'disconnected',
      },
    });

    await tx.clusterConnection.create({
      data: {
        clusterId: cluster.id,
        serverUrl: input.serverUrl,
        credentials: input.credentials as any,
        tlsConfig: input.tlsConfig as any,
        isPrimary: true,
        healthStatus: 'unknown',
      },
    });

    return cluster;
  });

  // Try to connect
  try {
    await connectToCluster(result.id);
  } catch (error) {
    console.error(`Failed to connect to new cluster ${result.id}:`, error);
  }

  return mapCluster(result);
}

export async function updateCluster(
  orgId: string,
  clusterId: string,
  input: UpdateClusterInput
): Promise<NatsCluster> {
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  const updated = await prisma.natsCluster.update({
    where: { id: clusterId },
    data: {
      name: input.name,
      description: input.description,
      environment: input.environment,
    },
  });

  // Update connection if credentials/TLS changed
  if (input.credentials || input.tlsConfig) {
    await prisma.clusterConnection.updateMany({
      where: { clusterId, isPrimary: true },
      data: {
        ...(input.credentials && { credentials: input.credentials as any }),
        ...(input.tlsConfig && { tlsConfig: input.tlsConfig as any }),
      },
    });

    // Reconnect with new credentials
    await disconnectCluster(clusterId);
    await connectToCluster(clusterId);
  }

  return mapCluster(updated);
}

export async function deleteCluster(orgId: string, clusterId: string): Promise<void> {
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  // Disconnect from cluster
  await disconnectCluster(clusterId);

  // Delete cluster (cascades to connections, streams, consumers)
  await prisma.natsCluster.delete({
    where: { id: clusterId },
  });
}

// ==================== Cluster Connection ====================

export async function connectToCluster(clusterId: string): Promise<void> {
  const cluster = await prisma.natsCluster.findUnique({
    where: { id: clusterId },
    include: { connections: { where: { isPrimary: true }, take: 1 } },
  });

  if (!cluster || cluster.connections.length === 0) {
    throw new NotFoundError('Cluster', clusterId);
  }

  const connection = cluster.connections[0]!;

  try {
    await connectCluster(
      clusterId,
      connection.serverUrl,
      connection.credentials as any,
      connection.tlsConfig as any
    );

    // Update status
    await prisma.natsCluster.update({
      where: { id: clusterId },
      data: { status: 'connected' },
    });

    await prisma.clusterConnection.update({
      where: { id: connection.id },
      data: {
        healthStatus: 'healthy',
        lastHealthCheck: new Date(),
      },
    });

    // Cache status
    await setClusterStatus(clusterId, {
      status: 'connected',
      serverCount: 1,
      version: '',
      lastCheck: new Date().toISOString(),
    });
  } catch (error) {
    await prisma.natsCluster.update({
      where: { id: clusterId },
      data: { status: 'disconnected' },
    });

    await prisma.clusterConnection.update({
      where: { id: connection.id },
      data: {
        healthStatus: 'unhealthy',
        lastHealthCheck: new Date(),
      },
    });

    throw error;
  }
}

export async function disconnectFromCluster(clusterId: string): Promise<void> {
  await disconnectCluster(clusterId);

  await prisma.natsCluster.update({
    where: { id: clusterId },
    data: { status: 'disconnected' },
  });
}

// ==================== Health Check ====================

export async function checkHealth(
  orgId: string,
  clusterId: string
): Promise<{
  connected: boolean;
  status: ClusterStatus;
  rtt?: number;
  serverInfo?: {
    serverId: string;
    serverName: string;
    version: string;
    jetstream: boolean;
  };
  streamCount?: number;
}> {
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  // Try to use cached status first
  const cachedStatus = await getClusterStatus(clusterId);
  if (cachedStatus) {
    return {
      connected: cachedStatus.status === 'connected',
      status: cachedStatus.status as ClusterStatus,
      rtt: cachedStatus.rtt ? parseInt(cachedStatus.rtt) : undefined,
      serverInfo: {
        serverId: cachedStatus.serverId || '',
        serverName: cachedStatus.serverName || '',
        version: cachedStatus.version,
        jetstream: true,
      },
    };
  }

  // Check if connected
  if (!isClusterConnected(clusterId)) {
    // Try to connect
    try {
      await connectToCluster(clusterId);
    } catch {
      return { connected: false, status: 'disconnected' };
    }
  }

  // Get health
  const health = await checkClusterHealth(clusterId);

  if (!health.connected) {
    await prisma.natsCluster.update({
      where: { id: clusterId },
      data: { status: 'disconnected' },
    });
    return { connected: false, status: 'disconnected' };
  }

  // Get stream count
  let streamCount = 0;
  try {
    const streams = await listStreams(clusterId);
    streamCount = streams.length;
  } catch {
    // Ignore stream count errors
  }

  // Update and cache status
  const version = health.serverInfo?.version || '';
  await prisma.natsCluster.update({
    where: { id: clusterId },
    data: {
      status: 'connected',
      version,
    },
  });

  await setClusterStatus(clusterId, {
    status: 'connected',
    serverCount: 1,
    version,
    lastCheck: new Date().toISOString(),
    serverId: health.serverInfo?.serverId || '',
    serverName: health.serverInfo?.serverName || '',
    rtt: health.rtt?.toString() || '',
  });

  return {
    connected: true,
    status: 'connected',
    rtt: health.rtt,
    serverInfo: health.serverInfo,
    streamCount,
  };
}

// ==================== Cluster Info ====================

export async function getClusterInfo(orgId: string, clusterId: string): Promise<{
  cluster: NatsCluster;
  health: Awaited<ReturnType<typeof checkHealth>>;
  streams: number;
  consumers: number;
  jetstream: {
    streams: number;
    consumers: number;
    messages: number;
    bytes: number;
  } | null;
}> {
  const cluster = await getCluster(orgId, clusterId);
  const health = await checkHealth(orgId, clusterId);

  let streamCount = 0;
  let consumerCount = 0;
  let jetstream: {
    streams: number;
    consumers: number;
    messages: number;
    bytes: number;
  } | null = null;

  if (health.connected) {
    try {
      const streams = await listStreams(clusterId);
      streamCount = streams.length;
      consumerCount = streams.reduce((acc, s) => acc + (s.state?.consumer_count || 0), 0);

      // Get JetStream account info
      const jsInfo = await getJetStreamAccountInfo(clusterId);
      if (jsInfo) {
        jetstream = {
          streams: jsInfo.streams,
          consumers: jsInfo.consumers,
          messages: jsInfo.messages,
          bytes: jsInfo.bytes,
        };
      }
    } catch {
      // Ignore errors
    }
  }

  return {
    cluster,
    health,
    streams: streamCount,
    consumers: consumerCount,
    jetstream,
  };
}

// ==================== Helpers ====================

function mapCluster(cluster: any): NatsCluster {
  return {
    id: cluster.id,
    orgId: cluster.orgId,
    name: cluster.name,
    description: cluster.description,
    environment: cluster.environment,
    status: cluster.status,
    version: cluster.version,
    createdAt: cluster.createdAt,
    updatedAt: cluster.updatedAt,
  };
}

function mapConnection(connection: any): ClusterConnection {
  return {
    id: connection.id,
    clusterId: connection.clusterId,
    serverUrl: connection.serverUrl,
    credentials: connection.credentials,
    tlsConfig: connection.tlsConfig,
    isPrimary: connection.isPrimary,
    healthStatus: connection.healthStatus,
    lastHealthCheck: connection.lastHealthCheck,
  };
}
