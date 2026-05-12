import type { Video } from '@brainrot/shared';

import type { VideoDoc } from '../models/Video';

export function toPublicVideo(doc: VideoDoc): Video {
  return {
    id: doc.id,
    ownerId: String(doc.ownerId),
    topic: doc.topic,
    topicSlug: doc.topicSlug,
    title: doc.title,
    description: doc.description,
    tags: doc.tags,
    sourceMaterialId: doc.sourceMaterialId ? String(doc.sourceMaterialId) : undefined,
    assets: {
      voiceoverUrl: doc.assets?.voiceoverUrl,
      finalVideoUrl: doc.assets?.finalVideoUrl,
      thumbnailUrl: doc.assets?.thumbnailUrl,
      subtitlesUrl: doc.assets?.subtitlesUrl,
    },
    status: doc.status,
    visibility: doc.visibility,
    publishedAt: doc.publishedAt?.toISOString(),
    durationSeconds: doc.durationSeconds,
    processingLogs: doc.processingLogs,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
