export type VideoStatus = 'pending' | 'processing' | 'ready' | 'failed';

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
  title: string;
  description: string;
  tags: string[];
  sourceMaterialId?: string;
  assets: VideoAssets;
  status: VideoStatus;
  durationSeconds?: number;
  processingLogs?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VideoListItem {
  id: string;
  topic: string;
  title: string;
  description: string;
  tags: string[];
  status: VideoStatus;
  thumbnailUrl?: string;
  durationSeconds?: number;
  createdAt: string;
}
