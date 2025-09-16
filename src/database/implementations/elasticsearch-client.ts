import { Client } from '@elastic/elasticsearch';
import { v4 as uuidv4 } from 'uuid';
import {
  DatabaseClient,
  DatabaseConnectionConfig,
} from '@/database/interfaces/database-client.interface';
import { HospitalMetric, CreateHospitalMetric } from '@/models/hospital-metric';
import {
  QueryFilter,
  DatabaseHealth,
  BulkInsertResult,
  QueryResult,
} from '@/database/interfaces/query-types';
import {
  HOSPITAL_SCRAPING_TEMPLATE,
  HOSPITAL_SCRAPING_ILM_POLICY,
} from '@/database/elasticsearch-templates';

export class ElasticsearchClient implements DatabaseClient {
  private client: Client;
  private readonly indexName: string;
  private connected = false;

  constructor(config: DatabaseConnectionConfig) {
    this.indexName = config.indexName || 'hospital-metrics';

    this.client = new Client({
      node: config.url,
      auth: {
        apiKey: config.apiKey!,
      },
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.ping();
      await this.ensureIndexExists();
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to Elasticsearch: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<DatabaseHealth> {
    const startTime = Date.now();
    try {
      const health = await this.client.cluster.health();
      const stats = await this.client.indices.stats({ index: this.indexName });
      const responseTime = Date.now() - startTime;

      return {
        connected: true,
        responseTimeMs: responseTime,
        version: 'unknown',
        clusterHealth: health.status as 'green' | 'yellow' | 'red',
        indexCount: Object.keys(stats.indices || {}).length,
        documentCount: stats._all?.total?.docs?.count || 0,
      };
    } catch (error) {
      return {
        connected: false,
        responseTimeMs: Date.now() - startTime,
        lastError: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async insert(data: CreateHospitalMetric): Promise<string> {
    const id = uuidv4();
    const doc: HospitalMetric = {
      ...data,
      id,
      timestamp: new Date(),
    };

    await this.client.index({
      index: this.indexName,
      id,
      body: doc,
      refresh: 'wait_for',
    });

    return id;
  }

  async bulkInsert(data: CreateHospitalMetric[]): Promise<BulkInsertResult> {
    const body = data.flatMap(item => {
      const id = uuidv4();
      const doc: HospitalMetric = {
        ...item,
        id,
        timestamp: new Date(),
      };

      return [{ index: { _index: this.indexName, _id: id } }, doc];
    });

    const response = await this.client.bulk({
      body,
      refresh: 'wait_for',
    });

    const errors: Array<{ index: number; error: string }> = [];
    let successful = 0;

    response.items.forEach((item: any) => {
      if (item.index.error) {
        errors.push({ index: 0, error: item.index.error.reason });
      } else {
        successful++;
      }
    });

    return {
      successful,
      failed: errors.length,
      errors,
    };
  }

  async query(filters: QueryFilter): Promise<QueryResult<HospitalMetric>> {
    const query = this.buildQuery(filters);
    const response = await this.client.search({
      index: this.indexName,
      body: {
        query,
        sort: [{ [filters.sortBy || 'timestamp']: { order: filters.sortOrder || 'desc' } }],
        from: filters.offset || 0,
        size: filters.limit || 100,
      },
    });

    const data = response.hits.hits.map((hit: any) => hit._source as HospitalMetric);

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value || 0;

    return {
      data,
      total,
      offset: filters.offset || 0,
      limit: filters.limit || 100,
    };
  }

  async createIndex(): Promise<void> {
    await this.client.indices.create({
      index: this.indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1, // Improved for production
          'index.refresh_interval': '30s',
          'index.codec': 'best_compression',
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            timestamp: { 
              type: 'date',
              format: 'date_time||date_time_no_millis||epoch_millis'
            },
            department: { 
              type: 'keyword',
              fields: {
                text: { type: 'text' }
              }
            },
            waitTimeMinutes: { 
              type: 'integer',
              meta: {
                description: 'Emergency room wait time in minutes',
                unit: 'minutes'
              }
            },
            totalPatients: { 
              type: 'integer',
              meta: {
                description: 'Total number of patients in treatment or waiting',
                unit: 'count'
              }
            },
            ambulancePatients: { 
              type: 'integer',
              meta: {
                description: 'Number of patients who arrived by ambulance',
                unit: 'count'
              }
            },
            emergencyCases: { 
              type: 'integer',
              meta: {
                description: 'Number of life-threatening emergency cases',
                unit: 'count'
              }
            },
            updateDelayMinutes: { 
              type: 'integer',
              meta: {
                description: 'Data freshness - minutes since hospital last updated data',
                unit: 'minutes'
              }
            },
            scrapingSuccess: { type: 'boolean' },
            sourceUrl: { 
              type: 'keyword',
              index: false,
              store: true
            },
            metadata: {
              properties: {
                scraperId: { type: 'keyword' },
                version: { type: 'keyword' },
                processingTimeMs: { 
                  type: 'integer',
                  meta: { unit: 'milliseconds' }
                },
                browserType: { type: 'keyword' },
                userAgent: { type: 'text', index: false },
                screenResolution: { type: 'keyword', index: false },
                viewportSize: { type: 'keyword', index: false },
                errorMessage: { 
                  type: 'text',
                  analyzer: 'standard'
                },
              },
            },
          },
        },
      },
    });
  }

  async cleanup(olderThan: Date): Promise<number> {
    const response = await this.client.deleteByQuery({
      index: this.indexName,
      body: {
        query: {
          range: {
            timestamp: {
              lt: olderThan.toISOString(),
            },
          },
        },
      },
      refresh: true,
    });

    return response.deleted || 0;
  }

  private async ensureIndexExists(): Promise<void> {
    // First, ensure production infrastructure is set up
    await this.ensureProductionInfrastructure();
    
    // Then check if our specific index exists
    const exists = await this.client.indices.exists({ index: this.indexName });
    if (!exists) {
      await this.createIndex();
    }
  }

  /**
   * Sets up production-ready index templates in Elasticsearch
   */
  async setupIndexTemplates(): Promise<void> {
    try {
      // Check if template already exists
      const templateExists = await this.client.indices.existsTemplate({
        name: HOSPITAL_SCRAPING_TEMPLATE.name
      });

      if (!templateExists) {
        await this.client.indices.putTemplate({
          name: HOSPITAL_SCRAPING_TEMPLATE.name,
          body: {
            index_patterns: HOSPITAL_SCRAPING_TEMPLATE.index_patterns,
            settings: HOSPITAL_SCRAPING_TEMPLATE.template.settings,
            mappings: HOSPITAL_SCRAPING_TEMPLATE.template.mappings as any,
            order: HOSPITAL_SCRAPING_TEMPLATE.priority,
          }
        });
        console.log(`✅ Created index template: ${HOSPITAL_SCRAPING_TEMPLATE.name}`);
      } else {
        console.log(`ℹ️  Index template already exists: ${HOSPITAL_SCRAPING_TEMPLATE.name}`);
      }
    } catch (error) {
      console.error('❌ Failed to setup index templates:', error);
      throw new Error(`Failed to setup index templates: ${error}`);
    }
  }

  /**
   * Sets up ILM policies for cost-effective data lifecycle management
   */
  async setupILMPolicies(): Promise<void> {
    try {
      // Check if ILM policy already exists
      const policyExists = await this.client.ilm.getLifecycle({
        name: HOSPITAL_SCRAPING_ILM_POLICY.name
      }).then(() => true).catch(() => false);

      if (!policyExists) {
        await this.client.ilm.putLifecycle({
          name: HOSPITAL_SCRAPING_ILM_POLICY.name,
          body: {
            policy: HOSPITAL_SCRAPING_ILM_POLICY.policy
          }
        });
        console.log(`✅ Created ILM policy: ${HOSPITAL_SCRAPING_ILM_POLICY.name}`);
      } else {
        console.log(`ℹ️  ILM policy already exists: ${HOSPITAL_SCRAPING_ILM_POLICY.name}`);
      }
    } catch (error) {
      console.error('❌ Failed to setup ILM policies:', error);
      throw new Error(`Failed to setup ILM policies: ${error}`);
    }
  }

  /**
   * Ensures all production infrastructure is properly set up
   * This is the perfect place called from ensureIndexExists()!
   */
  async ensureProductionInfrastructure(): Promise<void> {
    try {
      console.log('🔧 Setting up production Elasticsearch infrastructure...');
      
      // Set up ILM policies first (templates reference them)
      await this.setupILMPolicies();
      
      // Then set up index templates
      await this.setupIndexTemplates();
      
      console.log('✅ Production infrastructure setup complete');
    } catch (error) {
      console.error('❌ Failed to setup production infrastructure:', error);
      // Don't throw here to allow fallback to basic index creation
      console.warn('⚠️  Falling back to basic index creation');
    }
  }

  private buildQuery(filters: QueryFilter): any {
    const must: any[] = [];

    if (filters.timeRange) {
      must.push({
        range: {
          timestamp: {
            gte: filters.timeRange.startTime.toISOString(),
            lte: filters.timeRange.endTime.toISOString(),
          },
        },
      });
    }

    if (filters.scrapingSuccess !== undefined) {
      must.push({
        term: { scrapingSuccess: filters.scrapingSuccess },
      });
    }

    if (filters.minWaitTime !== undefined) {
      must.push({
        range: { waitTimeMinutes: { gte: filters.minWaitTime } },
      });
    }

    if (filters.maxWaitTime !== undefined) {
      must.push({
        range: { waitTimeMinutes: { lte: filters.maxWaitTime } },
      });
    }

    if (filters.sourceUrl) {
      must.push({
        term: { sourceUrl: filters.sourceUrl },
      });
    }

    return must.length > 0 ? { bool: { must } } : { match_all: {} };
  }
}
