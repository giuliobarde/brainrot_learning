import type { FilterQuery, Types } from 'mongoose';

import {
  VideoModel,
  type VideoAssetsSubdoc,
  type VideoDoc,
  type VideoStatus,
} from '../models/Video';

export interface CreateVideoInput {
  ownerId: Types.ObjectId | string;
  topic: string;
  topicSlug: string;
  title: string;
  description?: string;
  tags?: string[];
  sourceMaterialId?: Types.ObjectId | string;
  status?: VideoStatus;
  durationSeconds?: number;
  assets?: VideoAssetsSubdoc;
}

export interface ListVideosFilter {
  ownerId: string | Types.ObjectId;
  topicSlug?: string;
  text?: string;
  limit?: number;
  cursor?: string;
}

export const videoRepository = {
  create(input: CreateVideoInput): Promise<VideoDoc> {
    return VideoModel.create({
      description: '',
      tags: [],
      assets: {},
      processingLogs: [],
      status: 'pending' as VideoStatus,
      ...input,
    });
  },
  findById(id: string | Types.ObjectId): Promise<VideoDoc | null> {
    return VideoModel.findById(id).exec();
  },
  update(id: string | Types.ObjectId, patch: Partial<VideoDoc>): Promise<VideoDoc | null> {
    return VideoModel.findByIdAndUpdate(id, patch, { new: true }).exec();
  },
  delete(id: string | Types.ObjectId): Promise<VideoDoc | null> {
    return VideoModel.findByIdAndDelete(id).exec();
  },
  publish(id: string | Types.ObjectId, publishedAt: Date = new Date()): Promise<VideoDoc | null> {
    return VideoModel.findByIdAndUpdate(
      id,
      { visibility: 'public', publishedAt },
      { new: true },
    ).exec();
  },
  unpublish(id: string | Types.ObjectId): Promise<VideoDoc | null> {
    return VideoModel.findByIdAndUpdate(
      id,
      { $set: { visibility: 'private' }, $unset: { publishedAt: '' } },
      { new: true },
    ).exec();
  },
  appendLog(id: string | Types.ObjectId, line: string): Promise<VideoDoc | null> {
    return VideoModel.findByIdAndUpdate(
      id,
      { $push: { processingLogs: line } },
      { new: true },
    ).exec();
  },
  setStatus(
    id: string | Types.ObjectId,
    status: VideoStatus,
    extra: Partial<Pick<VideoDoc, 'durationSeconds'>> = {},
  ): Promise<VideoDoc | null> {
    return VideoModel.findByIdAndUpdate(id, { status, ...extra }, { new: true }).exec();
  },
  setAssets(id: string | Types.ObjectId, assets: VideoAssetsSubdoc): Promise<VideoDoc | null> {
    return VideoModel.findByIdAndUpdate(id, { assets }, { new: true }).exec();
  },
  list(filter: ListVideosFilter): Promise<VideoDoc[]> {
    const query: FilterQuery<VideoDoc> = { ownerId: filter.ownerId };
    if (filter.topicSlug) query.topicSlug = filter.topicSlug;
    if (filter.text) query.$text = { $search: filter.text };
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    return VideoModel.find(query).sort({ createdAt: -1 }).limit(limit).exec();
  },
  countByOwner(ownerId: string | Types.ObjectId): Promise<number> {
    return VideoModel.countDocuments({ ownerId }).exec();
  },
};
