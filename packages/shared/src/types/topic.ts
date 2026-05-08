export interface Topic {
  id: string;
  slug: string;
  displayName: string;
  accentColor?: string;
  iconKey?: string;
}

export interface TopicSummary {
  topic: Topic;
  videoCount: number;
  latestThumbnailUrl?: string;
}
