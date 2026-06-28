import fs from 'fs';
import path from 'path';

async function runTests() {
  const baseUrl = 'http://localhost:3000/api';
  let cookie = '';
  
  // Login
  console.log('--- LOGIN ---');
  const loginRes = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@proyecty.com', password: 'admin' }) // Try admin
  });
  if (!loginRes.ok) {
    const loginRes2 = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@finance.org', password: 'admin' })
    });
    if (!loginRes2.ok) {
      console.log('Login failed', await loginRes2.text());
      return;
    }
    const data = await loginRes2.json();
    token = data.token;
    console.log('Logged in as test');
  } else {
    const data = await loginRes.json();
    token = data.token;
    console.log('Logged in as admin');
  }

  // We need to upload files using FormData
  // Node fetch doesn't have FormData built-in the exact same way before v18, but this is v24 so it's built-in.
  const projectId = 1;
  
  // Helper to upload file
  async function uploadFile(filePath, filename, mimeType) {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('file', blob, filename);
    
    return await fetch(`${baseUrl}/projects/${projectId}/documents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
  }

  // Test 1: Valid PDF (< 10MB)
  console.log('\n--- TEST 1: Valid PDF ---');
  const res1 = await uploadFile('test_valid.pdf', 'test_valid.pdf', 'application/pdf');
  const data1 = await res1.json();
  console.log('Upload valid PDF status:', res1.status, data1);
  const uploadedDocId = data1.id;

  // Test 2: Invalid Extension
  console.log('\n--- TEST 2: Invalid TXT ---');
  const res2 = await uploadFile('test_invalid.txt', 'test_invalid.txt', 'text/plain');
  console.log('Upload invalid TXT status:', res2.status, await res2.text());

  // Test 3: Large File (> 10MB)
  console.log('\n--- TEST 3: Large PDF ---');
  const res3 = await uploadFile('test_large.pdf', 'test_large.pdf', 'application/pdf');
  console.log('Upload large PDF status:', res3.status, await res3.text());

  // Test 4: Delete File
  console.log('\n--- TEST 4: Delete File ---');
  if (uploadedDocId) {
    console.log('--- TEST FASE 5B: AI ANALYSIS ---');
    console.log(`1. Invoking POST /api/documents/${uploadedDocId}/analyze`);
    const aiRes = await fetch(`${baseUrl}/documents/${uploadedDocId}/analyze`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const aiData = await aiRes.json();
    console.log(`2. Response JSON status: ${aiRes.status}`);
    console.log('Summary:', aiData.summary);
    console.log('Key Points:', aiData.keyPoints);
    console.log('Entities:', aiData.detectedEntities);
    console.log('Category:', aiData.suggestedCategory);
    console.log('4. Persisted in document_analysis with ID:', aiData.id);
    
    console.log(`5. Invoking POST /api/documents/${uploadedDocId}/analyze again to test CACHE...`);
    const startTime = Date.now();
    const aiResCache = await fetch(`${baseUrl}/documents/${uploadedDocId}/analyze`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const aiDataCache = await aiResCache.json();
    const duration = Date.now() - startTime;
    console.log(`Cache response status: ${aiResCache.status}. Duration: ${duration}ms (Expected < 500ms for cache)`);
    console.log(`Matched Cache ID: ${aiDataCache.id === aiData.id ? 'YES' : 'NO'}`);
  }

  if (uploadedDocId) {
    const res4 = await fetch(`${baseUrl}/documents/${uploadedDocId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Delete status:', res4.status, await res4.text());
  }

  // Test 5: Verify Audit Logs
  console.log('\n--- TEST 5: Audit Logs ---');
  const res5 = await fetch(`${baseUrl}/projects/${projectId}/activities`, {
    headers: { 'Cookie': cookie }
  });
  const logs = await res5.json();
  console.log('Recent audit logs:', logs.slice(0, 3).map(l => l.action));
}

runTests().catch(console.error);
