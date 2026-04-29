export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: number;
}

export interface APIKey {
  id: string;
  key: string;
  status: 'active' | 'exhausted' | 'invalid';
  usageCount: number;
  createdAt: number;
}

export interface WPWebsite {
  id: string;
  siteUrl: string;
  username: string;
  appPassword: string;
  name: string;
  createdAt: number;
}

export interface KeywordBatch {
  id: string;
  keywords: string[];
  status: 'pending' | 'processing' | 'completed';
  createdAt: number;
}

export interface Article {
  id: string;
  keyword: string;
  title: string;
  content: string;
  metaDescription: string;
  slug: string;
  status: 'draft' | 'published' | 'scheduled' | 'error';
  websiteId: string;
  wpPostId?: string;
  batchId: string;
  createdAt: number;
  schemaMarkup?: string;
  error?: string;
}
