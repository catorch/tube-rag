export * from './types.js';
export * from './mongodb-vector-store.js';

// Factory function to create vector store instances
import { MongoDBVectorStore } from './mongodb-vector-store.js';
import { MongoVectorStoreConfig } from './types.js';

export function createMongoVectorStore(config: MongoVectorStoreConfig): MongoDBVectorStore {
  return new MongoDBVectorStore(config);
} 