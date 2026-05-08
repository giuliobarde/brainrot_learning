import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type VideoStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface VideoAssetsSubdoc {
  voiceoverUrl?: string;
  finalVideoUrl?: string;
  thumbnailUrl?: string;
  subtitlesUrl?: string;
}

export interface VideoDoc extends Document<Types.ObjectId> {
  ownerId: Types.ObjectId;
  topic: string;
  topicSlug: string;
  title: string;
  description: string;
  tags: string[];
  sourceMaterialId?: Types.ObjectId;
  assets: VideoAssetsSubdoc;
  status: VideoStatus;
  durationSeconds?: number;
  processingLogs: string[];
  createdAt: Date;
  updatedAt: Date;
}

const VideoAssetsSchema = new Schema<VideoAssetsSubdoc>(
  {
    voiceoverUrl: { type: String, trim: true },
    finalVideoUrl: { type: String, trim: true },
    thumbnailUrl: { type: String, trim: true },
    subtitlesUrl: { type: String, trim: true },
  },
  { _id: false },
);

const VideoSchema = new Schema<VideoDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    topic: { type: String, required: true, trim: true, maxlength: 80 },
    topicSlug: { type: String, required: true, trim: true, lowercase: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', maxlength: 2000 },
    tags: { type: [String], default: [], index: true },
    sourceMaterialId: { type: Schema.Types.ObjectId, ref: 'SourceMaterial' },
    assets: { type: VideoAssetsSchema, default: () => ({}) },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
      index: true,
    },
    durationSeconds: { type: Number, min: 0 },
    processingLogs: { type: [String], default: [] },
  },
  { timestamps: true },
);

VideoSchema.index({ ownerId: 1, topicSlug: 1, createdAt: -1 });
VideoSchema.index({ ownerId: 1, createdAt: -1 });
VideoSchema.index(
  { title: 'text', description: 'text', tags: 'text' },
  { name: 'video_text_index', weights: { title: 5, tags: 3, description: 1 } },
);

export const VideoModel: Model<VideoDoc> = model<VideoDoc>('Video', VideoSchema);
