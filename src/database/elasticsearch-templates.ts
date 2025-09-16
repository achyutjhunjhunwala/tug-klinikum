/**
 * Elasticsearch Production Templates and ILM Policies
 * 
 * Defines production-ready index templates and ILM policies for hospital scraping data.
 * Ensures optimal performance, cost management, and data lifecycle management.
 */
export const HOSPITAL_SCRAPING_TEMPLATE = {
  name: 'hospital-scraping-template',
  index_patterns: ['hospital-metrics*'],
  template: {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 1,
      'index.lifecycle.name': 'hospital-scraping-ilm-policy',
      'index.lifecycle.rollover_alias': 'hospital-metrics-write',
      'index.refresh_interval': '30s',
      'index.translog.durability': 'async',
      'index.mapping.date_detection': true,
      'index.codec': 'best_compression',
    },
    mappings: {
      properties: {
        id: {
          type: 'keyword',
        },
        timestamp: {
          type: 'date',
          format: 'date_time||date_time_no_millis||epoch_millis',
        },
        department: {
          type: 'keyword',
          fields: {
            text: {
              type: 'text',
            },
          },
        },
        waitTimeMinutes: {
          type: 'integer',
          meta: {
            description: 'Emergency room wait time in minutes',
            unit: 'minutes',
          },
        },
        totalPatients: {
          type: 'integer',
          meta: {
            description: 'Total number of patients in treatment or waiting',
            unit: 'count',
          },
        },
        ambulancePatients: {
          type: 'integer',
          meta: {
            description: 'Number of patients who arrived by ambulance',
            unit: 'count',
          },
        },
        emergencyCases: {
          type: 'integer',
          meta: {
            description: 'Number of life-threatening emergency cases',
            unit: 'count',
          },
        },
        updateDelayMinutes: {
          type: 'integer',
          meta: {
            description: 'Data freshness - minutes since hospital last updated data',
            unit: 'minutes',
          },
        },
        scrapingSuccess: {
          type: 'boolean',
        },
        sourceUrl: {
          type: 'keyword',
          index: false,
          store: true,
        },
        metadata: {
          properties: {
            scraperId: {
              type: 'keyword',
            },
            version: {
              type: 'keyword',
            },
            processingTimeMs: {
              type: 'integer',
              meta: {
                unit: 'milliseconds',
              },
            },
            browserType: {
              type: 'keyword',
            },
            userAgent: {
              type: 'text',
              index: false,
            },
            screenResolution: {
              type: 'keyword',
              index: false,
            },
            viewportSize: {
              type: 'keyword',
              index: false,
            },
            errorMessage: {
              type: 'text',
              analyzer: 'standard',
            },
          },
        },
      },
    },
  },
  priority: 100,
};

export const HOSPITAL_SCRAPING_ILM_POLICY = {
  name: 'hospital-scraping-ilm-policy',
  policy: {
    phases: {
      hot: {
        min_age: '0ms',
        actions: {
          rollover: {
            max_size: '50GB',
            max_age: '30d',
            max_docs: 1000000,
          },
          set_priority: {
            priority: 100,
          },
        },
      },
      warm: {
        min_age: '30d',
        actions: {
          set_priority: {
            priority: 50,
          },
          allocate: {
            number_of_replicas: 0,
          },
          forcemerge: {
            max_num_segments: 1,
          },
        },
      },
      cold: {
        min_age: '90d',
        actions: {
          set_priority: {
            priority: 0,
          },
          allocate: {
            number_of_replicas: 0,
          },
        },
      },
      delete: {
        min_age: '365d',
        actions: {
          delete: {},
        },
      },
    },
  },
};

