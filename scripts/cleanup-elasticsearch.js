#!/usr/bin/env node

const { Client } = require('@elastic/elasticsearch');
require('dotenv').config();

async function cleanupElasticsearch() {
  const client = new Client({
    node: process.env.ELASTICSEARCH_CLOUD_URL,
    auth: {
      apiKey: process.env.ELASTICSEARCH_API_KEY,
    },
  });

  console.log('🔍 Connecting to Elasticsearch...');
  try {
    await client.ping();
    console.log('✅ Connected to Elasticsearch successfully');
  } catch (error) {
    console.error('❌ Failed to connect to Elasticsearch:', error.message);
    process.exit(1);
  }

  const indexName = process.env.ELASTICSEARCH_INDEX || 'hospital-metrics';
  const templateName = 'hospital-scraping-template';
  const ilmPolicyName = 'hospital-scraping-ilm-policy';

  console.log('\n🧹 CLEANING UP ELASTICSEARCH INFRASTRUCTURE');
  console.log('============================================');

  // 1. Delete the index if it exists
  try {
    const indexExists = await client.indices.exists({ index: indexName });
    if (indexExists) {
      console.log(`🗑️  Deleting index: ${indexName}`);
      await client.indices.delete({ index: indexName });
      console.log(`✅ Index ${indexName} deleted`);
    } else {
      console.log(`ℹ️  Index ${indexName} doesn't exist`);
    }
  } catch (error) {
    console.log(`⚠️  Error with index deletion: ${error.message}`);
  }

  // 2. Delete the index template if it exists
  try {
    const templateExists = await client.indices.existsIndexTemplate({ name: templateName });
    if (templateExists) {
      console.log(`🗑️  Deleting template: ${templateName}`);
      await client.indices.deleteIndexTemplate({ name: templateName });
      console.log(`✅ Template ${templateName} deleted`);
    } else {
      console.log(`ℹ️  Template ${templateName} doesn't exist`);
    }
  } catch (error) {
    console.log(`⚠️  Error with template deletion: ${error.message}`);
  }

  // 3. Delete the ILM policy if it exists
  try {
    const ilmExists = await client.ilm.getLifecycle({ name: ilmPolicyName }).then(() => true).catch(() => false);
    if (ilmExists) {
      console.log(`🗑️  Deleting ILM policy: ${ilmPolicyName}`);
      await client.ilm.deleteLifecycle({ name: ilmPolicyName });
      console.log(`✅ ILM policy ${ilmPolicyName} deleted`);
    } else {
      console.log(`ℹ️  ILM policy ${ilmPolicyName} doesn't exist`);
    }
  } catch (error) {
    console.log(`⚠️  Error with ILM policy deletion: ${error.message}`);
  }

  console.log('\n🎉 CLEANUP COMPLETE!');
  console.log('====================');
  console.log('✅ Elasticsearch infrastructure cleaned');
  console.log('🚀 Ready for fresh deployment test');
}

cleanupElasticsearch().catch(console.error);
