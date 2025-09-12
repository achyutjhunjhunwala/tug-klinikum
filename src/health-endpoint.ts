import { createServer, IncomingMessage, ServerResponse } from 'http';
import { HealthChecker } from '@/health';

export class HealthEndpoint {
  private server?: ReturnType<typeof createServer> | undefined;

  constructor(
    private readonly healthChecker: HealthChecker,
    private readonly port: number = 3000
  ) {}

  start(): void {
    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Only handle GET requests
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      try {
        switch (req.url) {
          case '/health':
            await this.handleHealthCheck(res);
            break;
          case '/health/ready':
            await this.handleReadinessCheck(res);
            break;
          case '/health/live':
            await this.handleLivenessCheck(res);
            break;
          case '/health/simple':
            await this.handleSimpleHealth(res);
            break;
          default:
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    });

    this.server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`⚠️ Port ${this.port} is already in use. Health endpoint disabled.`);
        return;
      }
      throw error;
    });

    this.server.listen(this.port, () => {
      console.log(`🔍 Health endpoint listening on port ${this.port}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }

  private async handleHealthCheck(res: ServerResponse): Promise<void> {
    const healthResult = await this.healthChecker.performHealthCheck();
    
    const statusCode = healthResult.status === 'healthy' ? 200 : 
                      healthResult.status === 'degraded' ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthResult, null, 2));
  }

  private async handleReadinessCheck(res: ServerResponse): Promise<void> {
    const ready = await this.healthChecker.checkReadiness();
    const statusCode = ready ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
    }));
  }

  private async handleLivenessCheck(res: ServerResponse): Promise<void> {
    const alive = await this.healthChecker.checkLiveness();
    const statusCode = alive ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: alive ? 'alive' : 'not_alive',
      timestamp: new Date().toISOString(),
      uptime: this.healthChecker.getUptime(),
    }));
  }

  private async handleSimpleHealth(res: ServerResponse): Promise<void> {
    const simpleHealth = await this.healthChecker.getSimpleHealth();
    const statusCode = simpleHealth.status === 'ok' ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(simpleHealth));
  }
}