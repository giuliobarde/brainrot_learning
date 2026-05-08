import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type SourceMaterialKind = 'text' | 'pdf' | 'docx' | 'markdown' | 'url';

export interface SourceMaterialDoc extends Document<Types.ObjectId> {
  ownerId: Types.ObjectId;
  kind: SourceMaterialKind;
  originalFilename?: string;
  mimeType?: string;
  storagePath?: string;
  extractedText: string;
  charCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const SourceMaterialSchema = new Schema<SourceMaterialDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: ['text', 'pdf', 'docx', 'markdown', 'url'],
    },
    originalFilename: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    storagePath: { type: String, trim: true },
    extractedText: { type: String, required: true },
    charCount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

SourceMaterialSchema.index({ ownerId: 1, createdAt: -1 });

export const SourceMaterialModel: Model<SourceMaterialDoc> = model<SourceMaterialDoc>(
  'SourceMaterial',
  SourceMaterialSchema,
);
