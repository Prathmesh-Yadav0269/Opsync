import mongoose from 'mongoose';

const chatRoomSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['one-to-one', 'team'],
      required: true,
      index: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      index: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Guarantee exactly one primary team chat room per team in MongoDB
chatRoomSchema.index(
  { type: 1, team: 1 },
  { unique: true, partialFilterExpression: { type: 'team', team: { $type: 'objectId' } } }
);

chatRoomSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);
