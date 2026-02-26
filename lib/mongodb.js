import { MongoClient } from 'mongodb';

let client = null;
let db = null;

export async function getDb() {
  if (!db) {
    client = new MongoClient(process.env.MONGO_URL);
    await client.connect();
    db = client.db(process.env.DB_NAME || 'profitos');
  }
  return db;
}

export async function getCollection(name) {
  const database = await getDb();
  return database.collection(name);
}
