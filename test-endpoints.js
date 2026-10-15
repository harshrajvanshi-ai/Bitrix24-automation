/**
 * End-to-end HTTP integration test for Express server
 */
const { app } = require('./server');
const http = require('http');

let server;
const PORT = 3999;

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = typeof body === 'object' ? JSON.stringify(body) : body;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  server = app.listen(PORT, async () => {
    console.log(`Test server running on port ${PORT}...`);
    try {
      // Test 1: GET /health
      console.log('Testing GET /health...');
      const healthRes = await request('GET', '/health');
      console.log('Health status:', healthRes.status, healthRes.data);
      if (healthRes.status !== 200 && healthRes.status !== 503) {
        throw new Error(`Unexpected health status: ${healthRes.status}`);
      }

      // Test 2: Unauthorized request to /webhook/bitrix
      console.log('Testing unauthorized POST /webhook/bitrix (invalid token)...');
      const unauthRes = await request('POST', '/webhook/bitrix', {
        auth: { application_token: 'invalid_token_123' }
      });
      console.log('Unauthorized response status:', unauthRes.status);
      if (unauthRes.status !== 401) {
        throw new Error(`Expected 401 Unauthorized, got: ${unauthRes.status}`);
      }

      // Test 3: Authorized request with missing item ID
      console.log('Testing authorized POST /webhook/bitrix with missing item ID...');
      const token = process.env.BITRIX_OUTBOUND_TOKEN || process.env.outbound_webhook_accesstokken;
      const validTokenRes = await request('POST', '/webhook/bitrix', {
        auth: { application_token: token },
        event: 'ONCRMITEMUPDATE'
      });
      console.log('Missing item ID response status:', validTokenRes.status);
      if (validTokenRes.status !== 400) {
        throw new Error(`Expected 400 Bad Request, got: ${validTokenRes.status}`);
      }

      // Test 4: URL-encoded simulated Bitrix24 payload
      console.log('Testing URL-encoded Bitrix24 payload...');
      const urlEncodedBody = `auth%5Bapplication_token%5D=${encodeURIComponent(token)}&data%5BFIELDS%5D%5BID%5D=999999&data%5BFIELDS%5D%5BENTITY_TYPE_ID%5D=1032&event=ONCRMITEMUPDATE`;
      const urlEncodedRes = await request(
        'POST',
        '/webhook/bitrix',
        urlEncodedBody,
        { 'Content-Type': 'application/x-www-form-urlencoded' }
      );
      console.log('URLEncoded webhook acceptance status:', urlEncodedRes.status, urlEncodedRes.data);
      if (urlEncodedRes.status !== 200) {
        throw new Error(`Expected 200 OK for accepted webhook, got: ${urlEncodedRes.status}`);
      }

      console.log('\nAll integration endpoint tests PASSED successfully!');
    } catch (err) {
      console.error('\nIntegration test failed:', err);
      process.exitCode = 1;
    } finally {
      server.close();
    }
  });
}

runTests();
