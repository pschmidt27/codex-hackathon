export type KnowledgeSearchResult = {
  path: string;
  title: string;
  snippet: string;
  score: number;
};

export type KnowledgeReadResult = {
  path: string;
  title: string;
  content: string;
  contentType: "markdown" | "text";
  updatedAt?: string;
};

export type RecentIngestResult = {
  path: string;
  title: string;
  snippet: string;
  receivedAt?: string;
  relatedCuratedPaths: string[];
  submissionId?: string;
};
