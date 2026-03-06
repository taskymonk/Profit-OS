import { getDb } from '@/lib/mongodb';
import crypto from 'crypto';

/**
 * Verify an API key from the X-API-Key header.
 * Returns { valid, key, error } where key is the full apiKey document if valid.
 */
export async function verifyApiKey(request) {
  const apiKey = request.headers.get('x-api-key') || request.headers.get('X-API-Key');
  if (!apiKey) {
    return { valid: false, key: null, error: 'Missing X-API-Key header' };
  }

  const db = await getDb();
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const keyDoc = await db.collection('apiKeys').findOne({ keyHash, revoked: { $ne: true } });

  if (!keyDoc) {
    return { valid: false, key: null, error: 'Invalid or revoked API key' };
  }

  // Update last used timestamp
  await db.collection('apiKeys').updateOne(
    { _id: keyDoc._id },
    { $set: { lastUsedAt: new Date().toISOString() }, $inc: { requestCount: 1 } }
  );

  // Basic rate limiting: check requests in last minute
  const rateLimit = keyDoc.rateLimit || 100; // requests per minute
  const oneMinAgo = new Date(Date.now() - 60000).toISOString();
  const recentRequests = await db.collection('apiRequestLog').countDocuments({
    apiKeyId: keyDoc._id,
    timestamp: { $gte: oneMinAgo },
  });

  if (recentRequests >= rateLimit) {
    return { valid: false, key: keyDoc, error: `Rate limit exceeded (${rateLimit} req/min)` };
  }

  // Log the request
  await db.collection('apiRequestLog').insertOne({
    apiKeyId: keyDoc._id,
    timestamp: new Date().toISOString(),
    method: request.method,
    path: new URL(request.url).pathname,
  });

  // Cleanup old logs (keep last hour)
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  await db.collection('apiRequestLog').deleteMany({ timestamp: { $lt: oneHourAgo } }).catch(() => {});

  return { valid: true, key: keyDoc, error: null };
}

/**
 * Check if the API key has the required permission level.
 * Levels: read < readwrite < full
 */
export function hasPermission(keyDoc, requiredLevel) {
  const levels = { read: 1, readwrite: 2, full: 3 };
  const keyLevel = levels[keyDoc.scope] || 0;
  const required = levels[requiredLevel] || 0;
  return keyLevel >= required;
}
