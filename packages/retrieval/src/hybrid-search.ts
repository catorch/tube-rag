// Vector store interface (copied to avoid workspace dependency)
interface VectorStore {
  upsert(vectors: VectorData[]): Promise<void>;
  query(vector: number[], k: number, filters?: Record<string, any>): Promise<QueryResult[]>;
  delete(ids: string[]): Promise<void>;
  getStats(): Promise<VectorStoreStats>;
}

interface VectorData {
  id: string;
  values: number[];
  metadata: Record<string, any>;
}

interface QueryResult {
  id: string;
  score: number;
  metadata: Record<string, any>;
}

interface VectorStoreStats {
  totalVectors: number;
  dimensions: number;
  indexSize?: number;
}
import { TextSearchService } from './text-search.js';
import { EmbeddingService } from './embeddings.js';
import { SearchResult, RetrievalFilters, HybridSearchResult } from './types.js';

export class HybridSearchService {
  private vectorStore: VectorStore;
  private textSearch: TextSearchService;
  private embeddings: EmbeddingService;

  constructor(
    vectorStore: VectorStore,
    textSearch: TextSearchService,
    embeddings: EmbeddingService
  ) {
    this.vectorStore = vectorStore;
    this.textSearch = textSearch;
    this.embeddings = embeddings;
  }

  async search(
    query: string,
    topK: number = 10,
    filters?: RetrievalFilters,
    options: {
      vectorWeight: number;
      textWeight: number;
      minScore: number;
    } = { vectorWeight: 0.7, textWeight: 0.3, minScore: 0.5 }
  ): Promise<HybridSearchResult> {
    const [vectorResults, textResults] = await Promise.all([
      this.performVectorSearch(query, topK, filters),
      this.performTextSearch(query, topK, filters),
    ]);

    const combinedResults = this.combineResults(
      vectorResults,
      textResults,
      options.vectorWeight,
      options.textWeight,
      options.minScore
    );

    return {
      vectorResults,
      textResults,
      combinedResults: combinedResults.slice(0, topK),
    };
  }

  private async performVectorSearch(
    query: string,
    topK: number,
    filters?: RetrievalFilters
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.embeddings.generateEmbedding(query);
      const results = await this.vectorStore.query(queryEmbedding, topK, filters);

             return results.map((result: any) => ({
         id: result.id,
         content: result.metadata.content || '',
         score: result.score,
         videoId: result.metadata.videoId,
         videoTitle: result.metadata.title,
         timestamp: result.metadata.startTime,
         url: result.metadata.url,
         playlistId: result.metadata.playlistId,
         publishedAt: result.metadata.publishedAt,
       }));
    } catch (error) {
      console.error('Error performing vector search:', error);
      return [];
    }
  }

  private async performTextSearch(
    query: string,
    topK: number,
    filters?: RetrievalFilters
  ): Promise<SearchResult[]> {
    try {
      return await this.textSearch.searchText(query, topK, filters);
    } catch (error) {
      console.error('Error performing text search:', error);
      return [];
    }
  }

  private combineResults(
    vectorResults: SearchResult[],
    textResults: SearchResult[],
    vectorWeight: number,
    textWeight: number,
    minScore: number
  ): SearchResult[] {
    const resultMap = new Map<string, SearchResult>();

    // Add vector results with weighted scores
    vectorResults.forEach(result => {
      if (result.score >= minScore) {
        resultMap.set(result.id, {
          ...result,
          score: result.score * vectorWeight,
        });
      }
    });

    // Add text results with weighted scores, combining if already exists
    textResults.forEach(result => {
      if (result.score >= minScore) {
        const existing = resultMap.get(result.id);
        if (existing) {
          // Combine scores if result exists in both
          existing.score += result.score * textWeight;
        } else {
          resultMap.set(result.id, {
            ...result,
            score: result.score * textWeight,
          });
        }
      }
    });

    // Sort by combined score and return
    return Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
  }

  // Helper method to get similar chunks for a specific video
  async findSimilarInVideo(
    query: string,
    videoId: string,
    topK: number = 5
  ): Promise<SearchResult[]> {
    const filters: RetrievalFilters = { videoId };
    const results = await this.search(query, topK, filters);
    return results.combinedResults;
  }

  // Helper method to get recent relevant content
  async findRecentRelevant(
    query: string,
    daysBack: number = 30,
    topK: number = 10
  ): Promise<SearchResult[]> {
    const publishedAfter = new Date();
    publishedAfter.setDate(publishedAfter.getDate() - daysBack);
    
    const filters: RetrievalFilters = {
      publishedAfter: publishedAfter.toISOString(),
    };
    
    const results = await this.search(query, topK, filters);
    return results.combinedResults;
  }
} 