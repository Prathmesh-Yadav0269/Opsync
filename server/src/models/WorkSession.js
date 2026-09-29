import mongoose from 'mongoose';

const pauseIntervalSchema = new mongoose.Schema(
  {
    start: {
      type: Date,
      required: true,
    },
    end: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const workSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    start: {
      type: Date,
      required: true,
    },
    end: {
      type: Date,
      default: null,
    },
    state: {
      type: String,
      enum: ['active', 'paused', 'completed'],
      default: 'active',
    },
    pauses: [pauseIntervalSchema],
    activeDuration: {
      type: Number, // Authoritative duration in seconds
      default: 0,
    },
    interruptions: {
      type: Number, // Interruption/pause count
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast single-active-session queries and Phase 5 analytics aggregation
workSessionSchema.index({ user: 1, state: 1 });
workSessionSchema.index({ user: 1, createdAt: -1 });
workSessionSchema.index({ task: 1, createdAt: -1 });

/**
 * Authoritative duration calculation excluding all paused intervals
 */
workSessionSchema.methods.calculateActiveDuration = function (currentEndTime = new Date()) {
  const sessionEnd = this.end || currentEndTime;
  const totalSessionMs = Math.max(0, new Date(sessionEnd).getTime() - new Date(this.start).getTime());

  let totalPausedMs = 0;
  for (const p of this.pauses) {
    const pauseEnd = p.end || currentEndTime;
    const intervalMs = Math.max(0, new Date(pauseEnd).getTime() - new Date(p.start).getTime());
    totalPausedMs += intervalMs;
  }

  const activeMs = Math.max(0, totalSessionMs - totalPausedMs);
  return Math.round(activeMs / 1000); // Integer seconds
};

workSessionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const WorkSession = mongoose.model('WorkSession', workSessionSchema);
