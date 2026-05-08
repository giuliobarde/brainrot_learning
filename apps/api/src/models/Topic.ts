import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export interface TopicDoc extends Document<Types.ObjectId> {
  slug: string;
  displayName: string;
  accentColor?: string;
  iconKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TopicSchema = new Schema<TopicDoc>(
  {
    slug: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    accentColor: { type: String, trim: true },
    iconKey: { type: String, trim: true },
  },
  { timestamps: true },
);

export const TopicModel: Model<TopicDoc> = model<TopicDoc>('Topic', TopicSchema);
