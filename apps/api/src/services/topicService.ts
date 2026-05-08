import { slugify } from '../lib/slug';
import type { TopicDoc } from '../models/Topic';
import { topicRepository } from '../repositories/topicRepository';

export const topicService = {
  ensure(displayName: string, extras: { accentColor?: string; iconKey?: string } = {}) {
    const slug = slugify(displayName);
    return topicRepository.upsert({ slug, displayName, ...extras });
  },
  list(): Promise<TopicDoc[]> {
    return topicRepository.list();
  },
};
