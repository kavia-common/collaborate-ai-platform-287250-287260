const http = require('http');

const data = JSON.stringify({
  messages: [{ role: 'user', content: 'Hello, are you working?' }]
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/ai/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Testing AI Chat endpoint...');

const req = http.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('Response Body:', responseData);
    if (res.statusCode === 200) {
        console.log('SUCCESS: Endpoint returned 200');
    } else {
        console.log('FAILURE: Endpoint returned non-200');
    }
  });
});

req.on('error', (error) => {
  console.error('Request Error:', error);
});

req.write(data);
req.end();
