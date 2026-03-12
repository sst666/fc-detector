const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG_FILE = path.join(__dirname, 'config.json');
const RESULTS_FILE = path.join(__dirname, 'results.json');
const MODELS_FILE = path.join(__dirname, 'models.json');

// Default API sites - each site supports both OpenAI and Anthropic calls
const DEFAULT_SITES = {
  'yi': { 
    name: 'api.bywlai.cn',
    openaiUrl: 'https://api.bywlai.cn/v1/chat/completions',
    anthropicUrl: 'https://api.bywlai.cn/v1/messages'
  },
  '132006': { 
    name: 'api.132006.xyz',
    openaiUrl: 'https://api.132006.xyz/v1/chat/completions',
    anthropicUrl: 'https://api.132006.xyz/v1/messages'
  },
  'gptgod': { 
    name: 'new.gptgod.cloud',
    openaiUrl: 'https://new.gptgod.cloud/v1/chat/completions',
    anthropicUrl: 'https://new.gptgod.cloud/v1/messages'
  },
  'xqtd520qidong': { 
    name: 'api.xqtd520qidong.com',
    openaiUrl: 'https://api.xqtd520qidong.com/v1/chat/completions',
    anthropicUrl: 'https://api.xqtd520qidong.com/v1/messages'
  },
  'minimax': {
    name: 'api.minimaxi.com',
    openaiUrl: 'https://api.minimaxi.com/v1/text/chatcompletion_v2',
    anthropicUrl: 'https://api.minimaxi.com/v1/messages'
  }
};

// Load or create config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return { sites: {}, customSites: [] };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Get all sites (merged default + custom)
function getAllSites() {
  const config = loadConfig();
  return { ...DEFAULT_SITES, ...config.sites };
}

// Load or initialize results
function loadResults() {
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveResults(results) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

// Load or initialize models
function loadModels() {
  try {
    if (fs.existsSync(MODELS_FILE)) {
      return JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveModels(models) {
  fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2));
}

// Keep all test results, don't overwrite
function deduplicateResults(newResult, existingResults) {
  return [newResult, ...existingResults].slice(0, 200);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== API Config Endpoints ==========

// Get all sites (without keys)
app.get('/api/sites', (req, res) => {
  const config = loadConfig();
  const sites = getAllSites();
  const result = {};
  
  for (const [key, site] of Object.entries(sites)) {
    result[key] = {
      id: key,
      name: site.name,
      hasKey: !!config.keys?.[key]
    };
  }
  
  res.json(result);
});

// Set API key for a site
app.post('/api/sites/key', (req, res) => {
  const { siteId, key } = req.body;
  
  if (!siteId || !key) {
    return res.json({ success: false, error: 'Missing siteId or key' });
  }
  
  const config = loadConfig();
  const sites = getAllSites();
  
  if (!sites[siteId]) {
    return res.json({ success: false, error: 'Site not found' });
  }
  
  // Store key separately in config
  if (!config.keys) config.keys = {};
  config.keys[siteId] = key;
  saveConfig(config);
  
  res.json({ success: true });
});

// Add a new custom site
app.post('/api/sites', (req, res) => {
  const { name, baseUrl } = req.body;
  
  if (!name || !baseUrl) {
    return res.json({ success: false, error: 'Missing name or baseUrl' });
  }
  
  const config = loadConfig();
  const id = 'custom_' + Date.now();
  
  // Auto-generate URLs from base URL
  let openaiUrl = baseUrl;
  let anthropicUrl = baseUrl;
  
  // Remove trailing slash and ensure https:// prefix
  openaiUrl = openaiUrl.replace(/\/$/, '');
  anthropicUrl = anthropicUrl.replace(/\/$/, '');
  
  // Ensure https:// prefix
  if (!openaiUrl.startsWith('http://') && !openaiUrl.startsWith('https://')) {
    openaiUrl = 'https://' + openaiUrl;
  }
  if (!anthropicUrl.startsWith('http://') && !anthropicUrl.startsWith('https://')) {
    anthropicUrl = 'https://' + anthropicUrl;
  }
  
  // Add paths if not present
  if (!openaiUrl.includes('/v1/')) {
    openaiUrl += '/v1/chat/completions';
  }
  if (!anthropicUrl.includes('/v1/')) {
    anthropicUrl += '/v1/messages';
  }
  
  config.sites[id] = {
    name,
    openaiUrl,
    anthropicUrl
  };
  
  saveConfig(config);
  res.json({ success: true, id });
});

// Delete a site (only custom sites)
app.delete('/api/sites', (req, res) => {
  const { siteId } = req.body;
  
  if (!siteId) {
    return res.json({ success: false, error: 'Missing siteId' });
  }
  
  // Only allow deleting custom sites
  if (!siteId.startsWith('custom_')) {
    return res.json({ success: false, error: '无法删除默认站点，只能删除自定义站点' });
  }
  
  const config = loadConfig();
  delete config.sites[siteId];
  if (config.keys) delete config.keys[siteId];
  saveConfig(config);
  
  res.json({ success: true });
});

// ========== Test Function Calling ==========

app.post('/api/test', async (req, res) => {
  const { model, siteId, apiType } = req.body;
  
  if (!model || !siteId) {
    return res.json({ success: false, error: 'Missing model or site' });
  }
  
  const config = loadConfig();
  const sites = getAllSites();
  const site = sites[siteId];
  
  if (!site) {
    return res.json({ success: false, error: 'Invalid site' });
  }
  
  // Get key from separate keys object
  const apiKey = config.keys?.[siteId];
  
  if (!apiKey) {
    return res.json({ success: false, error: '请先设置 API Key' });
  }

  // Select URL based on API type
  const apiEndpoint = apiType === 'anthropic' ? site.anthropicUrl : site.openaiUrl;

  let testPayload;
  let headers = {
    'Content-Type': 'application/json'
  };

  if (apiType === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    
    testPayload = {
      model: model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'What is the weather in Tokyo? Use the get_weather function.' }],
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather information for a city',
          input_schema: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' }
            },
            required: ['city']
          }
        }
      ]
    };
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
    
    testPayload = {
      model: model,
      messages: [{ role: 'user', content: 'What is the weather in Tokyo? Use the get_weather function.' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather information for a city',
            parameters: {
              type: 'object',
              properties: {
                city: { type: 'string', description: 'City name' }
              },
              required: ['city']
            }
          }
        }
      ],
      tool_choice: 'auto'
    };
  }

  try {
    const response = await axios.post(apiEndpoint, testPayload, {
      headers: headers,
      timeout: 30000
    });

    let hasFunctionCalling = false;
    
    if (apiType === 'anthropic') {
      const content = response.data.content;
      hasFunctionCalling = content && content.some(c => c.type === 'tool_use');
    } else {
      const message = response.data.choices?.[0]?.message;
      hasFunctionCalling = message?.tool_calls != null || message?.function_call != null;
    }
    
    const result = {
      model,
      siteId,
      siteName: site.name,
      apiType,
      support: hasFunctionCalling,
      timestamp: new Date().toISOString()
    };

    const results = loadResults();
    const deduped = deduplicateResults(result, results);
    saveResults(deduped);

    res.json({ success: true, support: hasFunctionCalling, result });
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.response?.data?.error || error.message;
    
    const isUnsupported = error.response?.status === 400 || error.response?.status === 403;
    
    const result = {
      model,
      siteId,
      siteName: site.name,
      apiType,
      support: false,
      error: errorMsg,
      timestamp: new Date().toISOString()
    };

    const results = loadResults();
    const deduped = deduplicateResults(result, results);
    saveResults(deduped);

    res.json({ success: isUnsupported, support: false, error: errorMsg, result });
  }
});

// ========== Results Endpoints ==========

app.get('/api/results', (req, res) => {
  res.json(loadResults());
});

app.delete('/api/results', (req, res) => {
  const { model, siteId, timestamp } = req.body;
  if (!model || !siteId || !timestamp) {
    return res.json({ success: false, error: 'Missing parameters' });
  }
  
  let results = loadResults();
  results = results.filter(r => !(r.model === model && r.siteId === siteId && r.timestamp === timestamp));
  saveResults(results);
  res.json({ success: true });
});

app.post('/api/clear-results', (req, res) => {
  saveResults([]);
  res.json({ success: true });
});

// ========== Models Endpoints ==========

app.get('/api/models', (req, res) => {
  res.json(loadModels());
});

app.post('/api/models', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.json({ success: false, error: 'Missing model name' });
  }
  
  const models = loadModels();
  if (!models.includes(name)) {
    models.push(name);
    saveModels(models);
  }
  res.json({ success: true, models });
});

app.delete('/api/models', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.json({ success: false, error: 'Missing model name' });
  }
  
  let models = loadModels();
  models = models.filter(m => m !== name);
  saveModels(models);
  res.json({ success: true, models });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FC Detector running at http://0.0.0.0:${PORT}`);
});
