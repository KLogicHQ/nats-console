import { FastifyInstance } from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from '../common/middleware/auth';
import { logger } from './logger';
import { subscribeToChannel, METRICS_CHANNEL, ALERTS_CHANNEL } from './redis';

interface Client {
  ws: WebSocket;
  userId: string;
  orgId: string;
  subscriptions: Set<string>;
}

const clients = new Map<string, Client>();

export function setupWebSocket(fastify: FastifyInstance): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade
  fastify.server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);

    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // Extract token from query string
    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const payload = await verifyToken(token);

      wss.handleUpgrade(request, socket, head, (ws) => {
        const clientId = crypto.randomUUID();
        const client: Client = {
          ws,
          userId: payload.sub,
          orgId: payload.orgId,
          subscriptions: new Set(),
        };

        clients.set(clientId, client);
        logger.info({ clientId, userId: payload.sub }, 'WebSocket client connected');

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            handleMessage(clientId, client, message);
          } catch (err) {
            logger.error({ err }, 'Invalid WebSocket message');
          }
        });

        ws.on('close', () => {
          clients.delete(clientId);
          logger.info({ clientId }, 'WebSocket client disconnected');
        });

        ws.on('error', (err) => {
          logger.error({ err, clientId }, 'WebSocket error');
          clients.delete(clientId);
        });

        // Send welcome message
        ws.send(JSON.stringify({ type: 'connected', clientId }));
      });
    } catch (err) {
      logger.error({ err }, 'WebSocket auth failed');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  // Set up Redis subscription bridge for real-time updates
  setupRedisBridge();

  return wss;
}

function setupRedisBridge() {
  // Subscribe to metrics channel and broadcast to WebSocket clients
  subscribeToChannel(METRICS_CHANNEL, (data) => {
    const channel = data.channel || 'metrics';
    broadcast(channel, data);
    logger.debug({ channel }, 'Broadcasting metrics to WebSocket clients');
  });

  // Subscribe to alerts channel and broadcast to WebSocket clients
  subscribeToChannel(ALERTS_CHANNEL, (data) => {
    broadcast('alerts', data);
    logger.debug('Broadcasting alert to WebSocket clients');
  });

  logger.info('Redis to WebSocket bridge established');
}

function handleMessage(clientId: string, client: Client, message: any) {
  switch (message.type) {
    case 'subscribe':
      handleSubscribe(client, message.channel);
      break;
    case 'unsubscribe':
      handleUnsubscribe(client, message.channel);
      break;
    case 'ping':
      client.ws.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      logger.warn({ type: message.type }, 'Unknown WebSocket message type');
  }
}

function handleSubscribe(client: Client, channel: string) {
  // Validate channel format: cluster:{id}, stream:{clusterId}:{name}, consumer:{clusterId}:{stream}:{name}
  const validChannels = ['metrics', 'alerts', 'audit'];
  const isValidChannel = validChannels.includes(channel) ||
    channel.startsWith('cluster:') ||
    channel.startsWith('stream:') ||
    channel.startsWith('consumer:');

  if (!isValidChannel) {
    client.ws.send(JSON.stringify({ type: 'error', message: 'Invalid channel' }));
    return;
  }

  client.subscriptions.add(channel);
  client.ws.send(JSON.stringify({ type: 'subscribed', channel }));
  logger.debug({ channel }, 'Client subscribed');
}

function handleUnsubscribe(client: Client, channel: string) {
  client.subscriptions.delete(channel);
  client.ws.send(JSON.stringify({ type: 'unsubscribed', channel }));
  logger.debug({ channel }, 'Client unsubscribed');
}

// Broadcast to all clients subscribed to a channel
export function broadcast(channel: string, data: any) {
  const message = JSON.stringify({ type: 'message', channel, data, timestamp: Date.now() });

  for (const [, client] of clients) {
    if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

// Broadcast to specific organization
export function broadcastToOrg(orgId: string, channel: string, data: any) {
  const message = JSON.stringify({ type: 'message', channel, data, timestamp: Date.now() });

  for (const [, client] of clients) {
    if (
      client.orgId === orgId &&
      client.subscriptions.has(channel) &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      client.ws.send(message);
    }
  }
}

// Send to specific user
export function sendToUser(userId: string, data: any) {
  const message = JSON.stringify({ type: 'direct', data, timestamp: Date.now() });

  for (const [, client] of clients) {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

// Get connected client count
export function getClientCount(): number {
  return clients.size;
}

// Get subscription stats
export function getSubscriptionStats(): Record<string, number> {
  const stats: Record<string, number> = {};

  for (const [, client] of clients) {
    for (const channel of client.subscriptions) {
      stats[channel] = (stats[channel] || 0) + 1;
    }
  }

  return stats;
}
