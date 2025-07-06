import { z } from 'zod';

// Generic vector store interface
export interface VectorStore {
  upsert(vectors: VectorData[]): Promise<void>;
  query(vector: number[], k: number, filters?: Record<string, any>): Promise<QueryResult[]>;
  delete(ids: string[]): Promise<void>;
  getStats(): Promise<VectorStoreStats>;
}

export const VectorDataSchema = z.object({
  id: z.string(),
  values: z.array(z.number()),
  metadata: z.record(z.any()),
});

export const QueryResultSchema = z.object({
  id: z.string(),
  score: z.number(),
  metadata: z.record(z.any()),
});

export const VectorStoreStatsSchema = z.object({
  totalVectors: z.number(),
  dimensions: z.number(),
  indexSize: z.number().optional(),
});

export const MongoVectorStoreConfigSchema = z.object({
  connectionString: z.string(),
  databaseName: z.string(),
  collectionName: z.string(),
  indexName: z.string().default('vector_index'),
  dimensions: z.number().default(1536),
  similarityMetric: z.enum(['euclidean', 'cosine', 'dotProduct']).default('cosine'),
});

export type VectorData = z.infer<typeof VectorDataSchema>;
export type QueryResult = z.infer<typeof QueryResultSchema>;
export type VectorStoreStats = z.infer<typeof VectorStoreStatsSchema>;
export type MongoVectorStoreConfig = z.infer<typeof MongoVectorStoreConfigSchema>;

// MongoDB specific document structure
export interface MongoVectorDocument {
  _id: string;
  content: string;
  embedding: number[];
  metadata: {
    videoId: string;
    playlistId: string;
    title: string;
    publishedAt: string;
    startTime: number;
    url: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
} 