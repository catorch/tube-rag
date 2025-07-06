import { MongoClient, Collection, Db } from 'mongodb';
import { VectorStore, VectorData, QueryResult, VectorStoreStats, MongoVectorStoreConfig, MongoVectorDocument } from './types.js';

export class MongoDBVectorStore implements VectorStore {
  private client: MongoClient;
  private db: Db;
  private collection: Collection<MongoVectorDocument>;
  private config: MongoVectorStoreConfig;

  constructor(config: MongoVectorStoreConfig) {
    this.config = config;
    this.client = new MongoClient(config.connectionString);
    this.db = this.client.db(config.databaseName);
    this.collection = this.db.collection<MongoVectorDocument>(config.collectionName);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    console.log('Connected to MongoDB Atlas');
    
    // Ensure vector search index exists
    await this.ensureVectorIndex();
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    console.log('Disconnected from MongoDB Atlas');
  }

  private async ensureVectorIndex(): Promise<void> {
    try {
      const indexes = await this.collection.listIndexes().toArray();
      const vectorIndexExists = indexes.some((index: any) => index.name === this.config.indexName);

      if (!vectorIndexExists) {
        console.log(`Creating vector search index: ${this.config.indexName}`);
        
        // Create vector search index
        await this.collection.createSearchIndex({
          name: this.config.indexName,
          definition: {
            fields: [
              {
                type: 'vector',
                path: 'embedding',
                numDimensions: this.config.dimensions,
                similarity: this.config.similarityMetric,
              },
              {
                type: 'filter',
                path: 'metadata.videoId',
              },
              {
                type: 'filter',
                path: 'metadata.playlistId',
              },
              {
                type: 'filter',
                path: 'metadata.publishedAt',
              },
            ],
          },
        });
        
        console.log('Vector search index created successfully');
      }
    } catch (error) {
      console.error('Error ensuring vector index:', error);
      throw error;
    }
  }

  async upsert(vectors: VectorData[]): Promise<void> {
    const documents: MongoVectorDocument[] = vectors.map(vector => ({
      _id: vector.id,
      content: vector.metadata.content || '',
      embedding: vector.values,
      metadata: {
        videoId: vector.metadata.videoId,
        playlistId: vector.metadata.playlistId,
        title: vector.metadata.title,
        publishedAt: vector.metadata.publishedAt,
        startTime: vector.metadata.startTime,
        url: vector.metadata.url,
        ...vector.metadata,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const operations = documents.map(doc => ({
      replaceOne: {
        filter: { _id: doc._id },
        replacement: doc,
        upsert: true,
      },
    }));

    try {
      const result = await this.collection.bulkWrite(operations);
      console.log(`Upserted ${result.upsertedCount + result.modifiedCount} documents`);
    } catch (error) {
      console.error('Error upserting vectors:', error);
      throw error;
    }
  }

  async query(vector: number[], k: number, filters?: Record<string, any>): Promise<QueryResult[]> {
    const pipeline: any[] = [
      {
        $vectorSearch: {
          index: this.config.indexName,
          path: 'embedding',
          queryVector: vector,
          numCandidates: Math.max(k * 10, 100), // Overquery for better results
          limit: k,
          ...(filters && { filter: this.buildFilterQuery(filters) }),
        },
      },
      {
        $project: {
          _id: 1,
          content: 1,
          metadata: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    try {
      const results = await this.collection.aggregate(pipeline).toArray();
      
      return results.map((result: any) => ({
        id: result._id,
        score: result.score,
        metadata: {
          ...result.metadata,
          content: result.content,
        },
      }));
    } catch (error) {
      console.error('Error querying vectors:', error);
      throw error;
    }
  }

  private buildFilterQuery(filters: Record<string, any>): any {
    const filterQuery: any = {};

    for (const [key, value] of Object.entries(filters)) {
      if (key === 'videoId' || key === 'playlistId') {
        filterQuery[`metadata.${key}`] = { $eq: value };
      } else if (key === 'publishedAfter' || key === 'publishedBefore') {
        const dateField = 'metadata.publishedAt';
        if (!filterQuery[dateField]) {
          filterQuery[dateField] = {};
        }
        if (key === 'publishedAfter') {
          filterQuery[dateField].$gte = value;
        } else {
          filterQuery[dateField].$lte = value;
        }
      } else if (key === 'startTimeRange') {
        const { min, max } = value;
        filterQuery['metadata.startTime'] = {};
        if (min !== undefined) filterQuery['metadata.startTime'].$gte = min;
        if (max !== undefined) filterQuery['metadata.startTime'].$lte = max;
      } else {
        filterQuery[`metadata.${key}`] = { $eq: value };
      }
    }

    return filterQuery;
  }

  async delete(ids: string[]): Promise<void> {
    try {
      const result = await this.collection.deleteMany({ _id: { $in: ids } });
      console.log(`Deleted ${result.deletedCount} documents`);
    } catch (error) {
      console.error('Error deleting vectors:', error);
      throw error;
    }
  }

  async getStats(): Promise<VectorStoreStats> {
    try {
      const totalVectors = await this.collection.countDocuments();
      const stats = await this.db.stats();
      
      return {
        totalVectors,
        dimensions: this.config.dimensions,
        indexSize: stats.indexSize,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  // Helper method to search by text similarity
  async searchSimilar(text: string, embedding: number[], k: number = 10, filters?: Record<string, any>): Promise<QueryResult[]> {
    return this.query(embedding, k, filters);
  }

  // Helper method to get documents by video ID
  async getVideoChunks(videoId: string): Promise<MongoVectorDocument[]> {
    try {
      const documents = await this.collection.find({ 'metadata.videoId': videoId }).toArray();
      return documents;
    } catch (error) {
      console.error('Error getting video chunks:', error);
      throw error;
    }
  }

  // Helper method to get all unique video IDs
  async getUniqueVideoIds(): Promise<string[]> {
    try {
      const videoIds = await this.collection.distinct('metadata.videoId');
      return videoIds;
    } catch (error) {
      console.error('Error getting unique video IDs:', error);
      throw error;
    }
  }
} 