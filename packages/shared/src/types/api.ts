import type { SourceMaterial } from './source-material';
import type { TopicSummary } from './topic';
import type { PublicUser, User } from './user';
import type { VideoListItem } from './video';

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccess<T> {
  data: T;
}

export type ApiResponse<T> = ApiSuccess<T> | { error: ApiError };

export interface AuthRegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface MeResponse {
  user: User;
}

export interface GenerateVideoRequest {
  sourceMaterialId?: string;
  inlineText?: string;
  topicHint?: string;
  tone?: 'casual' | 'energetic' | 'serious';
  lengthPreset?: 'short' | 'medium' | 'long';
}

export interface ListVideosQuery {
  topic?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface ListVideosResponse {
  videos: VideoListItem[];
  nextCursor?: string;
}

export interface ListTopicsResponse {
  topics: TopicSummary[];
}

export interface UploadSourceMaterialResponse {
  sourceMaterial: SourceMaterial;
}

export interface CommentAuthor {
  user: PublicUser;
}
