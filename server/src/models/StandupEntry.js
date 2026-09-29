import mongoose from 'mongoose';

const standupEntrySchema = new mongoose.Schema(
  {
    user: {
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
    dateKey: {
      type: String, // Format: 'YYYY-MM-DD'
      required: true,
    },
    completedTasks: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
        title: { type: String, required: true },
        priority: { type: String, default: 'Medium' },
        completedAt: { type: Date, default: Date.now },
      },
    ],
    inProgressTasks: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
        title: { type: String, required: true },
        priority: { type: String, default: 'Medium' },
        status: { type: String, default: 'In Progress' },
        hoursLogged: { type: Number, default: 0 },
      },
    ],
    blockers: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
        title: { type: String, required: true },
        priority: { type: String, default: 'High' },
      },
    ],
    activeDuration: {
      type: Number, // In seconds (authoritative from WorkSession)
      default: 0,
    },
    interruptions: {
      type: Number,
      default: 0,
    },
    userContext: {
      type: String,
      default: '',
      trim: true,
      maxLength: 2000,
    },
  },
  {
    timestamps: true,
  }
);

// Idempotent uniqueness: one standup per user per day
standupEntrySchema.index({ user: 1, dateKey: 1 }, { unique: true });
standupEntrySchema.index({ team: 1, dateKey: 1 });

standupEntrySchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const StandupEntry = mongoose.model('StandupEntry', standupEntrySchema);
