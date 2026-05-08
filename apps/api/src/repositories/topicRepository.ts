import type { Types } from 'mongoose';

import { TopicModel, type TopicDoc } from '../models/Topic';

export interface UpsertTopicInput {
  slug: string;
  displayName: string;
  accentColor?: string;
  iconKey?: string;
}

export const topicRepository = {
  findBySlug(slug: string): Promise<TopicDoc | null> {
    return TopicModel.findOne({ slug }).exec();
  },
  findById(id: string | Types.ObjectId): Promise<TopicDoc | null> {
    return TopicModel.findById(id).exec();
  },
  upsert(input: UpsertTopicInput): Promise<TopicDoc> {
    return TopicModel.findOneAndUpdate(
      { slug: input.slug },
      { $setOnInsert: input },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec() as Promise<TopicDoc>;
  },
  delete(id: string | Types.ObjectId): Promise<TopicDoc | null> {
    return TopicModel.findByIdAndDelete(id).exec();
  },
  list(): Promise<TopicDoc[]> {
    return TopicModel.find().sort({ slug: 1 }).exec();
  },
};
