import mongoose from 'mongoose';
import crypto from 'crypto';

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Meeting title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    meetingId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      default: () => crypto.randomUUID(),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      index: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: ['scheduled', 'active', 'ended'],
      default: 'active',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

meetingSchema.index({ team: 1, status: 1 });
meetingSchema.index({ participants: 1, status: 1 });

meetingSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const Meeting = mongoose.model('Meeting', meetingSchema);
