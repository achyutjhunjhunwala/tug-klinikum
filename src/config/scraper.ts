import { z } from 'zod';
import { ScrapingConfig, BrowserType } from '@/scraper';

const ScrapingConfigSchema = z.object({
  targetUrl: z.string().url(),
  browser: z.object({
    type: z.enum(['chromium', 'firefox', 'webkit']),
    headless: z.boolean().default(true),
    timeout: z.number().int().min(5000).max(300000).default(30000),
    userAgent: z.string().optional(),
    viewport: z
      .object({
        width: z.number().int().min(800).max(3840).default(1920),
        height: z.number().int().min(600).max(2160).default(1080),
      })
      .optional(),
    proxy: z
      .object({
        server: z.string(),
        username: z.string().optional(),
        password: z.string().optional(),
      })
      .optional(),
  }),
  maxRetries: z.number().int().min(0).max(10).default(3),
  pageTimeout: z.number().int().min(5000).max(300000).default(30000),
  scraperId: z.string().min(1),
});

export type ScrapingConfigType = z.infer<typeof ScrapingConfigSchema>;

export function createScrapingConfig(): ScrapingConfig {
  const config: ScrapingConfigType = ScrapingConfigSchema.parse({
    targetUrl:
      process.env['TARGET_URL'] ||
      'https://www.vivantes.de/klinikum-im-friedrichshain/rettungsstelle',
    browser: {
      type: (process.env['BROWSER_TYPE'] as BrowserType) || 'chromium',
      headless: process.env['HEADLESS'] !== 'false',
      timeout: parseInt(process.env['BROWSER_TIMEOUT'] || '30000', 10),
      userAgent: process.env['USER_AGENT'],
      viewport:
        process.env['VIEWPORT_WIDTH'] && process.env['VIEWPORT_HEIGHT']
          ? {
              width: parseInt(process.env['VIEWPORT_WIDTH'], 10),
              height: parseInt(process.env['VIEWPORT_HEIGHT'], 10),
            }
          : undefined,
      proxy: (() => {
        const server = process.env['PROXY_SERVER'];
        if (!server) return undefined;

        const proxyConfig: { server: string; username?: string; password?: string } = { server };
        const username = process.env['PROXY_USERNAME'];
        const password = process.env['PROXY_PASSWORD'];

        if (username) proxyConfig.username = username;
        if (password) proxyConfig.password = password;

        return proxyConfig;
      })(),
    },
    maxRetries: parseInt(process.env['MAX_RETRIES'] || '3', 10),
    pageTimeout: parseInt(process.env['PAGE_TIMEOUT'] || '30000', 10),
    scraperId: process.env['SCRAPER_ID'] || `hospital-scraper-${process.pid}`,
  });

  return config as ScrapingConfig;
}

