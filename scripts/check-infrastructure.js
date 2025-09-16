#!/usr/bin/env node

const { Client } = require('@elastic/elasticsearch');
require('dotenv').config();

async function checkInfrastructure() {
  const client = new Client({
    node: process.env.ELASTICSEARCH_CLOUD_URL,
    auth: {
      apiKey: process.env.ELASTICSEARCH_API_KEY,
    },
  });

  console.log('🔍 Checking if infrastructure was created...');
  
  // Check ILM policy
  try {
    await client.ilm.getLifecycle({ name: 'hospital-scraping-ilm-policy' });
    console.log('✅ ILM policy exists: hospital-scraping-ilm-policy');
  } catch (error) {
    console.log('❌ ILM policy NOT found: hospital-scraping-ilm-policy');
  }

  // Check template
  try {
    const exists = await client.indices.existsIndexTemplate({ name: 'hospital-scraping-template' });
    if (exists) {
      console.log('✅ Index template exists: hospital-scraping-template');
    } else {
      console.log('❌ Index template NOT found: hospital-scraping-template');
    }
  } catch (error) {
    console.log('❌ Index template NOT found: hospital-scraping-template');
  }

  // Check index
  try {
    const exists = await client.indices.exists({ index: 'hospital-metrics' });
    if (exists) {
      console.log('✅ Index exists: hospital-metrics');
    } else {
      console.log('❌ Index NOT found: hospital-metrics');
    }
  } catch (error) {
    console.log('❌ Index NOT found: hospital-metrics');
  }
}

checkInfrastructure().catch(console.error);
