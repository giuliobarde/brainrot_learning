export type VideoStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type VideoVisibility = 'public' | 'private';

export interface VideoAssets {
  voiceoverUrl?: string;
  finalVideoUrl?: string;
  thumbnailUrl?: string;
  subtitlesUrl?: string;
}

export interface Video {
  id: string;
  ownerId: string;
  topic: string;
  topicSlug: string;
  title: string;
  description: string;
  tags: string[];
  sourceMaterialId?: string;
  assets: VideoAssets;
  status: VideoStatus;
  visibility: VideoVisibility;
  publishedAt?: string;
  durationSeconds?: number;
  processingLogs?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VideoListItem {
  id: string;
  topic: string;
  topicSlug: string;
  title: string;
  description: string;
  tags: string[];
  status: VideoStatus;
  visibility: VideoVisibility;
  publishedAt?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  authorDisplayName?: string;
  createdAt: string;
}
